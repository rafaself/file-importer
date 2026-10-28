import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ImportAcceptedResponseDto } from "@csv/contracts";
import { ApiError, uploadImport } from "./api";

type ImportUploadProps = {
  onAccepted: (importId: string) => void;
  onOpenImport: (importId: string) => void;
  onDismiss: () => void;
  onBusyChange: (busy: boolean) => void;
};

type UploadNotice =
  | { kind: "accepted"; result: ImportAcceptedResponseDto }
  | { kind: "queued-error"; importId: string; message: string }
  | { kind: "error"; message: string };

export function ImportUpload({
  onAccepted,
  onOpenImport,
  onDismiss,
  onBusyChange,
}: ImportUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState<UploadNotice | null>(null);

  useEffect(() => {
    onBusyChange(isUploading);
  }, [isUploading, onBusyChange]);

  useEffect(() => {
    return () => onBusyChange(false);
  }, [onBusyChange]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || isUploading) return;

    setIsUploading(true);
    setNotice(null);
    try {
      const result = await uploadImport(file);
      setNotice({ kind: "accepted", result });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onAccepted(result.id);
    } catch (error) {
      if (error instanceof ApiError && error.importId) {
        setNotice({
          kind: "queued-error",
          importId: error.importId,
          message: error.message,
        });
      } else {
        setNotice({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "The upload could not be completed.",
        });
      }
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="panel upload-panel" aria-labelledby="upload-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">New import</p>
          <h2 id="upload-title">Import a file</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onDismiss}
          disabled={isUploading}
          aria-label="Close import dialog"
        >
          ×
        </button>
      </div>

      <p className="panel-copy">
        Choose one CSV. Processing continues after the upload is accepted.
      </p>

      <form onSubmit={handleSubmit}>
        <label className="file-picker" htmlFor="csv-file">
          <span className="file-picker-mark" aria-hidden="true">
            +
          </span>
          <span className="file-picker-text">
            <strong>{file ? file.name : "Choose a CSV file"}</strong>
            <small>
              {file ? `${(file.size / 1024).toFixed(1)} KB` : ".csv files only"}
            </small>
          </span>
          <span className="file-picker-action">Browse</span>
          <input
            ref={inputRef}
            id="csv-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0] ?? null);
              setNotice(null);
            }}
          />
        </label>

        <button
          className="button button-primary upload-submit"
          type="submit"
          disabled={!file || isUploading}
        >
          {isUploading ? (
            <>
              <span className="button-spinner" aria-hidden="true" />
              Uploading…
            </>
          ) : (
            "Upload file"
          )}
        </button>
      </form>

      <p className="upload-footnote">
        Imports are processed securely in the background. You can leave this
        page while they run.
      </p>

      {notice?.kind === "accepted" && (
        <div className="notice notice-success" role="status">
          <strong>Import accepted</strong>
          <span>
            Status: {notice.result.status}. Processing may still be underway.
          </span>
          <code>{notice.result.id}</code>
        </div>
      )}
      {notice?.kind === "queued-error" && (
        <div className="notice notice-warning" role="alert">
          <strong>Import saved; queueing needs attention</strong>
          <span>{notice.message}</span>
          <code>{notice.importId}</code>
          <span>This file is already saved. Don’t upload it again yet.</span>
          <button
            className="button button-quiet"
            type="button"
            onClick={() => onOpenImport(notice.importId)}
          >
            View import
          </button>
        </div>
      )}
      {notice?.kind === "error" && (
        <div className="notice notice-error" role="alert">
          <strong>Upload failed</strong>
          <span>{notice.message}</span>
          {file && <span>Your selected file is still ready to retry.</span>}
        </div>
      )}
    </section>
  );
}
