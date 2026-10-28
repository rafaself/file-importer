import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { ImportProcessingService } from './import-processing.service.js';
import { ImportProcessor } from './import.processor.js';
import { PROCESS_IMPORT_JOB } from '@csv/shared';

const importId = '842773bc-df96-42bb-8be1-ec2e9c5e7409';
const counts = {
  processedRows: 3,
  successRows: 1,
  failedRows: 2,
};

function makeJob(data: unknown = { importId }, name = PROCESS_IMPORT_JOB) {
  return { name, data } as Job<unknown>;
}

describe('ImportProcessor', () => {
  let processor: ImportProcessor;
  let processing: { processImport: ReturnType<typeof vi.fn> };
  let logCalls: unknown[][];

  beforeEach(async () => {
    processing = { processImport: vi.fn().mockResolvedValue(counts) };
    logCalls = [];
    vi.spyOn(Logger.prototype, 'log').mockImplementation(
      (...args: unknown[]) => {
        logCalls.push(args);
      },
    );
    const module = await Test.createTestingModule({
      providers: [
        ImportProcessor,
        { provide: ImportProcessingService, useValue: processing },
      ],
    }).compile();
    processor = module.get(ImportProcessor);
  });

  afterEach(() => vi.restoreAllMocks());

  it('delegates a validated import job and logs only aggregate counts', async () => {
    await processor.process(makeJob());

    expect(processing.processImport).toHaveBeenCalledExactlyOnceWith(importId);
    const logs = logCalls.flat().join(' ');
    expect(logs).toContain(importId);
    expect(logs).toContain('3 rows (1 valid, 2 invalid)');
  });

  it('rejects unknown job names before processing', async () => {
    await expect(
      processor.process(makeJob({ importId }, 'unknown')),
    ).rejects.toThrow('Unsupported import job name.');
    expect(processing.processImport).not.toHaveBeenCalled();
  });

  it.each([null, {}, { importId: 'invalid' }, { importId, extra: true }])(
    'rejects invalid job data %j',
    async (data) => {
      await expect(processor.process(makeJob(data))).rejects.toThrow(
        'Invalid import job: expected a UUID importId.',
      );
      expect(processing.processImport).not.toHaveBeenCalled();
    },
  );
});
