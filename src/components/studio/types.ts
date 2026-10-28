/** Shared UI types for S3 Object Studio. */

export interface StorageItem {
  type: "file" | "folder";
  name: string;
  /** User path — folder paths end with a trailing slash. */
  path: string;
  /** Full S3 key (namespace prefix included). */
  key: string;
  size?: number;
  lastModified?: string | null;
  etag?: string;
}

export type ItemAction =
  | "open"
  | "download"
  | "rename"
  | "move"
  | "copy"
  | "copy-key"
  | "delete"
  | "preview";

export type SortBy = "name" | "size" | "modified";
export type SortDir = "asc" | "desc";

export interface SortState {
  by: SortBy;
  dir: SortDir;
}