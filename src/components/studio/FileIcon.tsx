import {
  Archive,
  File,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  FolderClosed,
  Presentation,
} from "lucide-react";
import { categoryOf, type FileCategory } from "@/lib/files";

const CATEGORY_STYLE: Record<FileCategory, { icon: typeof File; className: string }> = {
  image: { icon: FileImage, className: "bg-crimson/10 text-crimson" },
  pdf: { icon: FileText, className: "bg-crimson/10 text-crimson" },
  document: { icon: FileText, className: "bg-blue-900/10 text-blue-900" },
  spreadsheet: { icon: FileSpreadsheet, className: "bg-emerald-800/10 text-emerald-800" },
  presentation: { icon: Presentation, className: "bg-amber-700/10 text-amber-700" },
  archive: { icon: Archive, className: "bg-amber-700/10 text-amber-700" },
  audio: { icon: FileAudio, className: "bg-violet-800/10 text-violet-800" },
  video: { icon: FileVideo, className: "bg-rose-800/10 text-rose-800" },
  code: { icon: FileCode, className: "bg-charcoal/10 text-charcoal" },
  other: { icon: File, className: "bg-charcoal/10 text-charcoal" },
};

export function FileIcon({ name, className = "h-5 w-5", box = false }: { name: string; className?: string; box?: boolean }) {
  const { icon: Icon, className: tone } = CATEGORY_STYLE[categoryOf(name)];
  if (!box) {
    return <Icon className={className} aria-hidden="true" />;
  }
  return (
    <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}>
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

export function FolderIcon({ className = "h-5 w-5", box = false }: { className?: string; box?: boolean }) {
  if (!box) {
    return <FolderClosed className={className} aria-hidden="true" />;
  }
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-crimson/10 text-crimson">
      <FolderClosed className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}
