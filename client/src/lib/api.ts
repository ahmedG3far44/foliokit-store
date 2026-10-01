import type { ApiResponse } from "@shared/types";
import { z } from "zod";

const API_URL = import.meta.env.VITE_BASE_URL || "/api";
const successEnvelopeSchema = z.object({ success: z.literal(true), data: z.unknown() });
const errorEnvelopeSchema = z.object({
  success: z.literal(false).optional(),
  message: z.string().optional(),
  detail: z.string().optional(),
  code: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.array(z.unknown()).optional(),
}).passthrough();

export class ApiError extends Error {
  status: number;
  code?: string;
  requestId?: string;
  validationErrors?: unknown[];
  constructor(message: string, status: number, code?: string, requestId?: string, validationErrors?: unknown[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.validationErrors = validationErrors;
  }
}

let refreshPromise: Promise<boolean> | null = null;
const noRefreshPaths = new Set(["/auth/login", "/auth/register", "/auth/google", "/auth/refresh", "/auth/logout"]);

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "include",
    }).then((response) => response.ok).catch(() => false).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function requestWithRefresh(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", headers.get("Accept") ?? "application/json");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const send = () => fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  let response = await send();
  if (response.status === 401 && !noRefreshPaths.has(path) && await refreshAccessToken()) response = await send();
  return response;
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const rawBody: unknown = await response.json().catch(() => null);
  const parsedError = errorEnvelopeSchema.safeParse(rawBody);
  if (parsedError.success) {
    const body = parsedError.data;
    throw new ApiError(body.detail ?? body.message ?? fallback, response.status, body.code, body.requestId, body.errors);
  }
  throw new ApiError(fallback, response.status || 502, "INVALID_RESPONSE");
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, schema?: z.ZodType<T>): Promise<T> {
  const response = await requestWithRefresh(path, init);
  if (!response.ok) return throwApiError(response, "Request failed");
  const rawBody: unknown = await response.json().catch(() => null);
  const parsedEnvelope = successEnvelopeSchema.safeParse(rawBody);
  if (!parsedEnvelope.success) throw new ApiError("The server returned an invalid response", response.status || 502, "INVALID_RESPONSE");
  const body = parsedEnvelope.data as ApiResponse<T>;
  return schema ? schema.parse(body.data) : body.data as T;
}

async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  const response = await requestWithRefresh(path, { headers: { Accept: "application/pdf" } });
  if (!response.ok) return throwApiError(response, "Invoice download failed");
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? "invoice.pdf";
  return { blob: await response.blob(), filename };
}

export function saveApiFile(file: { blob: Blob; filename: string }): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => apiFetch<T>(path, init),
  post: <T>(path: string, data?: unknown) => apiFetch<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) => apiFetch<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) => apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  uploadPart: (path: string, data: Blob) => apiFetch<{ ETag: string }>(path, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: data }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
  download: apiDownload,
};
