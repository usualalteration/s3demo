export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  const digits = value >= 100 || exponent === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[exponent]}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type FileCategory =
  | "image"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "archive"
  | "audio"
  | "video"
  | "code"
  | "other";

const CATEGORY_EXTENSIONS: Record<Exclude<FileCategory, "other">, Set<string>> = {
  image: new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tif", "tiff", "heic"]),
  pdf: new Set(["pdf"]),
  document: new Set(["txt", "md", "doc", "docx", "rtf", "odt", "pages"]),
  spreadsheet: new Set(["csv", "xls", "xlsx", "tsv", "ods", "numbers"]),
  presentation: new Set(["ppt", "pptx", "odp", "key"]),
  archive: new Set(["zip", "tar", "gz", "rar", "7z", "bz2", "xz"]),
  audio: new Set(["mp3", "wav", "ogg", "flac", "m4a", "aac"]),
  video: new Set(["mp4", "mov", "avi", "mkv", "webm", "m4v"]),
  code: new Set([
    "json", "js", "ts", "tsx", "jsx", "py", "html", "css", "xml",
    "yaml", "yml", "sh", "sql", "java", "c", "cpp", "go", "rs", "rb", "php",
  ]),
};

export function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : "";
}

export function categoryOf(name: string): FileCategory {
  const ext = extensionOf(name);
  for (const [category, extensions] of Object.entries(CATEGORY_EXTENSIONS)) {
    if ((extensions as Set<string>).has(ext)) return category as FileCategory;
  }
  return "other";
}

export const CATEGORY_LABELS: Record<FileCategory, string> = {
  image: "Images",
  pdf: "PDF",
  document: "Documents",
  spreadsheet: "Spreadsheets",
  presentation: "Presentations",
  archive: "Archives",
  audio: "Audio",
  video: "Video",
  code: "Code",
  other: "Other",
};

export const FILTER_CATEGORIES: FileCategory[] = [
  "image",
  "pdf",
  "document",
  "spreadsheet",
  "archive",
  "video",
  "audio",
  "code",
];

export function parentPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  if (segments.length <= 1) return "";
  return segments.slice(0, -1).join("/");
}

export function baseName(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments.length ? segments[segments.length - 1] : "";
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "json", "csv", "log", "xml", "yaml", "yml", "html", "css", "js", "ts", "py", "sql", "sh",
]);

export function isTextPreviewable(name: string): boolean {
  return TEXT_EXTENSIONS.has(extensionOf(name));
}

export function isImagePreviewable(name: string): boolean {
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(extensionOf(name));
}

export function isPdfPreviewable(name: string): boolean {
  return extensionOf(name) === "pdf";
}
