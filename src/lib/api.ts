/**
 * S3 Object Studio — API client for the OpenServerless Python actions.
 *
 * All calls use relative `/api/my/v1/...` URLs so the browser keeps its
 * origin. Responses are normalized: the generated action wrapper may nest
 * the module result under `body`.
 */

export interface FolderEntry {
  type: "folder";
  name: string;
  path: string;
  key: string;
}

export interface FileEntry {
  type: "file";
  name: string;
  path: string;
  key: string;
  size: number;
  lastModified: string | null;
  etag: string;
}

export interface ListResponse {
  ok: true;
  path: string;
  folders: FolderEntry[];
  objects: FileEntry[];
  truncated: boolean;
  token: string | null;
}

export interface FileMeta {
  type: "file";
  name: string;
  path: string;
  key: string;
  size: number;
  contentType: string;
  lastModified: string | null;
  etag: string;
}

export interface FolderMeta {
  type: "folder";
  name: string;
  path: string;
  key: string;
  objectCount: number;
  size: number;
  hasMarker: boolean;
  truncated: boolean;
}

export type ObjectMeta = FileMeta | FolderMeta;

export interface MetaResponse {
  ok: true;
  meta: ObjectMeta;
}

export interface RecentFile {
  name: string;
  path: string;
  size: number;
  lastModified: string | null;
}

export interface StatsResponse {
  ok: true;
  stats: {
    files: number;
    folders: number;
    size: number;
    scanned: number;
    truncated: boolean;
    byType: Record<string, number>;
    recent: RecentFile[];
  };
}

export interface SearchResponse {
  ok: true;
  query: string;
  objects: FileEntry[];
  folders: FolderEntry[];
  scanned: number;
  truncated: boolean;
}

export interface DownloadResponse {
  ok: true;
  mode: "base64" | "url";
  data?: string;
  url?: string;
  name: string;
  size: number;
  contentType: string;
}

export interface PreviewResponse {
  ok: true;
  kind: "text" | "image" | "pdf" | "generic" | "too_large";
  text?: string;
  data?: string;
  contentType?: string;
  truncated?: boolean;
  meta: FileMeta;
}

export interface InitResponse {
  ok: true;
  namespace: string;
  readWrite: string;
}

export class ApiError extends Error {
  code: string;

