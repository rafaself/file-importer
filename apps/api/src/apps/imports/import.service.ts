import {
  type CreateImportDto,
  type ImportDetailResponseDto,
  type ImportListQueryDto,
  type ImportListResponseDto,
  type ImportRowsPageResponseDto,
  type ImportRowsQueryDto,
} from '@csv/contracts';
import { Import, ImportRow } from '@csv/database';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  IMPORT_QUEUE,
  PROCESS_IMPORT_JOB,
  ImportStatus,
  type ImportJobData,
} from '@csv/shared';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { storageConfig } from '../../configs/storage.config.js';
import type { StorageConfig } from '@csv/config';
import { unlink } from 'node:fs/promises';
import path, { isAbsolute, relative, resolve } from 'node:path';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);
  private readonly queueFailureReason =
    'Import could not be queued. You can retry it.';

  constructor(
    @InjectRepository(Import)
    private readonly repository: Repository<Import>,
    @InjectRepository(ImportRow)
    private readonly rowRepository: Repository<ImportRow>,
    @Inject(storageConfig.KEY)
    private readonly storageConfig: StorageConfig,
    @InjectQueue(IMPORT_QUEUE)
    private readonly importQueue: Queue<ImportJobData>,
  ) {}

  isLocalStorage(
    storage: StorageConfig,
  ): storage is Extract<StorageConfig, { driver: 'local' }> {
    return storage.driver === 'local';
  }

  async deleteFile(fileName: string, disk: string) {
    if (!this.isLocalStorage(this.storageConfig)) return;

    const root = resolve(this.storageConfig.objectStorage.root);
    const folderPath = resolve(root, disk);
    const filePath = resolve(folderPath, fileName);

    const relativePath = relative(root, filePath);

    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error('Caminho de arquivo inválido');
    }

    await unlink(filePath);
  }

  async save(data: CreateImportDto) {
    return this.repository.save(data);
  }

  async listImports(query: ImportListQueryDto): Promise<ImportListResponseDto> {
    const [imports, total] = await this.repository.findAndCount({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: query.limit,
      skip: query.offset,
    });

    return {
      items: imports.map((record) => this.toListItem(record)),
      page: { ...query, total },
    };
  }

  async getImport(importId: string): Promise<ImportDetailResponseDto> {
    const record = await this.repository.findOneBy({ id: importId });
    if (!record) throw new NotFoundException('Import was not found.');

    return {
      ...this.toListItem(record),
      startedAt: record.startedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      failureReason: record.failureReason,
    };
  }

  async listImportRows(
    importId: string,
    query: ImportRowsQueryDto,
  ): Promise<ImportRowsPageResponseDto> {
    const record = await this.repository.findOne({
      where: { id: importId },
      select: { id: true },
    });
    if (!record) throw new NotFoundException('Import was not found.');

    const where = {
      import: { id: importId },
      ...(query.status === undefined ? {} : { status: query.status }),
    };
    const [rows, total] = await this.rowRepository.findAndCount({
      where,
      order: { rowNumber: 'ASC' },
      take: query.limit,
      skip: query.offset,
    });

    return {
      items: rows.map((row) => ({
        rowNumber: row.rowNumber,
        status: row.status,
        rawValue: row.rawValue,
        issues: row.issues,
      })),
      page: { limit: query.limit, offset: query.offset, total },
    };
  }

  private toListItem(record: Import): ImportListResponseDto['items'][number] {
    return {
      id: record.id,
      originalFileName: record.originalFileName,
      status: record.status,
      totalRows: record.totalRows,
      processedRows: record.processedRows,
      successRows: record.successRows,
      failedRows: record.failedRows,
      createdAt: record.createdAt.toISOString(),
    };
  }

  async enqueue(importId: string) {
    try {
      await this.addQueueJob(importId);
    } catch (error) {
      this.logger.error(
        `Failed to enqueue import ${importId}`,
        error instanceof Error ? error.message : 'Unknown queue error',
      );
      await this.markQueueFailure(importId);
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: 'Import saved but queue submission failed.',
        id: importId,
      });
    }
  }

  async retry(importId: string) {
    const record = await this.repository.findOneBy({ id: importId });
    if (!record) throw new NotFoundException('Import was not found.');
    if (
      record.status !== ImportStatus.PENDING &&
      record.status !== ImportStatus.FAILED
    ) {
      throw new ConflictException('Only pending or failed imports can retry.');
    }

    const job = await this.importQueue.getJob(importId);
    const jobState = job ? await job.getState() : undefined;
    if (
      jobState !== undefined &&
      jobState !== 'failed' &&
      jobState !== 'completed'
    ) {
      throw new ConflictException('This import is already queued or running.');
    }

    try {
      await this.repository.update(importId, {
        status: ImportStatus.PENDING,
        failureReason: null,
        startedAt: null,
        completedAt: null,
      });

      if (job && jobState) {
        await job.retry(jobState);
      } else {
        await this.addQueueJob(importId);
      }
    } catch (error) {
      this.logger.error(
        `Failed to retry import ${importId}`,
        error instanceof Error ? error.message : 'Unknown queue error',
      );
      await this.markQueueFailure(importId);
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: 'Import could not be queued. You can retry it again.',
        id: importId,
      });
    }

    return { id: importId, status: ImportStatus.PENDING };
  }

  private addQueueJob(importId: string) {
    return this.importQueue.add(
      PROCESS_IMPORT_JOB,
      { importId },
      {
        jobId: importId,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
  }

  private markQueueFailure(importId: string) {
    return this.repository.update(
      { id: importId, status: ImportStatus.PENDING },
      {
        status: ImportStatus.FAILED,
        failureReason: this.queueFailureReason,
        completedAt: new Date(),
      },
    );
  }
}
