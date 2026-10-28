import { Import, ImportRow } from '@csv/database';
import { ImportRowStatus, ImportStatus } from '@csv/shared';
import { Injectable } from '@nestjs/common';
import { InjectDisk, StorageDisk } from '@nestjs/storage';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CsvFileError, parseCustomerRows } from './csv-parser.js';

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

    await this.imports.update(importId, {
      status: ImportStatus.PROCESSING,
      totalRows: null,
      processedRows: 0,
      successRows: 0,
      failedRows: 0,
      failureReason: null,
      startedAt: new Date(),
      completedAt: null,
    });

    try {
      const source = await this.sourceDisk.get(record.storageKey);
      for await (const outcome of parseCustomerRows(source.body)) {
        await this.rows.upsert(
          this.rows.create({
            import: record,
            rowNumber: outcome.rowNumber,
            status: outcome.status,
            rawValue: outcome.rawValue,
            issues: outcome.issues,
          }),
          { conflictPaths: ['import', 'rowNumber'] },
        );
      }

      const counts = await this.getRowCounts(importId);
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
        totalRows: null,
        status: ImportStatus.FAILED,
        failureReason,
        completedAt: new Date(),
      });
      throw new Error(failureReason);
    }
  }

  private async getRowCounts(importId: string): Promise<ImportRowCounts> {
    const grouped = await this.rows
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
