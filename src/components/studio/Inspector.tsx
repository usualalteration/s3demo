import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Copy,
  Download,
  FileWarning,
  FolderInput,
  FolderOutput,
  Loader2,
  PanelRightClose,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getObjectMeta, getObjectPreview } from "@/lib/api";
import { categoryLabel, formatBytes, formatDate } from "@/lib/format";
import { FileTypeIcon, FileTypeTile } from "./FileIcon";
import type { ItemAction, StorageItem } from "./types";

const AUTO_PREVIEW_LIMIT = 1_000_000; // bytes

interface InspectorProps {
  item: StorageItem | null;
  onClose: () => void;
  onAction: (action: ItemAction, item: StorageItem) => void;
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="text-[13px] text-foreground">{children}</div>
    </div>
  );
}

/** Renders the preview body for a file based on the preview action result. */
function PreviewBody({ item }: { item: StorageItem }) {
  const [forced, setForced] = useState(false);
  const size = item.size ?? 0;
  const autoLoad = size <= AUTO_PREVIEW_LIMIT;

  const previewQuery = useQuery({
    queryKey: ["preview", item.path],
    queryFn: () => getObjectPreview(item.path),
    enabled: autoLoad || forced,
    staleTime: 60_000,
    retry: 1,
  });

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfData = previewQuery.data?.kind === "pdf" ? previewQuery.data.data : null;
  const pdfType = previewQuery.data?.contentType ?? "application/pdf";

  useEffect(() => {
    if (!pdfData) {
      setPdfUrl(null);
      return;
    }
    const binary = atob(pdfData);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: pdfType });
    const url = URL.createObjectURL(blob);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfData, pdfType]);

  if (previewQuery.isPending && !previewQuery.data) {
    return (
      <div className="flex h-44 items-center justify-center rounded-lg border border-studio-sand bg-stone-50">
        {previewQuery.isFetching ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Button size="sm" variant="outline" className="bg-white" onClick={() => setForced(true)}>
            Load preview
          </Button>
        )}
      </div>
    );
  }

  if (previewQuery.isError) {
    return (
      <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-lg border border-studio-sand bg-stone-50 text-center">
        <FileWarning className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Preview could not be loaded</p>
      </div>
    );
  }

  const data = previewQuery.data;
  if (!data) return null;

  if (data.kind === "image" && data.data) {
    const dataUrl = `data:${data.contentType ?? "image/png"};base64,${data.data}`;
    return (
      <div className="flex h-44 items-center justify-center overflow-hidden rounded-lg border border-studio-sand bg-[conic-gradient(#f4f4f5_0deg_90deg,#fafafa_90deg_180deg,#f4f4f5_180deg_270deg,#fafafa_270deg_360deg)] bg-[length:16px_16px]">
        <img src={dataUrl} alt={item.name} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }

  if (data.kind === "text" && typeof data.text === "string") {
    return (
      <div className="h-44 overflow-auto rounded-lg border border-studio-sand bg-stone-50 p-3 scrollbar-thin">
        <pre className="font-mono-tech whitespace-pre-wrap break-all text-[11px] leading-relaxed text-foreground/80">
          {data.text}
          {data.truncated ? "\n… (truncated)" : ""}
        </pre>
      </div>
    );
  }

  if (data.kind === "pdf" && pdfUrl) {
    return (
      <iframe
        src={pdfUrl}
        title={`${item.name} preview`}
        className="h-56 w-full rounded-lg border border-studio-sand bg-white"
      />
    );
  }

  return (
    <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-lg border border-studio-sand bg-stone-50 text-center">
      <FileTypeTile name={item.name} />
      <p className="text-xs text-muted-foreground">
        {data.kind === "too_large" ? "Preview not available for this size" : "No inline preview for this format"}
      </p>
      <Button
        size="sm"
        variant="outline"
        className="bg-white"
        onClick={() => {
          if (size <= 8 * 1024 * 1024) setForced(true);
          else toast.info("File is large — use Download instead");
        }}
      >
        Try loading preview
      </Button>
    </div>
  );
}

