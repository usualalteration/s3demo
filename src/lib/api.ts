import type {
  ChunkResponse,
  DownloadResponse,
  ListingResponse,
  MetadataResponse,
  StatsResponse,
} from "./types";

export class ApiError extends Error {
  code?: string;
  status?: number;
  details?: Record<string, unknown>;

  constructor(message: string, code?: string, status?: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface ApiOptions {
  method?: "GET" | "POST";
  body?: unknown;
  retryOnBusy?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ActionPayload {
  ok?: boolean;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

/** Normalizes the generated wrapper's nested { body: ... } response shape. */
function unwrapActionPayload(raw: unknown): ActionPayload | null {
  if (
    raw &&
    typeof raw === "object" &&
    "body" in raw &&
    (raw as Record<string, unknown>).body !== null &&
    typeof (raw as Record<string, unknown>).body === "object"
  ) {
    return (raw as Record<string, unknown>).body as ActionPayload;
  }
  return raw && typeof raw === "object" ? (raw as ActionPayload) : null;
}

/**
 * Fetch an OpenServerless action endpoint. The S3 connection is provided
 * automatically by the runtime binding on the action side — the browser
 * never handles credentials. The platform's transient "Response not yet
 * ready" cold-start answer is retried once after a short delay.
 */
async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const url = `/api/my${path}`;
  const init: RequestInit = {
    method: options.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
    },
  };
  if (options.method !== "GET") {
    init.body = JSON.stringify(options.body ?? {});
  }

  const attempts = options.retryOnBusy === false ? 1 : 2;
  let lastError: ApiError | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await sleep(2500);
    }
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      lastError = new ApiError(
        err instanceof Error ? `Network failure: ${err.message}` : "Network failure",
        "network_error",
      );
      continue;
    }

    let raw: unknown = null;
    try {
      raw = await response.json();
    } catch {
      raw = null;
    }

    // The generated wrapper nests module output under "body".
    const data = unwrapActionPayload(raw);

    const busy =
      data?.error === "Response not yet ready." ||
      (typeof data?.error === "string" && data.error.includes("Response not yet ready"));

    if (busy && attempt < attempts - 1) {
      lastError = new ApiError("The service is warming up. Please wait a moment.", "busy", response.status);
      continue;
    }

    if (!response.ok || data?.ok === false || data?.error) {
      lastError = new ApiError(
        data?.error ?? `Request failed (${response.status})`,
        data?.code,
        response.status,
        data as Record<string, unknown> | undefined,
      );
      break;
    }

    return data as T;
  }

  throw lastError ?? new ApiError("Request failed", "unknown");
}

export const storageApi = {
  list: (folder: string, search = "") =>
    api<ListingResponse>("/v1/objects", { body: { folder, search } }),
  stats: () => api<StatsResponse>("/v1/stats", { body: {} }),
  createFolder: (path: string) => api<{ ok: boolean; path: string }>("/v1/folders", { body: { path } }),
  metadata: (key: string) => api<MetadataResponse>("/v1/metadata", { body: { key } }),
  download: (key: string) => api<DownloadResponse>("/v1/download", { body: { key } }),
  downloadChunk: (key: string, offset: number, length: number) =>
    api<ChunkResponse>("/v1/download", { body: { key, offset, length } }),
  delete: (key: string, type: "file" | "folder", confirm: boolean) =>
    api<{ ok: boolean; deleted: number }>("/v1/delete", { body: { key, type, confirm } }),
  rename: (key: string, newName: string, type: "file" | "folder") =>
    api<{ ok: boolean; key: string }>("/v1/rename", { body: { key, newName, type } }),
  copy: (params: {
    key: string;
    type: "file" | "folder";
    destinationFolder: string;
    newName?: string;
    move?: boolean;
  }) => api<{ ok: boolean; key: string }>("/v1/copy-object", { body: params }),
  uploadSmall: (params: {
    filename: string;
    folder: string;
    contentType: string;
    contentBase64: string;
    overwrite?: boolean;
  }) =>
    api<{ ok: boolean; key: string; size: number }>("/v1/upload", { body: params }),
  chunkInit: (params: { filename: string; folder: string; totalSize: number; overwrite?: boolean }) =>
    api<{ ok: boolean; uploadId: string; partBytes: number }>("/v1/upload", {
      body: { action: "chunk-init", ...params },
    }),
  chunkPart: (params: { uploadId: string; partNumber: number; partBase64: string }) =>
    api<{ ok: boolean; partNumber: number; size: number }>("/v1/upload", {
      body: { action: "chunk-part", ...params },
    }),
  chunkComplete: (params: {
    uploadId: string;
    filename: string;
    folder: string;
    totalSize: number;
    contentType: string;
    overwrite?: boolean;
  }) =>
    api<{ ok: boolean; key: string; size: number }>("/v1/upload", {
      body: { action: "chunk-complete", ...params },
    }),
  chunkAbort: (params: { uploadId: string }) =>
    api<{ ok: boolean }>("/v1/upload", { body: { action: "chunk-abort", ...params } }),
};
