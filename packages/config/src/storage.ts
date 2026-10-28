import z from "zod";
import { httpUrlSchema, parseEnv, requiredString } from "./validation.js";

const storageEnvSchema = z.discriminatedUnion("STORAGE_DRIVER", [
  z.object({
    STORAGE_DRIVER: z.literal("local"),
    STORAGE_ROOT: requiredString,
    SIGNING_KEY: requiredString,
    BASE_URL: httpUrlSchema,
  }),
  z.object({
    STORAGE_DRIVER: z.literal("s3"),
    S3_ENDPOINT: httpUrlSchema,
    S3_REGION: requiredString,
    S3_APP_BUCKET: requiredString,
    S3_PRIVATE_BUCKET: requiredString,
    PUBLIC_URL: httpUrlSchema,
  }),
]);

export interface LocalObjectStorage {
  root: string;
  signingKey: string;
  baseUrl: string;
}

export interface S3ObjectStorage {
  endpoint?: string;
  region: string;
  publicBucket: string;
  privateBucket: string;
  publicUrl: string;
}

export type StorageConfig =
  | {
      driver: "local";
      objectStorage: LocalObjectStorage;
    }
  | {
      driver: "s3";
      objectStorage: S3ObjectStorage;
    };

export function loadStorageConfig(env: NodeJS.ProcessEnv): StorageConfig {
  const values = parseEnv(storageEnvSchema, {
    ...env,
    STORAGE_DRIVER: env.STORAGE_DRIVER?.trim().toLowerCase() ?? "local",
  });

  if (values.STORAGE_DRIVER === "local") {
    return {
      driver: "local",
      objectStorage: {
        root: values.STORAGE_ROOT,
        signingKey: values.SIGNING_KEY,
        baseUrl: values.BASE_URL,
      },
    };
  }

  return {
    driver: "s3",
    objectStorage: {
      endpoint: values.S3_ENDPOINT,
      region: values.S3_REGION,
      publicBucket: values.S3_APP_BUCKET,
      privateBucket: values.S3_PRIVATE_BUCKET,
      publicUrl: values.PUBLIC_URL,
    },
  };
}
