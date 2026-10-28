import { buildWorkerQueueOptions, type WorkerConfig } from './worker.config.js';

describe('worker queue configuration', () => {
  it('keeps reconnection enabled independently of the HTTP producer settings', () => {
    const config: WorkerConfig = {
      databaseUrl: 'postgres://localhost/imports',
      redis: { host: '127.0.0.1', port: 6379 },
      storage: {
        driver: 'local',
        objectStorage: {
          root: '/tmp/imports',
          signingKey: 'test-key',
          baseUrl: 'http://localhost:3010',
        },
      },
    };

    expect(buildWorkerQueueOptions(config).connection).toEqual({
      host: '127.0.0.1',
      port: 6379,
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
    });
  });
});