  constructor(message: string, code = "ERROR") {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

const BASE = "/api/my/v1";

/** Max decoded size for direct base64 uploads (matches the backend limit). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function normalize(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if ("body" in record && record.body !== null && typeof record.body === "object") {
    return record.body as Record<string, unknown>;
  }
  return record;
}

async function request<T>(
  action: string,
  options?: {
    method?: "GET" | "POST";
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined | null>;
  },
): Promise<T> {
  const params = options?.params ?? {};
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  const url = `${BASE}/${action}${qs ? `?${qs}` : ""}`;
  const hasBody = options?.body !== undefined;
  let res: Response;
  try {
    res = await fetch(url, {
      method: options?.method ?? (hasBody ? "POST" : "GET"),
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("Network error — could not reach the storage API", "NETWORK");
  }

  let raw: unknown = null;
  try {
    raw = await res.json();
  } catch {
    throw new ApiError(`Request failed (${res.status})`, "HTTP");
  }

  const data = normalize(raw);
  if (!res.ok || !data || data.ok === false) {
    const message =
      (data && typeof data.error === "string" && data.error) || `Request failed (${res.status})`;
    const code = (data && typeof data.code === "string" && data.code) || "HTTP";
    throw new ApiError(message, code);
  }
  return data as T;
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

export function initStorage(): Promise<InitResponse> {
  return request<InitResponse>("storage-init");
}

export function listFolder(path: string, token?: string | null): Promise<ListResponse> {
  return request<ListResponse>("storage-list", { params: { path, token } });
}

export function createFolder(path: string): Promise<{ ok: true; folder: FolderEntry }> {
  return request("folder-create", { body: { path } });
}

export function getStats(): Promise<StatsResponse> {
  return request<StatsResponse>("storage-stats");
}

export function searchObjects(q: string): Promise<SearchResponse> {
  return request<SearchResponse>("storage-search", { params: { q } });
}

export function getObjectMeta(path: string): Promise<MetaResponse> {
  const isFolder = path.endsWith("/");
  return request<MetaResponse>("object-meta", { params: { path, folder: isFolder } });
}

export function getObjectPreview(path: string): Promise<PreviewResponse> {
  return request<PreviewResponse>("object-preview", { params: { path } });
}

export function downloadObjectData(path: string): Promise<DownloadResponse> {
  return request<DownloadResponse>("object-download", { params: { path } });
}

export function copyObject(payload: {
  source: string;
  destFolder: string;
  destName?: string;
  overwrite?: boolean;
}): Promise<{ ok: true }> {
  return request("object-copy", { body: payload });
}

export function moveObject(payload: {
  source: string;
  destFolder: string;
  destName?: string;
  overwrite?: boolean;
}): Promise<{ ok: true }> {
  return request("object-move", { body: payload });
}

export function renameObject(payload: {
  path: string;
  newName: string;
  overwrite?: boolean;
}): Promise<{ ok: true }> {
  return request("object-rename", { body: payload });
}

export function deleteObject(path: string, recursive = false): Promise<{ ok: true; deleted: number }> {
  return request("object-delete", { body: { path, recursive } });
}

/* ------------------------------------------------------------------ */
/* Upload with progress (XHR)                                          */
/* ------------------------------------------------------------------ */

export interface UploadRequest {
  path: string;
  name: string;
  data: string;
  contentType?: string;
  overwrite?: boolean;
}

export interface UploadHandlers {
  onProgress?: (fraction: number) => void;
  registerAbort?: (abort: () => void) => void;
}

export function uploadObject(
  req: UploadRequest,
  handlers: UploadHandlers = {},
): Promise<{ ok: true; object: FileEntry }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/object-upload`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.responseType = "text";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && handlers.onProgress) {
        handlers.onProgress(event.loaded / event.total);
      }
    };

    const finish = () => {
      let raw: unknown = null;
      try {
        raw = JSON.parse(xhr.responseText);
      } catch {
        reject(new ApiError(`Upload failed (${xhr.status})`, "HTTP"));
        return;
      }
      const data = normalize(raw);
      if (xhr.status >= 200 && xhr.status < 300 && data && data.ok !== false) {
        handlers.onProgress?.(1);
        resolve(data as { ok: true; object: FileEntry });
      } else {
        const message =
          (data && typeof data.error === "string" && data.error) || `Upload failed (${xhr.status})`;
        const code = (data && typeof data.code === "string" && data.code) || "HTTP";
        reject(new ApiError(message, code));
      }
    };

    xhr.onload = finish;
    xhr.onerror = () => reject(new ApiError("Network error during upload", "NETWORK"));
    xhr.onabort = () => reject(new ApiError("Upload canceled", "CANCELED"));
    xhr.ontimeout = () => reject(new ApiError("Upload timed out", "TIMEOUT"));

    handlers.registerAbort?.(() => xhr.abort());
    xhr.send(JSON.stringify(req));
  });
}

/** Read a File as base64 (without the data-URL prefix). */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ */
/* Download helpers                                                    */
/* ------------------------------------------------------------------ */

function base64ToBlob(b64: string, contentType: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType || "application/octet-stream" });
}

export async function downloadToDisk(path: string, name: string): Promise<void> {
  const res = await downloadObjectData(path);
  if (res.mode === "url" && res.url) {
    window.open(res.url, "_blank", "noopener,noreferrer");
    return;
  }
  const blob = base64ToBlob(res.data ?? "", res.contentType);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name || res.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}