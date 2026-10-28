import z from "zod";
import { parseEnv, requiredString } from "./validation.js";

const databaseEnvSchema = z.object({
  DATABASE_URL: requiredString
    .pipe(z.url({ protocol: /^postgres(?:ql)?$/ }))
    .refine((value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return Boolean(url.hostname && url.pathname.length > 1);
    }, "Expected a PostgreSQL URL with a host and database name."),
});

export function loadDatabaseConfig(env: NodeJS.ProcessEnv): string {
  return parseEnv(databaseEnvSchema, env).DATABASE_URL;
}
