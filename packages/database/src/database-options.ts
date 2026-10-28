import "reflect-metadata";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DataSourceOptions } from "typeorm";
import { entities } from "./entities.js";

const migrationsGlob = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
  "**/*{.ts,.js}",
);

export function createDatabaseOptions(databaseUrl: string) {
  return {
    type: "postgres",
    url: databaseUrl,
    synchronize: false,
    entities,
    migrations: [migrationsGlob],
  } satisfies DataSourceOptions;
}
