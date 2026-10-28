import { Test, TestingModule } from '@nestjs/testing';
import { ImportService } from './import.service.js';
import { Import } from '@csv/database';
import { ImportStatus } from '@csv/shared';
import { getRepositoryToken } from '@nestjs/typeorm';
import { storageConfig } from '../../configs/storage.config.js';

describe('ImportService', () => {
  let service: ImportService;
  let repository: { save: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    repository = { save: vi.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: getRepositoryToken(Import), useValue: repository },
        { provide: storageConfig.KEY, useValue: {} },
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
});
