import { Import, ImportRow } from '@csv/database';
import { ImportRowStatus, ImportStatus } from '@csv/shared';
import { Injectable } from '@nestjs/common';
import { InjectDisk, StorageDisk } from '@nestjs/storage';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CsvFileError,
  parseCustomerRecords,
  parseCustomerRows,
  type CustomerRowOutcome,
} from './csv-parser.js';

const ROW_BATCH_SIZE = 100;

type ImportRowCounts = {
  processedRows: number;
  successRows: number;
  failedRows: number;
};

@Injectable()
export class ImportProcessingService {
  constructor(
    @InjectRepository(Import)
    private readonly imports: Repository<Import>,
    @InjectRepository(ImportRow)
    private readonly rows: Repository<ImportRow>,
    @InjectDisk('private')
    private readonly sourceDisk: StorageDisk,
  ) {}

  async processImport(importId: string): Promise<ImportRowCounts> {
    const record = await this.imports.findOneBy({ id: importId });
    if (!record) throw new Error(`Import ${importId} was not found.`);

    let totalRows: number | null = null;
    const existingCounts = await this.getRowCounts(importId);
    await this.imports.update(importId, {
      status: ImportStatus.PROCESSING,
      totalRows: null,
      ...existingCounts,
      failureReason: null,
      startedAt: new Date(),
      completedAt: null,
    });

    try {
      const countingSource = await this.sourceDisk.get(record.storageKey);
      let countedRows = 0;
      for await (const _row of parseCustomerRecords(countingSource.body)) {
        countedRows++;
      }
      if (existingCounts.processedRows > countedRows) {
        throw new Error('CSV row count changed between processing passes.');
      }
      totalRows = countedRows;
      await this.imports.update(importId, { totalRows });

      const processingSource = await this.sourceDisk.get(record.storageKey);
      let batch: CustomerRowOutcome[] = [];
      let processedThisPass = 0;
      for await (const outcome of parseCustomerRows(processingSource.body)) {
        processedThisPass++;
        batch.push(outcome);
        if (batch.length === ROW_BATCH_SIZE) {
          await this.persistBatch(importId, record, batch);
          batch = [];
        }
      }
      if (batch.length > 0) await this.persistBatch(importId, record, batch);

      if (processedThisPass !== totalRows) {
        throw new Error('CSV row count changed between processing passes.');
      }
      const counts = await this.getRowCounts(importId);
      if (counts.processedRows !== totalRows) {
        throw new Error('CSV row count changed between processing passes.');
      }
      await this.imports.update(importId, {
        ...counts,
        totalRows: counts.processedRows,
        status: ImportStatus.COMPLETED,
        failureReason: null,
        completedAt: new Date(),
      });
      return counts;
    } catch (error) {
      const counts = await this.getRowCounts(importId);
      const failureReason =
        error instanceof CsvFileError
          ? error.message
          : 'Import processing failed.';

      await this.imports.update(importId, {
        ...counts,
        totalRows,
        status: ImportStatus.FAILED,
        failureReason,
        completedAt: new Date(),
      });
      throw new Error(failureReason);
    }
  }

  private async persistBatch(
    importId: string,
    record: Import,
    outcomes: CustomerRowOutcome[],
  ): Promise<void> {
    await this.rows.manager.transaction(async (manager) => {
      const rows = manager.getRepository(ImportRow);
      await rows.upsert(
        outcomes.map((outcome) =>
          rows.create({
            import: record,
            rowNumber: outcome.rowNumber,
            status: outcome.status,
            rawValue: outcome.rawValue,
            issues: outcome.issues,
          }),
        ),
        { conflictPaths: ['import', 'rowNumber'] },
      );

      const counts = await this.getRowCounts(importId, rows);
      await manager.getRepository(Import).update(importId, counts);
    });
  }

  private async getRowCounts(
    importId: string,
    rows: Repository<ImportRow> = this.rows,
  ): Promise<ImportRowCounts> {
    const grouped = await rows
      .createQueryBuilder('row')
      .select('row.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('row.importId = :importId', { importId })
      .groupBy('row.status')
      .getRawMany<{ status: ImportRowStatus; count: string }>();

    const counts: Record<ImportRowStatus, number> = {
      [ImportRowStatus.VALID]: 0,
      [ImportRowStatus.INVALID]: 0,
      [ImportRowStatus.PENDING]: 0,
    };
    for (const row of grouped) counts[row.status] = Number(row.count);

    return {
      processedRows: counts.valid + counts.invalid,
      successRows: counts.valid,
      failedRows: counts.invalid,
    };
  }
}
