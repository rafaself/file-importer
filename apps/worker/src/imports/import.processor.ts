import { IMPORT_QUEUE, PROCESS_IMPORT_JOB } from '@csv/shared';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import z from 'zod';
import { ImportProcessingService } from './import-processing.service.js';

const importJobSchema = z.strictObject({ importId: z.uuid() });

@Processor(IMPORT_QUEUE, { concurrency: 1 })
export class ImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportProcessor.name);

  constructor(private readonly processing: ImportProcessingService) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== PROCESS_IMPORT_JOB) {
      throw new Error('Unsupported import job name.');
    }

    const result = importJobSchema.safeParse(job.data);
    if (!result.success) {
      throw new Error('Invalid import job: expected a UUID importId.');
    }

    const { importId } = result.data;
    this.logger.log(`Received import ${importId}.`);

    const counts = await this.processing.processImport(importId);

    this.logger.log(
      `Processed import ${importId}: ${counts.processedRows} rows (${counts.successRows} valid, ${counts.failedRows} invalid).`,
    );
  }
}
