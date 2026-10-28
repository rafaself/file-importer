import { ImportStatus } from "@csv/shared";
import { describe, expect, it } from "vitest";
import { updateImportSchema } from "./update-import.schema.js";

const zeroRowImport = {
  storageKey: "source-key",
  status: ImportStatus.COMPLETED,
  totalRows: 0,
  processedRows: 0,
  successRows: 0,
  failedRows: 0,
  rows: [],
};

describe("updateImportSchema", () => {
  it("accepts a header-only import with zero data rows", () => {
    expect(updateImportSchema.safeParse(zeroRowImport).success).toBe(true);
  });

  it("rejects negative total row counts", () => {
    const result = updateImportSchema.safeParse({
      ...zeroRowImport,
      totalRows: -1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["totalRows"] }),
        ]),
      );
    }
  });
});
