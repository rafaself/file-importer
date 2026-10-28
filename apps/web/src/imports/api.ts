import {
  importAcceptedResponseSchema,
  importDetailResponseSchema,
  importListResponseSchema,
  importRowsPageResponseSchema,
  type ImportAcceptedResponseDto,
  type ImportDetailResponseDto,
  type ImportListResponseDto,
  type ImportRowsPageResponseDto,
} from "@csv/contracts";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3010"
).replace(/\/+$/, "");

type ErrorBody = {
  message?: unknown;
  id?: unknown;
};

export class ApiError extends Error {
  readonly status: number | undefined;
  readonly importId: string | undefined;

  constructor(message: string, status?: number, importId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.importId = importId;
  }
}

export type RowStatusFilter = "valid" | "invalid";
type ImportRowsOptions = {
  limit: number;
  offset: number;
  status?: RowStatusFilter;
};

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function errorFromResponse(body: unknown, status: number): ApiError {
  const error = (body && typeof body === "object" ? body : {}) as ErrorBody;
  const message = Array.isArray(error.message)
    ? error.message
        .filter((item): item is string => typeof item === "string")
        .join(" ")
    : typeof error.message === "string"
      ? error.message
      : `The request failed with status ${status}.`;

  return new ApiError(
    message,
    status,
    typeof error.id === "string" ? error.id : undefined,
  );
}

async function getJson<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError("Could not reach the import API.");
  }

  const body = await readJson(response);
  if (!response.ok) throw errorFromResponse(body, response.status);

  try {
    return schema.parse(body);
  } catch {
    throw new ApiError(
      "The import API returned an unexpected response.",
      response.status,
    );
  }
}

export async function uploadImport(
  file: File,
): Promise<ImportAcceptedResponseDto> {
  const form = new FormData();
  form.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/imports`, {
      method: "POST",
      body: form,
    });
  } catch {
    throw new ApiError("Could not reach the import API.");
  }

  const body = await readJson(response);
  if (!response.ok) throw errorFromResponse(body, response.status);
  if (response.status !== 202) {
    throw new ApiError("The API did not accept the import.", response.status);
  }

  try {
    return importAcceptedResponseSchema.parse(body);
  } catch {
    throw new ApiError(
      "The import API returned an unexpected response.",
      response.status,
    );
  }
}

export async function retryImport(
  importId: string,
): Promise<ImportAcceptedResponseDto> {
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/imports/${encodeURIComponent(importId)}/retry`,
      { method: "POST" },
    );
  } catch {
    throw new ApiError("Could not reach the import API.");
  }

  const body = await readJson(response);
  if (!response.ok) throw errorFromResponse(body, response.status);
  if (response.status !== 202) {
    throw new ApiError("The API did not accept the retry.", response.status);
  }

  try {
    return importAcceptedResponseSchema.parse(body);
  } catch {
    throw new ApiError(
      "The import API returned an unexpected response.",
      response.status,
    );
  }
}

export function getImports(
  limit: number,
  offset: number,
  signal?: AbortSignal,
): Promise<ImportListResponseDto> {
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  return getJson(`/imports?${query}`, importListResponseSchema, signal);
}

export function getImport(
  importId: string,
  signal?: AbortSignal,
): Promise<ImportDetailResponseDto> {
  return getJson(
    `/imports/${encodeURIComponent(importId)}`,
    importDetailResponseSchema,
    signal,
  );
}

export function getImportRows(
  importId: string,
  query: ImportRowsOptions,
  signal?: AbortSignal,
): Promise<ImportRowsPageResponseDto> {
  const params = new URLSearchParams({
    limit: String(query.limit),
    offset: String(query.offset),
  });
  if (query.status) params.set("status", query.status);

  return getJson(
    `/imports/${encodeURIComponent(importId)}/rows?${params}`,
    importRowsPageResponseSchema,
    signal,
  );
}
