import type z from "zod";
import type {
  importAcceptedResponseSchema,
  importDetailResponseSchema,
  importListItemSchema,
  importListResponseSchema,
  importPageSchema,
  importRowResponseSchema,
  importRowsPageResponseSchema,
} from "../schemas/import/import-response.schema.js";
import type {
  importListQuerySchema,
  importRowsQuerySchema,
} from "../schemas/import/import-query.schema.js";

export type ImportListItemDto = z.infer<typeof importListItemSchema>;
export type ImportAcceptedResponseDto = z.infer<
  typeof importAcceptedResponseSchema
>;
export type ImportListResponseDto = z.infer<typeof importListResponseSchema>;
export type ImportDetailResponseDto = z.infer<
  typeof importDetailResponseSchema
>;
export type ImportPageDto = z.infer<typeof importPageSchema>;
export type ImportRowResponseDto = z.infer<typeof importRowResponseSchema>;
export type ImportRowsPageResponseDto = z.infer<
  typeof importRowsPageResponseSchema
>;
export type ImportListQueryDto = z.infer<typeof importListQuerySchema>;
export type ImportRowsQueryDto = z.infer<typeof importRowsQuerySchema>;
