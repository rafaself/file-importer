import { useEffect, useState } from "react";
import type { ImportListResponseDto } from "@csv/contracts";
import { ApiError, getImports } from "./api";

const PAGE_SIZE = 20;

type ImportListProps = {
  selectedId: string | null;
  onSelect: (importId: string) => void;
};

type ListResult = {
  key: string;
  data: ImportListResponseDto;
};

type ListFailure = {
  key: string;
  message: string;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function ImportList({ selectedId, onSelect }: ImportListProps) {
  const [result, setResult] = useState<ListResult | null>(null);
  const [offset, setOffset] = useState(0);
  const [manualRefresh, setManualRefresh] = useState(0);
  const [failure, setFailure] = useState<ListFailure | null>(null);
  const requestKey = `${offset}:${manualRefresh}`;

  useEffect(() => {
    const controller = new AbortController();

    void getImports(PAGE_SIZE, offset, controller.signal)
      .then((nextResult) => {
        setResult({ key: requestKey, data: nextResult });
        setFailure(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setFailure({
          key: requestKey,
          message:
            reason instanceof ApiError
              ? reason.message
              : "The import list could not be loaded.",
        });
      });

    return () => controller.abort();
  }, [manualRefresh, offset, requestKey]);

  const currentResult = result?.key === requestKey ? result.data : null;
  const visibleResult = currentResult ?? result?.data ?? null;
  const page = visibleResult?.page;
  const imports = visibleResult?.items ?? [];
  const error = failure?.key === requestKey ? failure.message : null;
  const isLoading = currentResult === null && error === null;
  const isFirstLoad = isLoading && visibleResult === null;

  return (
    <section
      className="panel list-panel"
      aria-labelledby="imports-title"
      aria-busy={isLoading}
    >
      <div className="panel-heading list-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2 id="imports-title">Recent imports</h2>
        </div>
        <button
          className="button button-quiet"
          type="button"
          onClick={() => setManualRefresh((value) => value + 1)}
          disabled={isLoading}
        >
          <span aria-hidden="true">↻</span>
          Refresh
        </button>
      </div>

      {error && (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          {visibleResult && (
            <small>Showing the last successfully loaded page.</small>
          )}
          {!visibleResult && (
            <button
              className="text-button"
              type="button"
              onClick={() => setManualRefresh((value) => value + 1)}
            >
              Try again
            </button>
          )}
        </div>
      )}

      {isFirstLoad ? (
        <div className="list-loading" role="status">
          <span className="button-spinner" aria-hidden="true" />
          Loading imports…
        </div>
      ) : !visibleResult ? null : imports.length === 0 ? (
        <div className="empty-state">
          <span className="empty-mark" aria-hidden="true">
            ∅
          </span>
          <strong>No imports yet</strong>
          <p>Your uploaded files will appear here.</p>
        </div>
      ) : (
        <>
          <div className="imports-table-wrap">
            <table className="imports-table">
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Status</th>
                  <th scope="col">Rows</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((record) => (
                  <tr
                    key={record.id}
                    className={
                      selectedId === record.id ? "selected-row" : undefined
                    }
                  >
                    <td>
                      <button
                        className="import-select"
                        type="button"
                        onClick={() => onSelect(record.id)}
                        aria-current={
                          selectedId === record.id ? "true" : undefined
                        }
                      >
                        <span className="file-mini-icon" aria-hidden="true">
                          CSV
                        </span>
                        <span className="import-file-name">
                          {record.originalFileName}
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className={`status-pill status-${record.status}`}>
                        <span className="status-dot" aria-hidden="true" />
                        {statusLabel(record.status)}
                      </span>
                    </td>
                    <td>
                      <span className="row-count">
                        {record.totalRows === null
                          ? record.status === "failed"
                            ? "Not counted"
                            : "Counting…"
                          : `${record.processedRows} / ${record.totalRows}`}
                      </span>
                      <span className="row-count-sub">
                        {record.successRows} valid · {record.failedRows} invalid
                      </span>
                    </td>
                    <td className="created-cell">
                      {formatDate(record.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {page && (
            <div className="pagination-bar">
              <span>
                {page.total === 0
                  ? "No imports"
                  : `${page.offset + 1}–${Math.min(page.offset + page.limit, page.total)} of ${page.total}`}
              </span>
              <div className="pagination-actions">
                <button
                  className="button button-quiet"
                  type="button"
                  disabled={page.offset === 0 || isLoading}
                  onClick={() =>
                    setOffset(Math.max(0, page.offset - page.limit))
                  }
                >
                  Previous
                </button>
                <button
                  className="button button-quiet"
                  type="button"
                  disabled={page.offset + page.limit >= page.total || isLoading}
                  onClick={() => setOffset(page.offset + page.limit)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
