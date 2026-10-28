import { Import } from '@csv/database';
import { IMPORT_QUEUE, PROCESS_IMPORT_JOB, ImportRowStatus } from '@csv/shared';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectDisk, StorageDisk } from '@nestjs/storage';
import { InjectRepository } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { Repository } from 'typeorm';
import z from 'zod';
import { parseCustomerRows } from './csv-parser.js';

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
    let validRows = 0;
    let invalidRows = 0;
    for await (const row of parseCustomerRows(source.body)) {
      if (row.status === ImportRowStatus.VALID) validRows++;
      else invalidRows++;
    }

    this.logger.log(
      `Validated import ${importId}: ${validRows + invalidRows} rows (${validRows} valid, ${invalidRows} invalid).`,
    );
  }
}
