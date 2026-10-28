import { Import, ImportRow } from '@csv/database';
import { ImportRowStatus, ImportStatus } from '@csv/shared';
import type { StorageDisk } from '@nestjs/storage';
import type { Repository } from 'typeorm';
import { Readable } from 'node:stream';
import { ImportProcessingService } from './import-processing.service.js';

const importId = '842773bc-df96-42bb-8be1-ec2e9c5e7409';

function createService(csv: string) {
  const record = Object.assign(new Import(), {
    id: importId,
    storageKey: 'private-source.csv',
  });
  const imports = {
    findOneBy: vi.fn().mockResolvedValue(record),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
  };
  const rawRows: Array<{ status: ImportRowStatus; count: string }> = [];
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    getRawMany: vi.fn().mockImplementation(async () => rawRows),
  };
  const rows = {
    create: vi.fn((row) => row),
    upsert: vi.fn().mockImplementation(async (row) => {
      const existing = rawRows.find((item) => item.status === row.status);
      if (existing) existing.count = String(Number(existing.count) + 1);
      else rawRows.push({ status: row.status, count: '1' });
    }),
    createQueryBuilder: vi.fn(() => queryBuilder),
  };
  const sourceDisk = {
    get: vi.fn().mockResolvedValue({ body: Readable.from([csv]) }),
  };
  const service = new ImportProcessingService(
    imports as unknown as Repository<Import>,
    rows as unknown as Repository<ImportRow>,
    sourceDisk as unknown as StorageDisk,
  );

  return { service, imports, rows, sourceDisk, record, rawRows };
}

describe('ImportProcessingService', () => {
  it('upserts generic raw row outcomes, then completes with counts', async () => {
    const { service, imports, rows, rawRows, record } = createService(
      'name,email,company\n Ana , ana@example.com , Example \nBob,invalid,Example\n',
    );

    await expect(service.processImport(importId)).resolves.toEqual({
      processedRows: 2,
      successRows: 1,
      failedRows: 1,
    });

    expect(rows.upsert).toHaveBeenCalledTimes(2);
    expect(rows.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        import: record,
        rowNumber: 1,
        status: ImportRowStatus.VALID,
        rawValue: {
          name: ' Ana ',
          email: ' ana@example.com ',
          company: ' Example ',
        },
        issues: [],
      }),
      { conflictPaths: ['import', 'rowNumber'] },
    );
    expect(rows.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        rowNumber: 2,
        status: ImportRowStatus.INVALID,
        rawValue: {
          name: 'Bob',
          email: 'invalid',
          company: 'Example',
        },
        issues: [expect.objectContaining({ field: 'email' })],
      }),
      { conflictPaths: ['import', 'rowNumber'] },
    );
    expect(imports.update).toHaveBeenNthCalledWith(
      1,
      importId,
      expect.objectContaining({
        status: ImportStatus.PROCESSING,
        totalRows: null,
      }),
    );
    expect(imports.update).toHaveBeenNthCalledWith(
      2,
      importId,
      expect.objectContaining({
        status: ImportStatus.COMPLETED,
        totalRows: 2,
        processedRows: 2,
        successRows: 1,
        failedRows: 1,
      }),
    );
    expect(rawRows).toEqual([
      { status: ImportRowStatus.VALID, count: '1' },
      { status: ImportRowStatus.INVALID, count: '1' },
    ]);
  });

  it('marks file-level parser errors failed and throws a bounded reason', async () => {
    const { service, imports, rows } = createService(
      'wrong,email,company\nAna,ana@example.com,Example\n',
    );

    await expect(service.processImport(importId)).rejects.toThrow(
      'CSV header must be exactly name,email,company.',
    );
    expect(rows.upsert).not.toHaveBeenCalled();
    expect(imports.update).toHaveBeenLastCalledWith(
      importId,
      expect.objectContaining({
        status: ImportStatus.FAILED,
        totalRows: null,
        processedRows: 0,
        successRows: 0,
        failedRows: 0,
        failureReason: 'CSV header must be exactly name,email,company.',
      }),
    );
  });

  it('marks source read failures failed without exposing storage errors', async () => {
    const { service, imports, sourceDisk } = createService('');
    sourceDisk.get.mockRejectedValue(new Error('sensitive storage detail'));

    await expect(service.processImport(importId)).rejects.toThrow(
      'Import processing failed.',
    );
    expect(imports.update).toHaveBeenLastCalledWith(
      importId,
      expect.objectContaining({
        status: ImportStatus.FAILED,
        failureReason: 'Import processing failed.',
      }),
    );
  });
});
