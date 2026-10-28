import { useCallback, useRef, useState } from "react";
import { MAX_UPLOAD_BYTES, readFileAsBase64, uploadObject } from "@/lib/api";
import { formatBytes } from "@/lib/format";

export type UploadStatus =
  | "encoding"
  | "uploading"
  | "done"
  | "error"
  | "canceled"
  | "conflict";

export interface UploadTask {
  id: string;
  name: string;
  size: number;
  progress: number; // 0..1
  status: UploadStatus;
  error?: string;
  /** Cached base64 payload for conflict retry. */
  payload?: string;
  contentType?: string;
}

interface UseUploadsOptions {
  /** Folder path (trailing slash, "" for root) uploads go into. */
  folder: string;
  /** Called after any successful upload so lists/stats refresh. */
  onChanged: () => void;
}

export function useUploads({ folder, onChanged }: UseUploadsOptions) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const aborts = useRef(new Map<string, () => void>());
  const folderRef = useRef(folder);
  folderRef.current = folder;

  const patch = useCallback((id: string, changes: Partial<UploadTask>) => {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...changes } : task)));
  }, []);

  const run = useCallback(
    async (task: UploadTask, payload: string, overwrite: boolean) => {
      patch(task.id, { status: "uploading", progress: 0 });
      try {
        await uploadObject(
          {
            path: folderRef.current,
            name: task.name,
            data: payload,
            contentType: task.contentType,
            overwrite,
          },
          {
            onProgress: (fraction) => patch(task.id, { progress: fraction }),
            registerAbort: (abort) => aborts.current.set(task.id, abort),
          },
        );
        patch(task.id, { status: "done", progress: 1, payload: undefined });
        onChanged();
      } catch (error) {
        const code = (error as { code?: string })?.code ?? "ERROR";
        const message = (error as Error)?.message ?? "Upload failed";
        if (code === "EXISTS") {
          patch(task.id, { status: "conflict", payload });
        } else if (code === "CANCELED") {
          patch(task.id, { status: "canceled" });
        } else {
          patch(task.id, { status: "error", error: message });
        }
      } finally {
        aborts.current.delete(task.id);
      }
    },
    [patch, onChanged],
  );

  const enqueue = useCallback(
    async (files: File[] | FileList) => {
      const list = Array.from(files);
      for (const file of list) {
        const id = crypto.randomUUID();
        const task: UploadTask = {
          id,
          name: file.name,
          size: file.size,
          progress: 0,
          status: "encoding",
          contentType: file.type || undefined,
        };
        setTasks((current) => [...current, task]);
        if (file.size > MAX_UPLOAD_BYTES) {
          patch(id, {
            status: "error",
            error: `File exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} direct upload limit`,
          });
          continue;
        }
        try {
          const payload = await readFileAsBase64(file);
          await run({ ...task }, payload, false);
        } catch (error) {
          patch(id, {
            status: "error",
            error: (error as Error)?.message ?? "Could not read file",
          });
        }
      }
    },
    [patch, run],
  );

  const overwrite = useCallback(
    async (id: string) => {
      const task = tasks.find((entry) => entry.id === id);
      if (!task?.payload) return;
      await run(task, task.payload, true);
    },
    [tasks, run],
  );

  const cancel = useCallback((id: string) => {
    aborts.current.get(id)?.();
  }, []);

  const remove = useCallback((id: string) => {
    aborts.current.get(id)?.();
    aborts.current.delete(id);
    setTasks((current) => current.filter((task) => task.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setTasks((current) =>
      current.filter((task) => task.status === "encoding" || task.status === "uploading"),
    );
  }, []);

  return { tasks, enqueue, overwrite, cancel, remove, clearFinished };
}