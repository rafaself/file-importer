import z from "zod";

export const requiredString = z.string().trim().min(1);
export const httpUrlSchema = requiredString.pipe(
  z.url({ protocol: /^https?$/ }),
);
export const portSchema = z.coerce.number().int().min(1).max(65535);

export function parseEnv<T>(schema: z.ZodType<T>, env: NodeJS.ProcessEnv): T {
  const result = schema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );

    throw new Error(`Invalid environment configuration: ${issues.join("; ")}`);
  }

  return result.data;
}
