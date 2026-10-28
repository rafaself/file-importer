import {
  loadApiConfig,
  loadDatabaseConfig,
  loadRedisConfig,
  loadStorageConfig,
} from "../src/index.js";

const apiEnv = {
  API_HOST: " localhost ",
  API_PORT: " 3010 ",
  API_URL: " http://localhost:3010 ",
};
const localEnv = {
  STORAGE_ROOT: " /tmp/imports ",
  SIGNING_KEY: " test-signing-key ",
  BASE_URL: " http://localhost:3010/files ",
};
const s3Env = {
  STORAGE_DRIVER: " S3 ",
  S3_ENDPOINT: " https://objects.example.com ",
  S3_REGION: " us-east-1 ",
  S3_APP_BUCKET: " public ",
  S3_PRIVATE_BUCKET: " private ",
  PUBLIC_URL: " https://cdn.example.com ",
};

describe("API and Redis configuration", () => {
  it("normalizes values and ignores unrelated environment variables", () => {
    expect(loadApiConfig({ ...apiEnv, PATH: "/usr/bin" })).toEqual({
      apiHost: "localhost",
      apiPort: 3010,
      apiUrl: "http://localhost:3010",
    });
    expect(
      loadRedisConfig({ REDIS_HOST: " localhost ", REDIS_PORT: "6379" }),
    ).toEqual({
      host: "localhost",
      port: 6379,
    });
  });

  it.each([undefined, "", " ", "0", "65536", "1.5", "oops", "Infinity"])(
    "rejects invalid API and Redis port %j",
    (port) => {
      expect(() => loadApiConfig({ ...apiEnv, API_PORT: port })).toThrow(
        /API_PORT:/,
      );
      expect(() =>
        loadRedisConfig({ REDIS_HOST: "localhost", REDIS_PORT: port }),
      ).toThrow(/REDIS_PORT:/);
    },
  );

  it("accepts boundary ports and preserves numeric coercion", () => {
    for (const port of ["1", "65535", "1e3"]) {
      expect(loadApiConfig({ ...apiEnv, API_PORT: port }).apiPort).toBe(
        Number(port),
      );
      expect(
        loadRedisConfig({ REDIS_HOST: "localhost", REDIS_PORT: port }).port,
      ).toBe(Number(port));
    }
  });

  it("reports missing hosts and invalid API URLs", () => {
    expect(() => loadApiConfig({ ...apiEnv, API_HOST: " " })).toThrow(
      /API_HOST:/,
    );
    expect(() => loadRedisConfig({ REDIS_PORT: "6379" })).toThrow(
      /REDIS_HOST:/,
    );
    for (const url of [
      undefined,
      "",
      "localhost:3010",
      "ftp://localhost",
      "not a URL",
    ]) {
      expect(() => loadApiConfig({ ...apiEnv, API_URL: url })).toThrow(
        /API_URL:/,
      );
    }
  });
});

describe("database configuration", () => {
  it("accepts PostgreSQL URLs and preserves credentials and query parameters", () => {
    for (const url of [
      "postgres://user:password@localhost:5432/imports?sslmode=require",
      "postgresql://user:p%40ss@localhost:5432/imports",
      "postgres://localhost/imports",
    ]) {
      expect(loadDatabaseConfig({ DATABASE_URL: ` ${url} ` })).toBe(url);
    }
  });

  it.each([
    undefined,
    "",
    "not-a-url",
    "https://localhost/imports",
    "postgres:imports",
    "postgres://localhost/",
  ])("rejects invalid database URL %j", (url) => {
    expect(() => loadDatabaseConfig({ DATABASE_URL: url })).toThrow(
      /DATABASE_URL:/,
    );
  });
});

describe("storage configuration", () => {
  it("defaults to local storage and preserves its return shape", () => {
    expect(loadStorageConfig(localEnv)).toEqual({
      driver: "local",
      objectStorage: {
        root: "/tmp/imports",
        signingKey: "test-signing-key",
        baseUrl: "http://localhost:3010/files",
      },
    });
    expect(
      loadStorageConfig({ ...localEnv, STORAGE_DRIVER: " LOCAL " }).driver,
    ).toBe("local");
  });

  it("validates only the selected storage branch", () => {
    expect(loadStorageConfig(s3Env)).toEqual({
      driver: "s3",
      objectStorage: {
        endpoint: "https://objects.example.com",
        region: "us-east-1",
        publicBucket: "public",
        privateBucket: "private",
        publicUrl: "https://cdn.example.com",
      },
    });
  });

  it("reports every missing field for the selected driver", () => {
    for (const key of ["STORAGE_ROOT", "SIGNING_KEY", "BASE_URL"]) {
      expect(() =>
        loadStorageConfig({ ...localEnv, [key]: undefined }),
      ).toThrow(new RegExp(`${key}:`));
    }
    for (const key of [
      "S3_ENDPOINT",
      "S3_REGION",
      "S3_APP_BUCKET",
      "S3_PRIVATE_BUCKET",
      "PUBLIC_URL",
    ]) {
      expect(() => loadStorageConfig({ ...s3Env, [key]: " " })).toThrow(
        new RegExp(`${key}:`),
      );
    }
    expect(() =>
      loadStorageConfig({ ...localEnv, STORAGE_DRIVER: "unknown" }),
    ).toThrow(/STORAGE_DRIVER:/);
  });

  it("rejects malformed storage URLs", () => {
    expect(() =>
      loadStorageConfig({ ...localEnv, BASE_URL: "localhost:3010" }),
    ).toThrow(/BASE_URL:/);
    expect(() =>
      loadStorageConfig({ ...s3Env, S3_ENDPOINT: "not a URL" }),
    ).toThrow(/S3_ENDPOINT:/);
    expect(() =>
      loadStorageConfig({ ...s3Env, PUBLIC_URL: "ftp://example.com" }),
    ).toThrow(/PUBLIC_URL:/);
  });

  it("includes variable names without exposing credentials or input values", () => {
    const secret = "do-not-log-this-secret";
    const invalidStorage = () =>
      loadStorageConfig({
        ...localEnv,
        SIGNING_KEY: secret,
        BASE_URL: `invalid-${secret}`,
      });
    expect(invalidStorage).toThrow(/BASE_URL:/);
    expect(invalidStorage).not.toThrow(secret);

    const invalidDatabase = () =>
      loadDatabaseConfig({
        DATABASE_URL: `https://user:${secret}@example.com/imports`,
      });
    expect(invalidDatabase).toThrow(/DATABASE_URL:/);
    expect(invalidDatabase).not.toThrow(secret);
  });
});
