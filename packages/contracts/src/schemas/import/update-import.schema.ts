import { ImportStatus } from "@csv/shared";
import z from "zod";
import { createImportSchema } from "./create-import.schema.js";

const MAX_ROWS = 1000;

export const updateImportSchema = createImportSchema
  .partial({
    originalFileName: true,
  })
  .extend({
    status: z.enum(ImportStatus),
    totalRows: z.number().min(0).max(MAX_ROWS),
    processedRows: z.number().min(0).max(MAX_ROWS),
    successRows: z.number().min(0).max(MAX_ROWS),
    failedRows: z.number().min(0).max(MAX_ROWS),
    failureReason: z.string().max(255).optional(),
    startedAt: z.date().optional(),
    completedAt: z.date().optional(),
    rows: z.array(z.string()).max(MAX_ROWS), // Update later with the import row schema
  });
