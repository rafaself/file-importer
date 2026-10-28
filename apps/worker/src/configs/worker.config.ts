import {
  loadDatabaseConfig,
  loadRedisConfig,
  loadStorageConfig,
} from '@csv/config';
import { createDatabaseOptions } from '@csv/database';
import { createStorageOptions } from '@csv/storage';
import { registerAs, type ConfigType } from '@nestjs/config';
import type { StorageModuleOptions } from '@nestjs/storage';

export const workerConfig = registerAs('worker', () => ({
  databaseUrl: loadDatabaseConfig(process.env),
  redis: loadRedisConfig(process.env),
  storage: loadStorageConfig(process.env),
}));

export type WorkerConfig = ConfigType<typeof workerConfig>;

export function buildWorkerDatabaseOptions(
  config: WorkerConfig,
): ReturnType<typeof createDatabaseOptions> {
  return createDatabaseOptions(config.databaseUrl);
}

export function buildWorkerQueueOptions(config: WorkerConfig) {
  return {
    connection: {
      ...config.redis,
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
    },
  };
}

export function buildWorkerStorageOptions(
  config: WorkerConfig,
): StorageModuleOptions {
  return createStorageOptions(config.storage);
}
