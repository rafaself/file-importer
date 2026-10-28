import { useEffect, useRef, useState } from "react";
import type { ImportDetailResponseDto } from "@csv/contracts";
import { ApiError, getImport } from "./api";

const POLL_INTERVAL_MS = 2_500;
const STALLED_POLL_INTERVAL_MS = 15_000;
const PENDING_START_TIMEOUT_MS = 60_000;

export function isActiveStatus(status: string): boolean {
  return status === "pending" || status === "processing";
}

export function isStalledImport(
  summary: ImportDetailResponseDto,
  now: number,
): boolean {
  return (
    summary.status === "pending" &&
    summary.startedAt === null &&
    now - new Date(summary.createdAt).getTime() >= PENDING_START_TIMEOUT_MS
  );
}

type PollingFailure = {
  importId: string;
  message: string;
  status?: number;
};

export function useImportPolling(importId: string): {
  summary: ImportDetailResponseDto | null;
  failure: PollingFailure | null;
  isLoading: boolean;
  refresh: () => void;
} {
  const [result, setResult] = useState<{
    importId: string;
    data: ImportDetailResponseDto;
  } | null>(null);
  const [failure, setFailure] = useState<PollingFailure | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const summaryRef = useRef<ImportDetailResponseDto | null>(null);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let controller: AbortController | undefined;
    let continuePolling =
      summaryRef.current?.id === importId &&
      isActiveStatus(summaryRef.current.status);

    const loadSummary = async () => {
      controller = new AbortController();
      try {
        const nextSummary = await getImport(importId, controller.signal);
        if (disposed) return;
        summaryRef.current = nextSummary;
        setResult({ importId, data: nextSummary });
        setFailure(null);
        continuePolling = isActiveStatus(nextSummary.status);
        if (continuePolling) {
          timer = window.setTimeout(
            loadSummary,
            isStalledImport(nextSummary, Date.now())
              ? STALLED_POLL_INTERVAL_MS
              : POLL_INTERVAL_MS,
          );
        }
      } catch (reason) {
        if (disposed || controller?.signal.aborted) return;
        setFailure({
          importId,
          message:
            reason instanceof ApiError
              ? reason.message
              : "Import details could not be loaded.",
          status: reason instanceof ApiError ? reason.status : undefined,
        });
        if (continuePolling) {
          const previousSummary = summaryRef.current;
          const pollInterval =
            previousSummary && isStalledImport(previousSummary, Date.now())
              ? STALLED_POLL_INTERVAL_MS
              : POLL_INTERVAL_MS * 2;
          timer = window.setTimeout(loadSummary, pollInterval);
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

  const summary = result?.importId === importId ? result.data : null;
  const visibleFailure = failure?.importId === importId ? failure : null;
  const isLoading = summary === null && visibleFailure === null;

  return {
    summary,
    failure: visibleFailure,
    isLoading,
    refresh: () => setRefreshToken((value) => value + 1),
  };
}
