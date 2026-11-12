import { useCallback, useEffect, useState } from "react";
import { Copy, Download, FolderInput, Loader2, Pencil, Trash2, X } from "lucide-react";
import { FileIcon } from "./FileIcon";
import { storageApi, ApiError } from "@/lib/api";
import type { FileEntry, MetadataResponse } from "@/lib/types";
import {
  formatBytes,
  formatDate,
  isImagePreviewable,
  isPdfPreviewable,
  isTextPreviewable,
} from "@/lib/files";

const PREVIEW_MAX_BYTES = 512 * 1024;

interface PreviewState {
  loading: boolean;
  error: string | null;
  kind: "image" | "text" | "pdf" | "binary" | null;
  image?: string; // data URL
  text?: string;
  pdf?: string; // object URL
}

interface InspectorProps {
  entry: FileEntry | null;
  onClose: () => void;
  onDownload: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onCopy: (entry: FileEntry) => void;
  onMove: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
}

function b64ToBlob(b64: string, contentType: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

export default function Inspector({ entry, onClose, onDownload, onRename, onCopy, onMove, onDelete }: InspectorProps) {
  const [meta, setMeta] = useState<MetadataResponse | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ loading: false, error: null, kind: null });

  const loadPreview = useCallback(async (file: FileEntry) => {
    const wantsImage = isImagePreviewable(file.name);
    const wantsText = isTextPreviewable(file.name);
    const wantsPdf = isPdfPreviewable(file.name);
    if (!wantsImage && !wantsText && !wantsPdf) {
      setPreview({ loading: false, error: null, kind: "binary" });
      return;
    }
    setPreview({ loading: true, error: null, kind: null });
    try {
      const size = file.size || 0;
      if (size > PREVIEW_MAX_BYTES) {
        setPreview({
          loading: false,
          error: "Preview is only available for files up to 512 KB.",
          kind: null,
        });
        return;
      }
      const res = await storageApi.download(file.path);
      const blob = b64ToBlob(res.contentBase64, res.contentType);
      if (wantsImage) {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        setPreview({ loading: false, error: null, kind: "image", image: dataUrl });
      } else if (wantsPdf) {
        const url = URL.createObjectURL(blob);
        setPreview({ loading: false, error: null, kind: "pdf", pdf: url });
      } else {
        setPreview({
          loading: false,
          error: null,
          kind: "text",
          text: new TextDecoder().decode(b64ToBytes(res.contentBase64)),
        });
      }
    } catch (err) {
      setPreview({
        loading: false,
        error: err instanceof ApiError ? err.message : "Preview could not be loaded.",
        kind: null,
      });
    }
  }, []);

  useEffect(() => {
    if (!entry) {
      setMeta(null);
      setMetaError(null);
      setPreview({ loading: false, error: null, kind: null });
      return;
    }
    let cancelled = false;
    setMeta(null);
    setMetaError(null);
    storageApi
      .metadata(entry.path)
      .then((res) => {
        if (!cancelled) setMeta(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setMetaError(err instanceof ApiError ? err.message : "Metadata could not be loaded.");
        }
      });
    loadPreview(entry);
    return () => {
      cancelled = true;
    };
  }, [entry, loadPreview]);

  // Revoke blob URLs when the preview changes or unmounts.
  useEffect(() => {
    return () => {
      if (preview.pdf) {
        URL.revokeObjectURL(preview.pdf);
      }
    };
  }, [preview.pdf]);

  if (!entry) return null;

  const metaRows = [
    { label: "Object key", value: `s3-object-studio/${entry.path}`, mono: true },
    { label: "Size", value: formatBytes(meta?.size ?? entry.size) },
    { label: "Content type", value: meta?.contentType ?? "—", mono: true },
    { label: "Last modified", value: formatDate(meta?.lastModified ?? entry.lastModified) },
    { label: "ETag", value: meta?.etag ? `${meta.etag}` : "—", mono: true },
  ];

  return (
    <aside className="flex h-full w-full flex-col border-l border-linen bg-white lg:w-96" aria-label="File details">
      <div className="flex items-center justify-between border-b border-linen px-5 py-4">
        <p className="text-sm font-semibold uppercase tracking-wider text-mutedink">Details</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details panel"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-mutedink transition-base hover:bg-ivory hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-crimson/30"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">
        {/* Header */}
        <div className="flex items-start gap-3">
          <FileIcon name={entry.name} box />
          <div className="min-w-0 flex-1">
            <p className="break-words text-base font-semibold text-charcoal" title={entry.name}>
              {entry.name}
            </p>
            <p className="mt-0.5 text-xs text-mutedink">
              {meta ? formatBytes(meta.size) : formatBytes(entry.size)} · uploaded file
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onDownload(entry)}
            className="flex h-9 items-center justify-center gap-2 rounded-lg bg-crimson text-sm font-semibold text-white transition-base hover:bg-crimson-dark focus:outline-none focus:ring-2 focus:ring-crimson/40"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download
          </button>
          <button
            type="button"
            onClick={() => onRename(entry)}
            className="flex h-9 items-center justify-center gap-2 rounded-lg border border-linen bg-white text-sm font-medium text-charcoal transition-base hover:border-charcoal/30 focus:outline-none focus:ring-2 focus:ring-crimson/20"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Rename
          </button>
          <button
            type="button"
            onClick={() => onCopy(entry)}
            className="flex h-9 items-center justify-center gap-2 rounded-lg border border-linen bg-white text-sm font-medium text-charcoal transition-base hover:border-charcoal/30 focus:outline-none focus:ring-2 focus:ring-crimson/20"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy to…
          </button>
          <button
            type="button"
            onClick={() => onMove(entry)}
            className="flex h-9 items-center justify-center gap-2 rounded-lg border border-linen bg-white text-sm font-medium text-charcoal transition-base hover:border-charcoal/30 focus:outline-none focus:ring-2 focus:ring-crimson/20"
          >
            <FolderInput className="h-4 w-4" aria-hidden="true" />
            Move to…
          </button>
          <button
            type="button"
            onClick={() => onDelete(entry)}
            className="col-span-2 flex h-9 items-center justify-center gap-2 rounded-lg border border-crimson/30 bg-crimson/5 text-sm font-medium text-crimson transition-base hover:bg-crimson/10 focus:outline-none focus:ring-2 focus:ring-crimson/30"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete
          </button>
        </div>

        {/* Preview */}
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-mutedink">Preview</p>
          {preview.loading ? (
            <div className="flex h-40 items-center justify-center rounded-xl border border-linen bg-ivory">
              <span className="flex items-center gap-2 text-sm text-mutedink">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading preview…
              </span>
            </div>
          ) : preview.error ? (
            <div className="rounded-xl border border-linen bg-ivory px-4 py-3 text-sm text-mutedink">
              {preview.error}
            </div>
          ) : preview.kind === "image" && preview.image ? (
            <div className="overflow-hidden rounded-xl border border-linen bg-ivory">
              <img
                src={preview.image}
                alt={`Preview of ${entry.name}`}
                className="max-h-72 w-full object-contain"
              />
            </div>
          ) : preview.kind === "pdf" && preview.pdf ? (
            <iframe
              src={preview.pdf}
              title={`Preview of ${entry.name}`}
              className="h-72 w-full rounded-xl border border-linen bg-white"
            />
          ) : preview.kind === "text" ? (
            <pre className="max-h-72 overflow-auto rounded-xl border border-linen bg-ivory p-3 font-mono text-xs leading-relaxed text-charcoal scrollbar-thin">
              {preview.text}
            </pre>
          ) : preview.kind === "binary" ? (
            <div className="rounded-xl border border-dashed border-linen bg-ivory px-4 py-6 text-center text-sm text-mutedink">
              No inline preview for this file type.
              <br />
              Use the Download button to retrieve it.
            </div>
          ) : (
            <div className="h-40 rounded-xl border border-dashed border-linen bg-ivory" />
          )}
        </div>

        {/* Metadata */}
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-mutedink">Metadata</p>
          {metaError ? (
            <p className="rounded-lg border border-crimson/20 bg-crimson/5 px-3 py-2 text-sm text-crimson">
              {metaError}
            </p>
          ) : (
            <dl className="overflow-hidden rounded-xl border border-linen">
              {metaRows.map((row, index) => (
                <div
                  key={row.label}
                  className={`grid grid-cols-[7rem_1fr] gap-2 px-3 py-2.5 text-sm ${
                    index % 2 === 0 ? "bg-white" : "bg-ivory/60"
                  }`}
                >
                  <dt className="text-mutedink">{row.label}</dt>
                  <dd
                    className={`break-all text-charcoal ${row.mono ? "font-mono text-xs leading-relaxed" : ""}`}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
              {meta?.metadata && Object.keys(meta.metadata).length > 0
                ? Object.entries(meta.metadata).map(([key, value]) => (
                    <div
                      key={key}
                      className="grid grid-cols-[7rem_1fr] gap-2 bg-white px-3 py-2.5 text-sm"
                    >
                      <dt className="text-mutedink">{key}</dt>
                      <dd className="break-all font-mono text-xs text-charcoal">{value}</dd>
                    </div>
                  ))
                : null}
            </dl>
          )}
        </div>
      </div>
    </aside>
  );
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
