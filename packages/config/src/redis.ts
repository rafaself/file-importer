import z from "zod";
import { parseEnv, portSchema, requiredString } from "./validation.js";

const redisEnvSchema = z
  .object({
    REDIS_HOST: requiredString,
    REDIS_PORT: portSchema,
  })
  .transform(({ REDIS_HOST: host, REDIS_PORT: port }) => ({ host, port }));

export type RedisConfig = z.infer<typeof redisEnvSchema>;

export function loadRedisConfig(env: NodeJS.ProcessEnv): RedisConfig {
  return parseEnv(redisEnvSchema, env);
}
