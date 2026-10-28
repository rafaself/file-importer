import { Test, TestingModule } from '@nestjs/testing';
import { ImportService } from './import.service.js';
import { Import, ImportRow } from '@csv/database';
import { ImportStatus, IMPORT_QUEUE, PROCESS_IMPORT_JOB } from '@csv/shared';
import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { storageConfig } from '../../configs/storage.config.js';

describe('ImportService', () => {
  let service: ImportService;
  let repository: { save: ReturnType<typeof vi.fn> };
  let rowRepository: Record<string, never>;
  let queue: { add: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    repository = { save: vi.fn() };
    rowRepository = {};
    queue = { add: vi.fn().mockResolvedValue({}) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: getRepositoryToken(Import), useValue: repository },
        { provide: getRepositoryToken(ImportRow), useValue: rowRepository },
        { provide: storageConfig.KEY, useValue: {} },
        { provide: getQueueToken(IMPORT_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get<ImportService>(ImportService);
  });

  it('returns the persisted import including its generated ID and status', async () => {
    const data = {
      originalFileName: 'customers.csv',
      storageKey: 'stored-upload.csv',
    };
    const savedImport = Object.assign(new Import(), data, {
      id: '842773bc-df96-42bb-8be1-ec2e9c5e7409',
      status: ImportStatus.PENDING,
    });
    repository.save.mockResolvedValue(savedImport);

    await expect(service.save(data)).resolves.toBe(savedImport);
    expect(repository.save).toHaveBeenCalledWith(data);
  });

  it('enqueues only the import ID and retains the job for duplicate suppression', async () => {
    const id = '842773bc-df96-42bb-8be1-ec2e9c5e7409';

    await service.enqueue(id);

    expect(queue.add).toHaveBeenCalledExactlyOnceWith(
      PROCESS_IMPORT_JOB,
      { importId: id },
      { jobId: id, removeOnComplete: false, removeOnFail: false },
    );
  });

  it('reports an enqueue failure with a recoverable import ID', async () => {
    const id = '842773bc-df96-42bb-8be1-ec2e9c5e7409';
    queue.add.mockRejectedValue(new Error('Redis unavailable'));
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    try {
      await expect(service.enqueue(id)).rejects.toMatchObject({
        response: {
          statusCode: 503,
          message: 'Import saved but queue submission failed.',
          id,
        },
      });
      expect(log).toHaveBeenCalledWith(
        `Failed to enqueue import ${id}`,
        'Redis unavailable',
      );
      expect(repository.save).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
