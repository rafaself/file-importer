import { loadRedisConfig, type RedisConfig } from '@csv/config';
import { registerAs } from '@nestjs/config';

export const queueConfig = registerAs('queue', () =>
  loadRedisConfig(process.env),
);

export function buildQueueOptions(config: RedisConfig) {
  return {
    connection: {
      ...config,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
    },
  };
}
