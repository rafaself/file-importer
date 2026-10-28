import type { ImportRowResponseDto } from "@csv/contracts";
import { getImportRows } from "./api";

const EXPORT_PAGE_SIZE = 100;

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildNeedsReviewCsv(rows: ImportRowResponseDto[]): string {
  const columns: string[] = ["row_number"];
  for (const row of rows) {
    for (const field of Object.keys(row.rawValue)) {
      if (!columns.includes(field)) columns.push(field);
    }
  }
  columns.push("issues");

  const lines = [columns.map(csvEscape).join(",")];
  for (const row of rows) {
    const cells = [
      String(row.rowNumber),
      ...columns.slice(1, -1).map((field) => row.rawValue[field] ?? ""),
      row.issues
        .map((issue) => `${issue.field || "row"}: ${issue.message}`)
        .join("; "),
    ];
    lines.push(cells.map(csvEscape).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export async function fetchNeedsReviewRows(
  importId: string,
  signal?: AbortSignal,
): Promise<ImportRowResponseDto[]> {
  const rows: ImportRowResponseDto[] = [];
  let offset = 0;

  for (;;) {
    const page = await getImportRows(
      importId,
      { status: "invalid", limit: EXPORT_PAGE_SIZE, offset },
      signal,
    );
    rows.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.page.total) return rows;
  }
}

export function downloadNeedsReviewCsv(
  fileName: string,
  rows: ImportRowResponseDto[],
): void {
  const baseName =
    fileName.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-") || "import";
  const blob = new Blob([buildNeedsReviewCsv(rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${baseName}-needs-review.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
