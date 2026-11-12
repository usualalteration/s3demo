import { CheckCircle2, CloudUpload, RotateCcw, X, XCircle } from "lucide-react";
import { formatBytes } from "@/lib/files";
import type { UploadItem } from "@/lib/types";

interface UploadQueueProps {
  uploads: UploadItem[];
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
  onClearCompleted: () => void;
}

export default function UploadQueue({ uploads, onRetry, onDismiss, onClearCompleted }: UploadQueueProps) {
  if (uploads.length === 0) return null;

  const completed = uploads.filter((u) => u.status === "done").length;
  const confirming = uploads.find((u) => u.status === "confirming") ?? null;

  return (
    <div
      className="fixed bottom-5 right-5 z-40 w-[22rem] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-xl border border-linen bg-white shadow-xl"
      role="region"
      aria-label="Upload queue"
    >
      <div className="flex items-center justify-between border-b border-linen bg-charcoal px-4 py-3">
        <div className="flex items-center gap-2">
          <CloudUpload className="h-4 w-4 text-crimson-accent" aria-hidden="true" />
          <p className="text-sm font-semibold text-white">
            {confirming
              ? "Needs your confirmation"
              : completed === uploads.length
                ? "Uploads complete"
                : `Uploading ${completed}/${uploads.length}`}
          </p>
        </div>
        {completed === uploads.length && !confirming ? (
          <button
            type="button"
            onClick={onClearCompleted}
            aria-label="Clear completed uploads"
            className="rounded p-1 text-zinc-400 transition-base hover:text-white focus:outline-none focus:ring-2 focus:ring-crimson/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <ul className="max-h-64 divide-y divide-linen overflow-y-auto scrollbar-thin">
        {uploads.map((item) => (
          <li key={item.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-charcoal" title={item.name}>
                  {item.name}
                </p>
                <p className="text-xs text-mutedink">{formatBytes(item.size)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {item.status === "error" ? (
                  <button
                    type="button"
                    onClick={() => onRetry(item.id)}
                    aria-label={`Retry uploading ${item.name}`}
                    title="Retry"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-crimson transition-base hover:bg-crimson/10 focus:outline-none focus:ring-2 focus:ring-crimson/30"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
                {item.status === "done" || item.status === "error" ? (
                  <button
                    type="button"
                    onClick={() => onDismiss(item.id)}
                    aria-label={`Dismiss ${item.name} from upload list`}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-mutedink transition-base hover:bg-ivory hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-crimson/30"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
                {item.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                ) : null}
                {item.status === "error" ? (
                  <XCircle className="h-4 w-4 text-crimson" aria-hidden="true" />
                ) : null}
              </div>
            </div>

            {item.status === "processing" || item.status === "queued" ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ivory">
                <div
                  className="h-full rounded-full bg-crimson transition-all duration-300"
                  style={{ width: `${Math.max(4, Math.round(item.progress))}%` }}
                  role="progressbar"
                  aria-valuenow={Math.round(item.progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Upload progress for ${item.name}`}
                />
              </div>
            ) : null}
            {item.status === "processing" ? (
              <p className="mt-1 text-[11px] text-mutedink">
                {item.progress >= 95 ? "Verifying in storage…" : `Uploading… ${Math.round(item.progress)}%`}
              </p>
            ) : null}
            {item.status === "error" ? (
              <p className="mt-1 text-[11px] leading-relaxed text-crimson">{item.error}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
