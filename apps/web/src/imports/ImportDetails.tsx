import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { ImportRowsPageResponseDto } from "@csv/contracts";
import { isPlainLeftClick } from "../navigation";
import { ApiError, getImportRows, retryImport } from "./api";
import { formatDate, formatDuration, formatStatusLabel } from "./format";
import { downloadNeedsReviewCsv, fetchNeedsReviewRows } from "./needsReviewCsv";
import {
  isActiveStatus,
  isStalledImport,
  useImportPolling,
} from "./useImportPolling";
import { useNow } from "./useNow";

const ROWS_PER_PAGE = 10;

type ImportDetailsProps = {
  importId: string;
  onBack: () => void;
};

function cellValue(value: string | undefined): string {
  return value || "—";
}

function issuesToTitle(issues: { field: string; message: string }[]) {
  if (issues.length === 0) return undefined;
  return issues.map((issue) => `${issue.field}: ${issue.message}`).join("\n");
}

function ImportRowsTable({
  importId,
  processedRows,
}: {
  importId: string;
  processedRows: number;
}) {
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data: ImportRowsPageResponseDto;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const requestKey = `${importId}:${offset}:${processedRows}`;

  useEffect(() => {
    const controller = new AbortController();

    void getImportRows(
      importId,
      { limit: ROWS_PER_PAGE, offset },
      controller.signal,
    )
      .then((page) => {
        setResult({ key: requestKey, data: page });
        setFailure(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setFailure({
          key: requestKey,
          message:
            reason instanceof ApiError
              ? reason.message
              : "Rows could not be loaded.",
        });
      });

    return () => controller.abort();
  }, [importId, offset, processedRows, requestKey]);

  const currentResult = result?.key === requestKey ? result.data : null;
  const visibleResult = currentResult ?? result?.data ?? null;
  const rows = visibleResult?.items ?? [];
  const page = visibleResult?.page;
  const error = failure?.key === requestKey ? failure.message : null;
  const rowsLoading = currentResult === null && error === null;
  const totalPages = page ? Math.ceil(page.total / ROWS_PER_PAGE) : null;
  const currentPage = Math.floor(offset / ROWS_PER_PAGE) + 1;

  return (
    <div className="panel rows-table-panel" aria-busy={rowsLoading}>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {rowsLoading && !visibleResult ? (
        <div className="rows-loading" role="status">
          <span className="button-spinner" aria-hidden="true" />
          Loading rows…
        </div>
      ) : !visibleResult ? null : rows.length === 0 ? (
        <p className="rows-empty">No rows recorded yet.</p>
      ) : (
        <div className="rows-table-wrap">
          <table className="rows-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Company</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.rowNumber}>
                  <td title={cellValue(row.rawValue.name)}>
                    {cellValue(row.rawValue.name)}
                  </td>
                  <td title={cellValue(row.rawValue.email)}>
                    {cellValue(row.rawValue.email)}
                  </td>
                  <td title={cellValue(row.rawValue.company)}>
                    {cellValue(row.rawValue.company)}
                  </td>
                  <td>
                    <span
                      className={`status-pill status-${row.status}`}
                      title={issuesToTitle(row.issues)}
                    >
                      <span className="status-dot" aria-hidden="true" />
                      {formatStatusLabel(row.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page && page.total > page.limit && (
        <div className="rows-pagination">
          <button
            className="button button-quiet"
            type="button"
            disabled={offset === 0 || rowsLoading}
            onClick={() => setOffset(Math.max(0, offset - ROWS_PER_PAGE))}
          >
            Previous
          </button>
          <span className="rows-page-info">
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="button button-quiet"
            type="button"
            disabled={offset + ROWS_PER_PAGE >= page.total || rowsLoading}
            onClick={() => setOffset(offset + ROWS_PER_PAGE)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export function ImportDetails({ importId, onBack }: ImportDetailsProps) {
  const { summary, failure, isLoading, refresh } = useImportPolling(importId);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryFailure, setRetryFailure] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFailure, setExportFailure] = useState<string | null>(null);
  const exportControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => exportControllerRef.current?.abort(), []);

  const active = summary ? isActiveStatus(summary.status) : false;
  const now = useNow(active);
  const isStalled = summary ? isStalledImport(summary, now) : false;
  const canRetry =
    summary?.status === "failed" || (summary !== null && isStalled);
  const isMissing = failure?.status === 404;
  const duration = summary?.startedAt
    ? formatDuration(summary.startedAt, summary.completedAt, now)
    : null;

  const fileName = summary?.originalFileName;
  const status = summary?.status;

  useEffect(() => {
    if (fileName === undefined || status === undefined) return;
    const previousTitle = document.title;
    document.title = isActiveStatus(status)
      ? `${formatStatusLabel(status)} · ${fileName} · File Importer`
      : `${fileName} · File Importer`;
    return () => {
      document.title = previousTitle;
    };
  }, [fileName, status]);

  async function handleRetry() {
    setIsRetrying(true);
    setRetryFailure(null);
    try {
      await retryImport(importId);
      refresh();
    } catch (reason) {
      setRetryFailure(
        reason instanceof ApiError
          ? reason.message
          : "The import could not be retried.",
      );
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleExport() {
    const controller = new AbortController();
    exportControllerRef.current = controller;
    setIsExporting(true);
    setExportFailure(null);
    try {
      const invalidRows = await fetchNeedsReviewRows(
        importId,
        controller.signal,
      );
      if (controller.signal.aborted || invalidRows.length === 0) return;
      downloadNeedsReviewCsv(
        summary?.originalFileName ?? "import",
        invalidRows,
      );
    } catch (reason) {
      if (controller.signal.aborted) return;
      setExportFailure(
        reason instanceof ApiError
          ? reason.message
          : "The rows could not be exported.",
      );
    } finally {
      if (!controller.signal.aborted) setIsExporting(false);
    }
  }

  function handleBack(event: MouseEvent<HTMLAnchorElement>) {
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();
    onBack();
  }

  if (summary === null && isMissing) {
    return (
      <div className="details-page">
        <a className="back-link" href="/" onClick={handleBack}>
          <span aria-hidden="true">←</span>
          Imports
        </a>
        <section className="panel not-found">
          <h1>Import not found</h1>
          <p>{failure?.message ?? "That import does not exist."}</p>
          <a className="text-button" href="/" onClick={handleBack}>
            Back to imports
          </a>
        </section>
      </div>
    );
  }

  const totalRows = summary?.totalRows ?? null;
  const processedRows = summary?.processedRows ?? 0;
  const completedWithNoRows =
    summary?.status === "completed" && totalRows === 0;
  const progressValue =
    totalRows === null
      ? undefined
      : totalRows === 0
        ? completedWithNoRows
          ? 1
          : 0
        : Math.min(processedRows, totalRows);
  const progressMax = totalRows === null || totalRows === 0 ? 1 : totalRows;
  const progressLabel = isStalled
    ? "Waiting to start"
    : totalRows === null
      ? summary?.status === "failed"
        ? summary?.startedAt === null
          ? "Processing did not start"
          : "Row count unavailable"
        : "Counting rows"
      : totalRows === 0
        ? completedWithNoRows
          ? "Complete · 0 rows"
          : "0 rows identified"
        : `${processedRows} of ${totalRows} rows · ${Math.round((processedRows / totalRows) * 100)}%`;

  return (
    <div className="details-page">
      <a className="back-link" href="/" onClick={handleBack}>
        <span aria-hidden="true">←</span>
        Imports
      </a>

      {failure && !isMissing && (
        <div className="inline-error" role="alert">
          <span>{failure.message}</span>
          <button className="text-button" type="button" onClick={refresh}>
            Try again
          </button>
        </div>
      )}

      {isStalled && (
        <div className="notice notice-warning retry-notice" role="status">
          <strong>Import has not started</strong>
          <span>
            It has been waiting in the queue for over a minute. You can retry it
            safely.
          </span>
          <button
            className="button button-quiet"
            type="button"
            onClick={() => void handleRetry()}
            disabled={isRetrying}
          >
            {isRetrying ? "Retrying…" : "Retry import"}
          </button>
        </div>
      )}

      {retryFailure && (
        <p className="inline-error" role="alert">
          {retryFailure}
        </p>
      )}

      {isLoading && !summary ? (
        <div className="panel details-loading" role="status">
          <span className="button-spinner" aria-hidden="true" />
          Loading import…
        </div>
      ) : summary ? (
        <>
          <section
            className="panel details-summary"
            aria-labelledby="details-title"
          >
            <div className="detail-file-heading">
              <div className="detail-file-icon" aria-hidden="true">
                CSV
              </div>
              <div className="detail-file-text">
                <p className="eyebrow">Import</p>
                <h1 id="details-title">{summary.originalFileName}</h1>
                <span>Created {formatDate(summary.createdAt)}</span>
              </div>
              <span className={`status-pill status-${summary.status}`}>
                <span className="status-dot" aria-hidden="true" />
                {formatStatusLabel(summary.status)}
              </span>
            </div>

            <div className="progress-block">
              <div className="progress-caption">
                <strong>{progressLabel}</strong>
                {active && !isStalled && (
                  <span className="live-indicator">Live</span>
                )}
              </div>
              <progress
                className={
                  summary.status === "failed" ? "progress-failed" : undefined
                }
                aria-label="Import progress"
                max={progressMax}
                value={progressValue}
              />
              <div className="summary-counts">
                <div>
                  <strong>{summary.processedRows}</strong>
                  <span>Processed</span>
                </div>
                <div>
                  <strong>{summary.successRows}</strong>
                  <span>Valid</span>
                </div>
                <div>
                  <strong>{summary.failedRows}</strong>
                  <span>Needs review</span>
                </div>
              </div>
            </div>

            <dl className="detail-metadata">
              <div>
                <dt>Started</dt>
                <dd>{formatDate(summary.startedAt)}</dd>
              </div>
              <div>
                <dt>Finished</dt>
                <dd>{formatDate(summary.completedAt)}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{duration ?? "—"}</dd>
              </div>
            </dl>

            {summary.failureReason && (
              <div className="notice notice-error detail-failure" role="status">
                <strong>Import could not be completed</strong>
                <span>{summary.failureReason}</span>
                {canRetry && (
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={() => void handleRetry()}
                    disabled={isRetrying}
                  >
                    {isRetrying ? "Retrying…" : "Retry import"}
                  </button>
                )}
              </div>
            )}
          </section>

          <section
            className="details-rows"
            aria-labelledby="row-outcomes-title"
          >
            <div className="row-results-heading">
              <div>
                <p className="eyebrow">Row outcomes</p>
                <h2 id="row-outcomes-title">All records</h2>
              </div>
              <div className="row-results-actions">
                <span className="row-results-count">
                  {summary.successRows} valid · {summary.failedRows} to review
                </span>
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => void handleExport()}
                  disabled={isExporting || summary.failedRows === 0}
                  aria-label="Download all rows to review as a CSV file"
                >
                  {isExporting ? (
                    <span className="button-spinner" aria-hidden="true" />
                  ) : (
                    <span aria-hidden="true">↓</span>
                  )}
                  {isExporting ? "Preparing…" : "Export"}
                </button>
              </div>
            </div>

            {exportFailure && (
              <p className="inline-error row-results-error" role="alert">
                {exportFailure}
              </p>
            )}

            <ImportRowsTable
              importId={importId}
              processedRows={summary.processedRows}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
