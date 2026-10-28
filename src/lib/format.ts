/**
 * S3 Object Studio — formatting and file-type helpers.
 */

export type FileCategory =
  | "image"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "text"
  | "code"
  | "archive"
  | "audio"
  | "video"
  | "other";

const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
const PDF = new Set(["pdf"]);
const DOC = new Set(["doc", "docx", "odt", "rtf"]);
const SHEET = new Set(["xls", "xlsx", "ods"]);
const TEXT = new Set(["txt", "md", "markdown", "log", "csv"]);
const CODE = new Set([
  "json", "xml", "yaml", "yml", "html", "htm", "css", "js", "mjs", "ts", "tsx",
  "jsx", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "sh", "sql", "ini",
  "toml", "conf",
]);
const ARCHIVE = new Set(["zip", "gz", "tar", "rar", "7z", "bz2"]);
const AUDIO = new Set(["mp3", "wav", "ogg", "flac", "m4a"]);
const VIDEO = new Set(["mp4", "mov", "avi", "mkv", "webm"]);

export function extensionOf(name: string): string {
  const base = name.split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function fileCategory(name: string): FileCategory {
  const ext = extensionOf(name);
  if (IMAGE.has(ext)) return "image";
  if (PDF.has(ext)) return "pdf";
  if (DOC.has(ext)) return "document";
  if (SHEET.has(ext)) return "spreadsheet";
  if (TEXT.has(ext)) return "text";
  if (CODE.has(ext)) return "code";
  if (ARCHIVE.has(ext)) return "archive";
  if (AUDIO.has(ext)) return "audio";
  if (VIDEO.has(ext)) return "video";
  return "other";
}

const CATEGORY_LABELS: Record<FileCategory, string> = {
  image: "Image",
  pdf: "PDF Document",
  document: "Document",
  spreadsheet: "Spreadsheet",
  text: "Text File",
  code: "Code / Data",
  archive: "Archive",
  audio: "Audio",
  video: "Video",
  other: "File",
};

export function categoryLabel(name: string): string {
  const ext = extensionOf(name);
  const label = CATEGORY_LABELS[fileCategory(name)];
  if (!ext) return label;
  return `${ext.toUpperCase()} ${label}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  if (exponent === 0) return `${bytes} B`;
  const value = bytes / 1024 ** exponent;
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso).getTime();
  if (Number.isNaN(date)) return "—";
  const diff = Date.now() - date;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(iso);
}

/** Parent folder path of a user path, normalized with a trailing slash. */
export function parentFolderOf(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx < 0) return "";
  return trimmed.slice(0, idx + 1);
}

/** Display-safe folder path (no trailing slash) for breadcrumbs etc. */
export function displayFolder(path: string): string {
  return path.replace(/\/+$/, "");
}

/** Validate a single path segment (file or folder name). */
export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Name is required";
  if (trimmed.split("/").length > 1) return "Name cannot contain slashes";
  if (trimmed === "." || trimmed === "..") return "This name is not allowed";
  if (/\s/.test(trimmed.slice(0, 1)) || /\s/.test(trimmed.slice(-1))) return "Name cannot start or end with a space";
  if (/[\r\n\t]/.test(trimmed)) return "Name cannot contain line breaks";
  if (trimmed.length > 200) return "Name is too long (200 characters max)";
  return null;
}

/** Validate a destination folder path (multiple segments allowed). */
export function validateFolderPath(path: string): string | null {
  const trimmed = path.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) return null;
  for (const segment of trimmed.split("/")) {
    const error = validateName(segment);
    if (error) return `Invalid folder segment "${segment}": ${error.toLowerCase()}`;
  }
  return null;
}