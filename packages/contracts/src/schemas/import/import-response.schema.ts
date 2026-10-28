import { ImportRowStatus, ImportStatus } from "@csv/shared";
import z from "zod";

const MAX_PAGE_SIZE = 100;
const MAX_PAGE_OFFSET = 100_000;
const MAX_ROW_ISSUES = 10;

const importSummarySchema = z.strictObject({
  id: z.uuid(),
  originalFileName: z.string(),
  status: z.enum(ImportStatus),
  totalRows: z.number().int().nonnegative().nullable(),
  processedRows: z.number().int().nonnegative(),
  successRows: z.number().int().nonnegative(),
  failedRows: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});

const hasConsistentCounts = (summary: z.output<typeof importSummarySchema>) =>
  summary.successRows + summary.failedRows === summary.processedRows &&
  (summary.totalRows === null || summary.processedRows <= summary.totalRows) &&
  (summary.status !== ImportStatus.COMPLETED ||
    summary.processedRows === summary.totalRows);

const countInvariant = {
  message: "Import row counts are inconsistent.",
  path: ["processedRows"],
};

const importRowIssueSchema = z.strictObject({
  field: z.string(),
  message: z.string(),
});

export const importListItemSchema = importSummarySchema.refine(
  hasConsistentCounts,
  countInvariant,
);

export const importDetailResponseSchema = importSummarySchema
  .extend({
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    failureReason: z.string().nullable(),
  })
  .refine(hasConsistentCounts, countInvariant);

export const importPageSchema = z.strictObject({
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE),
  offset: z.number().int().min(0).max(MAX_PAGE_OFFSET),
  total: z.number().int().nonnegative(),
});

export const importListResponseSchema = z.strictObject({
  items: z.array(importListItemSchema).max(MAX_PAGE_SIZE),
  page: importPageSchema,
});

export const importRowResponseSchema = z.strictObject({
  rowNumber: z.number().int().positive(),
  status: z.enum(ImportRowStatus),
  rawValue: z.record(z.string(), z.string()),
  issues: z.array(importRowIssueSchema).max(MAX_ROW_ISSUES),
});

export const importRowsPageResponseSchema = z.strictObject({
  items: z.array(importRowResponseSchema).max(MAX_PAGE_SIZE),
  page: importPageSchema,
});
