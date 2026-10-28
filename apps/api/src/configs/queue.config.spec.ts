import { loadRedisConfig } from '@csv/config';
import { buildQueueOptions } from './queue.config.js';

describe('queue configuration', () => {
  it('parses Redis settings and disables offline buffering for the HTTP producer', () => {
    const config = loadRedisConfig({
      REDIS_HOST: ' 127.0.0.1 ',
      REDIS_PORT: '6379',
    });

    expect(config).toEqual({ host: '127.0.0.1', port: 6379 });
    expect(buildQueueOptions(config).connection).toMatchObject({
      host: '127.0.0.1',
      port: 6379,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
  });

  it.each([undefined, '', ' ', '0', '65536', '3.5', '6379oops', 'Infinity'])(
    'rejects invalid Redis port %j',
    (port) => {
      expect(() =>
        loadRedisConfig({ REDIS_HOST: 'localhost', REDIS_PORT: port }),
      ).toThrow('REDIS_PORT must be an integer between 1 and 65535.');
    },
  );

  it('accepts an integer port expressed in scientific notation', () => {
    expect(
      loadRedisConfig({ REDIS_HOST: 'localhost', REDIS_PORT: '1e3' }).port,
    ).toBe(1000);
  });

  it('rejects a missing Redis host', () => {
    expect(() => loadRedisConfig({ REDIS_PORT: '6379' })).toThrow(
      'REDIS_HOST is required.',
    );
  });
});
