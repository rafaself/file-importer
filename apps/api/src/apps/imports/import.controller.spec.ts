import { Test, TestingModule } from '@nestjs/testing';
import { ImportController } from './import.controller.js';
import { ImportService } from './import.service.js';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { StoredUpload } from '@nestjs/storage';
import { ImportStatus } from '@csv/shared';

describe('ImportController', () => {
  let controller: ImportController;
  let service: {
    save: ReturnType<typeof vi.fn>;
    enqueue: ReturnType<typeof vi.fn>;
    deleteFile: ReturnType<typeof vi.fn>;
  };
  const file: StoredUpload = {
    fieldname: 'file',
    originalname: 'customers.csv',
    encoding: '7bit',
    mimetype: 'text/csv',
    size: 32,
    key: 'stored-upload.csv',
    disk: 'private',
    contentType: 'text/csv',
  };

  beforeEach(async () => {
    service = {
      save: vi.fn(),
      enqueue: vi.fn().mockResolvedValue(undefined),
      deleteFile: vi.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImportController],
      providers: [{ provide: ImportService, useValue: service }],
    }).compile();

    controller = module.get<ImportController>(ImportController);
  });

  it('returns only the saved import ID and status', async () => {
    const savedImport = {
      id: '842773bc-df96-42bb-8be1-ec2e9c5e7409',
      status: ImportStatus.PENDING,
      originalFileName: file.originalname,
      storageKey: file.key,
    };
    service.save.mockResolvedValue(savedImport);

    await expect(controller.importData(file)).resolves.toEqual({
      id: savedImport.id,
      status: savedImport.status,
    });
    expect(service.save).toHaveBeenCalledWith({
      originalFileName: file.originalname,
      storageKey: file.key,
    });
    expect(service.enqueue).toHaveBeenCalledExactlyOnceWith(savedImport.id);
    expect(service.deleteFile).not.toHaveBeenCalled();
  });

  it('rejects a missing file without saving or deleting anything', async () => {
    await expect(controller.importData(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(service.save).not.toHaveBeenCalled();
    expect(service.enqueue).not.toHaveBeenCalled();
    expect(service.deleteFile).not.toHaveBeenCalled();
  });

  it('deletes the uploaded file and rethrows the save failure', async () => {
    const failure = new Error('Database insert failed');
    service.save.mockRejectedValue(failure);

    await expect(controller.importData(file)).rejects.toBe(failure);
    expect(service.deleteFile).toHaveBeenCalledExactlyOnceWith(
      file.key,
      file.disk,
    );
    expect(service.enqueue).not.toHaveBeenCalled();
  });

  it('keeps the source file when enqueueing a saved import fails', async () => {
    const id = '842773bc-df96-42bb-8be1-ec2e9c5e7409';
    service.save.mockResolvedValue({ id, status: ImportStatus.PENDING });
    const failure = new ServiceUnavailableException({ id });
    service.enqueue.mockRejectedValue(failure);

    await expect(controller.importData(file)).rejects.toBe(failure);
    expect(service.enqueue).toHaveBeenCalledWith(id);
    expect(service.deleteFile).not.toHaveBeenCalled();
  });
});
