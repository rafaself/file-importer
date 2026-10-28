export interface RedisConfig {
  host: string;
  port: number;
}

export function loadRedisConfig(env: NodeJS.ProcessEnv): RedisConfig {
  const host = env.REDIS_HOST?.trim();
  const port = Number(env.REDIS_PORT?.trim());

  if (!host) {
    throw new Error("REDIS_HOST is required.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("REDIS_PORT must be an integer between 1 and 65535.");
  }

  return { host, port };
}
