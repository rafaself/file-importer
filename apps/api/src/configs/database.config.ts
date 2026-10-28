import { loadDatabaseConfig } from '@csv/config';
import { createDatabaseOptions } from '@csv/database';
import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  databaseUrl: loadDatabaseConfig(process.env),
}));

export const buildDatabaseOptions = (config: {
  databaseUrl: string;
}): ReturnType<typeof createDatabaseOptions> => {
  const { databaseUrl } = config;
  return createDatabaseOptions(databaseUrl);
};
