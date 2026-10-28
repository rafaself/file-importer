import { useEffect, useRef, useState } from "react";
import type {
  ImportDetailResponseDto,
  ImportRowsPageResponseDto,
} from "@csv/contracts";
import {
  ApiError,
  getImport,
  getImportRows,
  type RowStatusFilter,
} from "./api";

const ROWS_PER_PAGE = 10;
const POLL_INTERVAL_MS = 2_500;

type ImportDetailsProps = {
  importId: string;
  onClose: () => void;
};

type RowStatus = RowStatusFilter;

function isActive(status: string): boolean {
  return status === "pending" || status === "processing";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ImportRowsSection({
  importId,
  status,
  processedRows,
}: {
  importId: string;
  status: RowStatus;
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
  const requestKey = `${importId}:${status}:${offset}:${processedRows}`;

  useEffect(() => {
    const controller = new AbortController();

    void getImportRows(
      importId,
      { status, limit: ROWS_PER_PAGE, offset },
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
  }, [importId, offset, processedRows, requestKey, status]);

  const currentResult = result?.key === requestKey ? result.data : null;
  const visibleResult = currentResult ?? result?.data ?? null;
  const rows = visibleResult?.items ?? [];
  const page = visibleResult?.page;
  const error = failure?.key === requestKey ? failure.message : null;
  const isLoading = currentResult === null && error === null;

  return (
    <section
      className={`rows-panel rows-${status}`}
      aria-labelledby={`${status}-rows-title`}
      aria-busy={isLoading}
    >
      <div className="rows-panel-heading">
        <div className="rows-heading-title">
          <span
            className={`row-status-mark row-mark-${status}`}
            aria-hidden="true"
          >
            {status === "valid" ? "✓" : "!"}
          </span>
          <div>
            <h3 id={`${status}-rows-title`}>
              {status === "valid" ? "Valid rows" : "Rows to review"}
            </h3>
            <p>{page?.total ?? "—"} records</p>
          </div>
        </div>
        {page && page.total > 0 && (
          <span className="rows-page-label">
            {page.offset + 1}–{Math.min(page.offset + page.limit, page.total)}{" "}
            of {page.total}
          </span>
        )}
      </div>

      {error && (
        <p className="inline-error compact-error" role="alert">
          {error}
        </p>
      )}
      {isLoading && !visibleResult ? (
        <div className="rows-loading" role="status">
          <span className="button-spinner" aria-hidden="true" />
          Loading rows…
        </div>
      ) : !visibleResult ? null : rows.length === 0 ? (
        <p className="rows-empty">
          {status === "valid" ? "No valid rows yet." : "No rows need review."}
        </p>
      ) : (
        <div className="row-cards">
          {rows.map((row) => (
            <article className="row-card" key={row.rowNumber}>
              <div className="row-card-heading">
                <strong>Record {row.rowNumber}</strong>
                <span className={`status-pill status-${row.status}`}>
                  <span className="status-dot" aria-hidden="true" />
                  {row.status}
                </span>
              </div>
              <dl className="raw-values">
                {Object.entries(row.rawValue).map(([field, value]) => (
                  <div className="raw-value" key={field}>
                    <dt>{field}</dt>
                    <dd>
                      {value || <span className="empty-value">Empty</span>}
                    </dd>
                  </div>
                ))}
              </dl>
              {row.issues.length > 0 && (
                <ul className="row-issues">
                  {row.issues.map((issue, index) => (
                    <li key={`${issue.field}-${index}`}>
                      <strong>{issue.field || "Row"}:</strong> {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}

      {page && page.total > page.limit && (
        <div className="rows-pagination">
          <button
            className="button button-quiet"
            type="button"
            disabled={offset === 0 || isLoading}
            onClick={() => setOffset(Math.max(0, offset - ROWS_PER_PAGE))}
          >
            Previous
          </button>
          <button
            className="button button-quiet"
            type="button"
            disabled={offset + ROWS_PER_PAGE >= page.total || isLoading}
            onClick={() => setOffset(offset + ROWS_PER_PAGE)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

export function ImportDetails({ importId, onClose }: ImportDetailsProps) {
  const [summaryResult, setSummaryResult] = useState<{
    importId: string;
    data: ImportDetailResponseDto;
  } | null>(null);
  const [summaryFailure, setSummaryFailure] = useState<{
    importId: string;
    message: string;
  } | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const summaryRef = useRef<ImportDetailResponseDto | null>(null);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let controller: AbortController | undefined;
    let continuePolling =
      summaryRef.current?.id === importId &&
      isActive(summaryRef.current.status);

    const loadSummary = async () => {
      controller = new AbortController();
      try {
        const nextSummary = await getImport(importId, controller.signal);
        if (disposed) return;
        summaryRef.current = nextSummary;
        setSummaryResult({ importId, data: nextSummary });
        setSummaryFailure(null);
        continuePolling = isActive(nextSummary.status);
        if (continuePolling) {
          timer = window.setTimeout(loadSummary, POLL_INTERVAL_MS);
        }
      } catch (reason) {
        if (disposed || controller?.signal.aborted) return;
        setSummaryFailure({
          importId,
          message:
            reason instanceof ApiError
              ? reason.message
              : "Import details could not be loaded.",
        });
        if (continuePolling) {
          timer = window.setTimeout(loadSummary, POLL_INTERVAL_MS * 2);
        }
      }
    };

    void loadSummary();
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [importId, refreshToken]);

  const visibleSummary =
    summaryResult?.importId === importId ? summaryResult.data : null;
  const error =
    summaryFailure?.importId === importId ? summaryFailure.message : null;
  const isLoading = visibleSummary === null && error === null;
  const totalRows = visibleSummary?.totalRows ?? null;
  const completedWithNoRows =
    visibleSummary?.status === "completed" && totalRows === 0;
  const progressValue =
    totalRows === null
      ? undefined
      : totalRows === 0
        ? completedWithNoRows
          ? 1
          : 0
        : Math.min(visibleSummary?.processedRows ?? 0, totalRows);
  const progressMax = totalRows === null || totalRows === 0 ? 1 : totalRows;
  const progressLabel =
    totalRows === null
      ? "Counting rows"
      : totalRows === 0
        ? completedWithNoRows
          ? "Complete · 0 rows"
          : "0 rows identified"
        : `${visibleSummary?.processedRows ?? 0} of ${totalRows} rows · ${Math.round(((visibleSummary?.processedRows ?? 0) / totalRows) * 100)}%`;

  return (
    <section className="panel details-panel" aria-labelledby="details-title">
      <div className="panel-heading details-heading">
        <div>
          <p className="eyebrow">Import details</p>
          <h2 id="details-title">Processing overview</h2>
        </div>
        <button
          className="icon-button close-details"
          type="button"
          onClick={onClose}
          aria-label="Close import details"
        >
          ×
        </button>
      </div>

      {error && (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          <button
            className="text-button"
            type="button"
            onClick={() => setRefreshToken((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      )}

      {isLoading && !visibleSummary ? (
        <div className="details-loading" role="status">
          <span className="button-spinner" aria-hidden="true" />
          Loading import…
        </div>
      ) : visibleSummary ? (
        <>
          <div className="detail-file-heading">
            <div className="detail-file-icon" aria-hidden="true">
              CSV
            </div>
            <div className="detail-file-text">
              <strong>{visibleSummary.originalFileName}</strong>
              <span>Created {formatDate(visibleSummary.createdAt)}</span>
            </div>
            <span className={`status-pill status-${visibleSummary.status}`}>
              <span className="status-dot" aria-hidden="true" />
              {visibleSummary.status}
            </span>
          </div>

          <div className="progress-block">
            <div className="progress-caption">
              <strong>{progressLabel}</strong>
              {isActive(visibleSummary.status) && (
                <span className="live-indicator">Live</span>
              )}
            </div>
            <progress
              aria-label="Import progress"
              max={progressMax}
              value={progressValue}
            />
            <div className="summary-counts">
              <div>
                <strong>{visibleSummary.processedRows}</strong>
                <span>Processed</span>
              </div>
              <div>
                <strong>{visibleSummary.successRows}</strong>
                <span>Valid</span>
              </div>
              <div>
                <strong>{visibleSummary.failedRows}</strong>
                <span>Needs review</span>
              </div>
            </div>
          </div>

          <dl className="detail-metadata">
            <div>
              <dt>Started</dt>
              <dd>{formatDate(visibleSummary.startedAt)}</dd>
            </div>
            <div>
              <dt>Finished</dt>
              <dd>{formatDate(visibleSummary.completedAt)}</dd>
            </div>
          </dl>

          {visibleSummary.failureReason && (
            <div className="notice notice-error detail-failure" role="status">
              <strong>Import could not be completed</strong>
              <span>{visibleSummary.failureReason}</span>
            </div>
          )}

          <div className="row-results-heading">
            <div>
              <p className="eyebrow">Row outcomes</p>
              <h3>Review the records</h3>
            </div>
            <span className="row-results-count">
              {visibleSummary.failedRows} to review
            </span>
          </div>

          <div className="row-results-grid">
            <ImportRowsSection
              key={`${importId}-valid`}
              importId={importId}
              status="valid"
              processedRows={visibleSummary.processedRows}
            />
            <ImportRowsSection
              key={`${importId}-invalid`}
              importId={importId}
              status="invalid"
              processedRows={visibleSummary.processedRows}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}
