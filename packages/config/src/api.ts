import z from "zod";
import {
  httpUrlSchema,
  parseEnv,
  portSchema,
  requiredString,
} from "./validation.js";

const apiEnvSchema = z
  .object({
    API_PORT: portSchema,
    API_URL: httpUrlSchema,
    API_HOST: requiredString,
  })
  .transform(({ API_PORT: apiPort, API_URL: apiUrl, API_HOST: apiHost }) => ({
    apiUrl,
    apiHost,
    apiPort,
  }));

export function loadApiConfig(env: NodeJS.ProcessEnv) {
  return parseEnv(apiEnvSchema, env);
}