export function Inspector({ item, onClose, onAction }: InspectorProps) {
  const metaQuery = useQuery({
    queryKey: ["meta", item?.path],
    queryFn: () => getObjectMeta(item!.path),
    enabled: item !== null,
    staleTime: 15_000,
    retry: 1,
  });

  const meta = useMemo(() => metaQuery.data?.meta ?? null, [metaQuery.data]);

  if (!item) return null;

  const isFolder = item.type === "folder";

  return (
    <aside
      className={cn(
        "z-40 flex shrink-0 flex-col border-l border-studio-sand bg-white",
        "fixed inset-y-0 right-0 w-[320px] shadow-xl lg:relative lg:inset-auto lg:w-[340px] lg:shadow-none",
      )}
      aria-label="Item inspector"
    >
      <div className="flex items-start justify-between gap-2 border-b border-studio-sand/80 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {isFolder ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-stone-400" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
            </div>
          ) : (
            <FileTypeTile name={item.name} className="h-9 w-9 [&_svg]:h-4 [&_svg]:w-4" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" title={item.name}>
              {item.name}
            </p>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {isFolder ? "Folder" : categoryLabel(item.name)}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0" onClick={onClose} aria-label="Close inspector">
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
        {isFolder ? (
          <div className="space-y-4">
            {metaQuery.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : meta && meta.type === "folder" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-studio-sand bg-stone-50 p-3">
                  <p className="text-lg font-semibold tabular-nums">{meta.objectCount}</p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Objects</p>
                </div>
                <div className="rounded-lg border border-studio-sand bg-stone-50 p-3">
                  <p className="text-lg font-semibold tabular-nums">{formatBytes(meta.size)}</p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total size</p>
                </div>
              </div>
            ) : null}
            <p className="rounded-lg border border-studio-sand bg-stone-50 p-3 text-[11px] leading-relaxed text-muted-foreground">
              Folders in S3 are object-key prefixes, not real directories. An empty folder stays visible
              because a zero-byte marker object holds its place.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <PreviewBody key={item.path} item={item} />
            {metaQuery.isPending && !meta ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : meta && meta.type === "file" ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <MetaRow label="Size">{formatBytes(meta.size)}</MetaRow>
                <MetaRow label="Type">{meta.contentType}</MetaRow>
                <MetaRow label="Modified">{formatDate(meta.lastModified)}</MetaRow>
                <MetaRow label="ETag">
                  <span className="font-mono-tech break-all text-[11px]">{meta.etag || "—"}</span>
                </MetaRow>
              </div>
            ) : null}
            <div>
              <MetaRow label="S3 Key">
                <div className="flex items-start gap-1.5">
                  <code className="font-mono-tech break-all rounded bg-stone-100 px-1.5 py-1 text-[11px] leading-relaxed">
                    {item.key}
                  </code>
                </div>
              </MetaRow>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-studio-sand/80 px-4 py-3">
        <div className="flex items-center gap-2">
          {!isFolder && (
            <Button
              size="sm"
              className="flex-1 gap-2 bg-studio-crimson hover:bg-studio-crimson-dark"
              onClick={() => onAction("download", item)}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          )}
          {isFolder && (
            <Button size="sm" className="flex-1 gap-2 bg-studio-crimson hover:bg-studio-crimson-dark" onClick={() => onAction("open", item)}>
              <FolderInput className="h-3.5 w-3.5" />
              Open
            </Button>
          )}
          <Button size="sm" variant="outline" className="bg-white" onClick={() => onAction("rename", item)} aria-label="Rename">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="bg-white" onClick={() => onAction("move", item)} aria-label="Move">
            <FolderOutput className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="bg-white" onClick={() => onAction("copy", item)} aria-label="Copy">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="bg-white text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onAction("delete", item)}
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}