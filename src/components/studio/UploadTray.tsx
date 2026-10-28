import { AlertTriangle, Check, Loader2, RotateCcw, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import type { UploadTask } from "./useUploads";

interface UploadTrayProps {
  tasks: UploadTask[];
  onCancel: (id: string) => void;
  onOverwrite: (id: string) => void;
  onRemove: (id: string) => void;
  onClearFinished: () => void;
  folder: string;
}

const STATUS_TEXT: Record<UploadTask["status"], string> = {
  encoding: "Preparing…",
  uploading: "Uploading…",
  done: "Uploaded",
  error: "Failed",
  canceled: "Canceled",
  conflict: "Already exists",
};

export function UploadTray({ tasks, onCancel, onOverwrite, onRemove, onClearFinished, folder }: UploadTrayProps) {
  if (tasks.length === 0) return null;

  const active = tasks.filter((task) => task.status === "encoding" || task.status === "uploading").length;
  const finished = tasks.length - active;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-xl border border-studio-sand bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-studio-sand/80 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <UploadCloud className="h-4 w-4 text-studio-crimson" />
          <p className="text-[13px] font-semibold">Uploads</p>
          <span className="text-[11px] text-muted-foreground">
            {active > 0 ? `${active} in progress` : `${tasks.length} item${tasks.length === 1 ? "" : "s"}`}
          </span>
        </div>
        {finished > 0 && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={onClearFinished}>
            Clear finished
          </Button>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto px-4 py-2.5 scrollbar-thin">
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li key={task.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {task.status === "done" && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                  {task.status === "error" && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-studio-crimson" />}
                  {task.status === "conflict" && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                  {(task.status === "encoding" || task.status === "uploading") && (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-studio-crimson" />
                  )}
                  {task.status === "canceled" && <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium" title={task.name}>
                      {task.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatBytes(task.size)} · {STATUS_TEXT[task.status]}
                      {task.status === "uploading" && ` ${Math.round(task.progress * 100)}%`}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {task.status === "conflict" && (
                    <>
                      <Button
                        size="sm"
                        className="h-6 bg-studio-crimson px-2 text-[11px] hover:bg-studio-crimson-dark"
                        onClick={() => onOverwrite(task.id)}
                      >
                        Overwrite
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => onRemove(task.id)}>
                        Skip
                      </Button>
                    </>
                  )}
                  {(task.status === "encoding" || task.status === "uploading") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px] hover:text-studio-crimson"
                      onClick={() => onCancel(task.id)}
                    >
                      Cancel
                    </Button>
                  )}
                  {(task.status === "done" || task.status === "error" || task.status === "canceled") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => onRemove(task.id)}
                      aria-label={`Remove ${task.name} from list`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {(task.status === "uploading" || task.status === "encoding") && (
                <Progress
                  value={task.status === "encoding" ? undefined : task.progress * 100}
                  className="h-1.5"
                  indicatorClassName={cn(task.status === "encoding" && "animate-pulse")}
                />
              )}
              {task.status === "error" && task.error && (
                <p className="text-[10px] text-studio-crimson">{task.error}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-studio-sand/80 px-4 py-2">
        <p className="truncate font-mono-tech text-[10px] text-muted-foreground" title={folder || "s3-studio/"}>
          → {folder || "s3-studio/"}
        </p>
      </div>
    </div>
  );
}