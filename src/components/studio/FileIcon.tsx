import {
  Archive,
  File,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Film,
  Folder,
  Image,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fileCategory, type FileCategory } from "@/lib/format";

type IconEntry = {
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  plain: string;
};

const CATEGORY_ICONS: Record<FileCategory, IconEntry> = {
  image: { icon: Image, tint: "bg-violet-50 text-violet-600", plain: "text-violet-500" },
  pdf: { icon: FileText, tint: "bg-red-50 text-studio-crimson", plain: "text-studio-crimson" },
  document: { icon: FileText, tint: "bg-blue-50 text-blue-600", plain: "text-blue-500" },
  spreadsheet: { icon: FileSpreadsheet, tint: "bg-emerald-50 text-emerald-600", plain: "text-emerald-500" },
  text: { icon: FileText, tint: "bg-stone-100 text-stone-600", plain: "text-stone-500" },
  code: { icon: FileCode, tint: "bg-amber-50 text-amber-600", plain: "text-amber-500" },
  archive: { icon: Archive, tint: "bg-orange-50 text-orange-600", plain: "text-orange-500" },
  audio: { icon: FileAudio, tint: "bg-pink-50 text-pink-600", plain: "text-pink-500" },
  video: { icon: Film, tint: "bg-indigo-50 text-indigo-600", plain: "text-indigo-500" },
  other: { icon: File, tint: "bg-zinc-100 text-zinc-500", plain: "text-zinc-400" },
};

export const FILE_ICON_VIDEO = FileVideo;

/** Compact inline icon (list view, inspector). */
export function FileTypeIcon({ name, className }: { name: string; className?: string }) {
  const entry = CATEGORY_ICONS[fileCategory(name)];
  const Icon = entry.icon;
  return <Icon className={cn("h-4 w-4 shrink-0", entry.plain, className)} />;
}

/** Tinted icon tile (grid view, empty inspector). */
export function FileTypeTile({ name, className, size = "md" }: { name: string; className?: string; size?: "md" | "lg" }) {
  const entry = CATEGORY_ICONS[fileCategory(name)];
  const Icon = entry.icon;
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg",
        entry.tint,
        size === "md" ? "h-10 w-10 [&_svg]:h-5 [&_svg]:w-5" : "h-16 w-16 [&_svg]:h-8 [&_svg]:w-8",
        className,
      )}
    >
      <Icon className="h-5 w-5" />
    </div>
  );
}

export function FolderIcon({ className, tile = false }: { className?: string; tile?: boolean }) {
  return <Folder className={cn("h-4 w-4 shrink-0", tile ? "text-stone-400" : "text-studio-charcoal/80", className)} />;
}