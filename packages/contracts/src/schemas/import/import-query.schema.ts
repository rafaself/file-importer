import { ImportRowStatus } from "@csv/shared";
import z from "zod";

const MAX_PAGE_SIZE = 100;
const MAX_PAGE_OFFSET = 100_000;

const limitQuerySchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(MAX_PAGE_SIZE))
  .optional();

const offsetQuerySchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(0).max(MAX_PAGE_OFFSET))
  .optional();

const pageQuerySchema = z.strictObject({
  limit: limitQuerySchema,
  offset: offsetQuerySchema,
});

export const importListQuerySchema = pageQuerySchema.transform(
  ({ limit, offset }) => ({
    limit: limit ?? 20,
    offset: offset ?? 0,
  }),
);

export const importRowsQuerySchema = pageQuerySchema
  .extend({
    status: z.enum([ImportRowStatus.VALID, ImportRowStatus.INVALID]).optional(),
  })
  .transform(({ limit, offset, status }) => ({
    limit: limit ?? 50,
    offset: offset ?? 0,
    ...(status === undefined ? {} : { status }),
  }));
