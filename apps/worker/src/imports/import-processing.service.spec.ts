import { Import, ImportRow } from '@csv/database';
import { ImportRowStatus, ImportStatus } from '@csv/shared';
import type { StorageDisk } from '@nestjs/storage';
import type { EntityManager, Repository } from 'typeorm';
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
    findOneOrFail: vi.fn().mockResolvedValue(record),
    update: vi.fn().mockImplementation(async (_id, values) => {
      Object.assign(record, values);
      return { affected: 1 };
    }),
  };
  const persistedRows = new Map<number, ImportRow>();
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    getRawMany: vi.fn().mockImplementation(async () => {
      const counts = new Map<ImportRowStatus, number>();
      for (const row of persistedRows.values()) {
        counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
      }
      return Array.from(counts, ([status, count]) => ({
        status,
        count: String(count),
      }));
    }),
  };
  const rows = {
    find: vi.fn().mockImplementation(async ({ where }) =>
      (where.rowNumber.value as number[]).flatMap((rowNumber) => {
        const row = persistedRows.get(rowNumber);
        return row ? [{ rowNumber: row.rowNumber, status: row.status }] : [];
      }),
    ),
    create: vi.fn((row) => row),
    upsert: vi.fn().mockImplementation(async (batch: ImportRow[]) => {
      for (const row of batch) persistedRows.set(row.rowNumber, row);
    }),
    createQueryBuilder: vi.fn(() => queryBuilder),
  };
  const manager = {
    getRepository: vi.fn((entity) => (entity === Import ? imports : rows)),
  };
  const rowsWithManager = Object.assign(rows, {
    manager: {
      transaction: vi.fn(
        async (callback: (transactionalManager: EntityManager) => unknown) =>
          callback(manager as unknown as EntityManager),
      ),
    },
  });
  const sourceStreams: Readable[] = [];
  const sourceDisk = {
    get: vi.fn().mockImplementation(async () => {
      const body = Readable.from([csv]);
      sourceStreams.push(body);
      return { body };
    }),
  };
  const service = new ImportProcessingService(
    imports as unknown as Repository<Import>,
    rowsWithManager as unknown as Repository<ImportRow>,
    sourceDisk as unknown as StorageDisk,
  );

  return {
    service,
    imports,
    rows: rowsWithManager,
    sourceDisk,
    record,
    sourceStreams,
    persistedRows,
    queryBuilder,
  };
}

describe('ImportProcessingService', () => {
  it('counts, then upserts generic raw row outcomes in a transaction', async () => {
    const { service, imports, rows, sourceDisk, sourceStreams, record } =
      createService(
        'name,email,company\n Ana , ana@example.com , Example \nBob,invalid,Example\n',
      );

    await expect(service.processImport(importId)).resolves.toEqual({
      processedRows: 2,
      successRows: 1,
      failedRows: 1,
    });

    expect(sourceDisk.get).toHaveBeenCalledTimes(2);
    expect(sourceStreams.every((stream) => stream.readableEnded)).toBe(true);
    expect(rows.manager.transaction).toHaveBeenCalledOnce();
    expect(rows.upsert).toHaveBeenCalledOnce();
    expect(rows.upsert).toHaveBeenCalledWith(
      [
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
        expect.objectContaining({
          import: record,
          rowNumber: 2,
          status: ImportRowStatus.INVALID,
          rawValue: {
            name: 'Bob',
            email: 'invalid',
            company: 'Example',
          },
          issues: [expect.objectContaining({ field: 'email' })],
        }),
      ],
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
    expect(imports.update).toHaveBeenNthCalledWith(2, importId, {
      totalRows: 2,
    });
    expect(imports.update).toHaveBeenNthCalledWith(3, importId, {
      processedRows: 2,
      successRows: 1,
      failedRows: 1,
    });
    expect(imports.update).toHaveBeenLastCalledWith(
      importId,
      expect.objectContaining({
        status: ImportStatus.COMPLETED,
        totalRows: 2,
        processedRows: 2,
        successRows: 1,
        failedRows: 1,
      }),
    );
  });

  it('updates progress across batches without recounting all persisted rows', async () => {
    const csv = [
      'name,email,company',
      ...Array.from(
        { length: 250 },
        (_, index) =>
          `Customer,${index % 2 === 0 ? 'valid@example.com' : 'invalid'},Example`,
      ),
    ].join('\n');
    const { service, imports, rows, queryBuilder } = createService(csv);

    await expect(service.processImport(importId)).resolves.toEqual({
      processedRows: 250,
      successRows: 125,
      failedRows: 125,
    });

    expect(rows.upsert).toHaveBeenCalledTimes(3);
    expect(
      rows.find.mock.calls.map(
        ([options]) => options.where.rowNumber.value.length,
      ),
    ).toEqual([100, 100, 50]);
    expect(imports.update).toHaveBeenNthCalledWith(3, importId, {
      processedRows: 100,
      successRows: 50,
      failedRows: 50,
    });
    expect(imports.update).toHaveBeenNthCalledWith(4, importId, {
      processedRows: 200,
      successRows: 100,
      failedRows: 100,
    });
    // Reconcile once at startup and once at completion, regardless of batch count.
    expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(2);
    expect(imports.findOneOrFail).toHaveBeenCalledTimes(3);
    expect(imports.findOneOrFail).toHaveBeenCalledWith({
      where: { id: importId },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('replaces existing statuses and preserves rows outside the current batch on retry', async () => {
    const csv = [
      'name,email,company',
      ...Array.from(
        { length: 201 },
        (_, index) =>
          `Customer,${index === 0 ? 'invalid' : 'valid@example.com'},Example`,
      ),
    ].join('\n');
    const { service, imports, persistedRows, queryBuilder } =
      createService(csv);
    for (const [rowNumber, status] of [
      [1, ImportRowStatus.VALID],
      [2, ImportRowStatus.INVALID],
      [3, ImportRowStatus.PENDING],
      [201, ImportRowStatus.VALID],
    ] as const) {
      persistedRows.set(
        rowNumber,
        Object.assign(new ImportRow(), { rowNumber, status }),
      );
    }

    const expectedCounts = {
      processedRows: 201,
      successRows: 200,
      failedRows: 1,
    };
    await expect(service.processImport(importId)).resolves.toEqual(
      expectedCounts,
    );
    expect(imports.update).toHaveBeenNthCalledWith(3, importId, {
      processedRows: 101,
      successRows: 100,
      failedRows: 1,
    });
    expect(persistedRows.size).toBe(201);

    await expect(service.processImport(importId)).resolves.toEqual(
      expectedCounts,
    );
    expect(persistedRows.size).toBe(201);
    expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(4);
  });

  it('reconciles persisted progress after a batch fails and can retry', async () => {
    const csv = [
      'name,email,company',
      ...Array.from(
        { length: 101 },
        () => 'Customer,valid@example.com,Example',
      ),
    ].join('\n');
    const { service, imports, rows } = createService(csv);
    const persist = rows.upsert.getMockImplementation()!;
    rows.upsert
      .mockImplementationOnce(persist)
      .mockRejectedValueOnce(new Error('database error'));

    await expect(service.processImport(importId)).rejects.toThrow(
      'Import processing failed.',
    );
    expect(imports.update).toHaveBeenLastCalledWith(
      importId,
      expect.objectContaining({
        status: ImportStatus.FAILED,
        processedRows: 100,
        successRows: 100,
        failedRows: 0,
      }),
    );

    await expect(service.processImport(importId)).resolves.toEqual({
      processedRows: 101,
      successRows: 101,
      failedRows: 0,
    });
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
