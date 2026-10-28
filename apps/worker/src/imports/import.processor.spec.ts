import { Import } from '@csv/database';
import { ImportStatus, PROCESS_IMPORT_JOB } from '@csv/shared';
import { Logger } from '@nestjs/common';
import { getDiskToken } from '@nestjs/storage';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { Readable } from 'node:stream';
import { ImportProcessor } from './import.processor.js';

const importId = '842773bc-df96-42bb-8be1-ec2e9c5e7409';

function makeJob(data: unknown = { importId }, name = PROCESS_IMPORT_JOB) {
  return { name, data } as Job<unknown>;
}

describe('ImportProcessor', () => {
  let processor: ImportProcessor;
  let repository: {
    findOneBy: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let disk: { get: ReturnType<typeof vi.fn> };
  let logCalls: unknown[][];

  beforeEach(async () => {
    repository = { findOneBy: vi.fn(), save: vi.fn() };
    disk = { get: vi.fn() };
    logCalls = [];
    vi.spyOn(Logger.prototype, 'log').mockImplementation(
      (...args: unknown[]) => {
        logCalls.push(args);
      },
    );
    const module = await Test.createTestingModule({
      providers: [
        ImportProcessor,
        { provide: getRepositoryToken(Import), useValue: repository },
        { provide: getDiskToken('private'), useValue: disk },
      ],
    }).compile();
    processor = module.get(ImportProcessor);
  });

  afterEach(() => vi.restoreAllMocks());

  it('reads the source stream without changing the pending import or logging its contents', async () => {
    const content = 'private-customer-data';
    const body = Readable.from([Buffer.from(content)]);
    const record = Object.assign(new Import(), {
      id: importId,
      status: ImportStatus.PENDING,
      storageKey: 'stored-source.csv',
    });
    repository.findOneBy.mockResolvedValue(record);
    disk.get.mockResolvedValue({ body });

    await processor.process(makeJob());

    expect(repository.findOneBy).toHaveBeenCalledExactlyOnceWith({
      id: importId,
    });
    expect(disk.get).toHaveBeenCalledExactlyOnceWith(record.storageKey);
    expect(body.readableEnded).toBe(true);
    expect(record.status).toBe(ImportStatus.PENDING);
    expect(repository.save).not.toHaveBeenCalled();
    const logs = logCalls.flat().join(' ');
    expect(logs).toContain(importId);
    expect(logs).not.toContain(content);
    expect(logs).not.toContain(record.storageKey);
  });

  it('rejects unknown job names before accessing storage or the database', async () => {
    await expect(
      processor.process(makeJob({ importId }, 'unknown')),
    ).rejects.toThrow('Unsupported import job name.');
    expect(repository.findOneBy).not.toHaveBeenCalled();
    expect(disk.get).not.toHaveBeenCalled();
  });

  it.each([null, {}, { importId: 'invalid' }, { importId, extra: true }])(
    'rejects invalid job data %j',
    async (data) => {
      await expect(processor.process(makeJob(data))).rejects.toThrow(
        'Invalid import job: expected a UUID importId.',
      );
      expect(repository.findOneBy).not.toHaveBeenCalled();
      expect(disk.get).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing import before reading a source file', async () => {
    repository.findOneBy.mockResolvedValue(null);

    await expect(processor.process(makeJob())).rejects.toThrow(
      `Import ${importId} was not found.`,
    );
    expect(disk.get).not.toHaveBeenCalled();
  });

  it('propagates unreadable-source failures without changing the import', async () => {
    const failure = new Error('Source is unavailable');
    repository.findOneBy.mockResolvedValue({ storageKey: 'missing.csv' });
    disk.get.mockRejectedValue(failure);

    await expect(processor.process(makeJob())).rejects.toBe(failure);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('propagates errors encountered while reading the source stream', async () => {
    const failure = new Error('Source stream failed');
    const body = Readable.from(
      (async function* () {
        yield Buffer.from('partial data');
        throw failure;
      })(),
    );
    repository.findOneBy.mockResolvedValue({ storageKey: 'source.csv' });
    disk.get.mockResolvedValue({ body });

    await expect(processor.process(makeJob())).rejects.toBe(failure);
    expect(body.destroyed).toBe(true);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
