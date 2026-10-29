import "reflect-metadata";
import { DataSource } from "typeorm";
import { loadDatabaseConfig } from "@csv/config";
import { createDatabaseOptions } from "./database-options.js";

const dataSource = new DataSource(
  createDatabaseOptions(loadDatabaseConfig(process.env)),
);

await dataSource.initialize();
try {
  const migrations = await dataSource.runMigrations();
  console.log(`Applied ${migrations.length} migration(s).`);
} finally {
  await dataSource.destroy();
}
