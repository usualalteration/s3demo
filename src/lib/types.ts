export interface FolderEntry {
  name: string;
  path: string;
  size: number;
  fileCount: number;
  lastModified: string | null;
  explicit: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  size: number;
  lastModified: string | null;
  etag: string;
}

export interface WorkspaceTotals {
  objects: number;
  folders: number;
  bytes: number;
}

export interface ListingResponse {
  ok: boolean;
  folder: string;
  search?: string;
  folders: FolderEntry[];
  files: FileEntry[];
  totals: WorkspaceTotals;
}

export interface StatsResponse {
  ok: boolean;
  totals: { files: number; folders: number; bytes: number };
  byType: { type: string; count: number; bytes: number }[];
  recent: FileEntry[];
}

export interface MetadataResponse {
  ok: boolean;
  key: string;
  name: string;
  contentType: string;
  size: number;
  etag: string;
  lastModified: string | null;
  metadata: Record<string, string>;
}

export interface DownloadResponse {
  ok: boolean;
  key: string;
  name: string;
  contentType: string;
  size: number;
  etag?: string;
  lastModified?: string | null;
  metadata?: Record<string, string>;
  contentBase64: string;
}

export interface ChunkResponse {
  ok: boolean;
  key: string;
  name: string;
  size: number;
  offset: number;
  chunkSize: number;
  eof: boolean;
  contentType: string;
  chunkBase64: string;
}

export type UploadStatus =
  | "queued"
  | "processing"
  | "confirming"
  | "done"
  | "error";

export interface UploadItem {
  id: string;
  file: File;
  folder: string;
  name: string;
  size: number;
  progress: number; // 0..100
  status: UploadStatus;
  error?: string;
}
