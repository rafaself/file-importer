import { Import } from '@csv/database';
import { IMPORT_QUEUE, PROCESS_IMPORT_JOB } from '@csv/shared';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectDisk, StorageDisk } from '@nestjs/storage';
import { InjectRepository } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { Repository } from 'typeorm';
import z from 'zod';

const importJobSchema = z.strictObject({ importId: z.uuid() });

@Processor(IMPORT_QUEUE, { concurrency: 1 })
export class ImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportProcessor.name);

  constructor(
    @InjectRepository(Import)
    private readonly imports: Repository<Import>,
    @InjectDisk('private')
    private readonly sourceDisk: StorageDisk,
  ) {
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

    const record = await this.imports.findOneBy({ id: importId });
    if (!record) {
      throw new Error(`Import ${importId} was not found.`);
    }

    const source = await this.sourceDisk.get(record.storageKey);
    let bytesRead = 0;
    for await (const chunk of source.body) {
      bytesRead += Buffer.byteLength(chunk);
    }

    this.logger.log(
      `Verified source for import ${importId} (${bytesRead} bytes).`,
    );
  }
}
