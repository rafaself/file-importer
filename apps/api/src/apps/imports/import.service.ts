import { CreateImportDto } from '@csv/contracts';
import { Import } from '@csv/database';
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  IMPORT_QUEUE,
  PROCESS_IMPORT_JOB,
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

  constructor(
    @InjectRepository(Import)
    private readonly repository: Repository<Import>,
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

  async enqueue(importId: string) {
    try {
      await this.importQueue.add(
        PROCESS_IMPORT_JOB,
        { importId },
        {
          jobId: importId,
          removeOnComplete: false,
          removeOnFail: false,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue import ${importId}`,
        error instanceof Error ? error.message : 'Unknown queue error',
      );
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: 'Import saved but queue submission failed.',
        id: importId,
      });
    }
  }
}
