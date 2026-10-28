import type z from "zod";
import type { customerRowSchema } from "../schemas/import-row/import-row.schema.js";

export type CustomerRowDto = z.infer<typeof customerRowSchema>;
