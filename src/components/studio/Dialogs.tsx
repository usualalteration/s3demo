import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ChevronRight,
  FolderInput,
  FolderPlus,
  Home,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FolderIcon } from "./FileIcon";
import { storageApi } from "@/lib/api";
import type { FolderEntry } from "@/lib/types";
import type { AnyEntry } from "./FileBrowser";

function DialogError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-crimson/20 bg-crimson/5 px-3 py-2 text-sm text-crimson">
      {message}
    </p>
  );
}

/* ---------------- New Folder ---------------- */

export function NewFolderDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (path: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(trimmed);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Folder could not be created.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-crimson" aria-hidden="true" />
            Create Folder
          </DialogTitle>
          <DialogDescription>
            Give the new folder a name. Use slashes to create nested folders, e.g.{" "}
            <span className="font-mono text-xs">documents/reports</span>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="new-folder-name" className="block text-sm font-medium text-charcoal">
              Folder name
            </label>
            <input
              id="new-folder-name"
              name="folderName"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. projects/2026"
              className="h-10 w-full rounded-lg border border-linen bg-white px-3 text-sm text-charcoal transition-base placeholder:text-mutedink/60 focus:border-crimson focus:outline-none focus:ring-2 focus:ring-crimson/20"
            />
          </div>
          <DialogError message={error} />
          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-lg border border-linen bg-white px-4 text-sm font-medium text-charcoal transition-base hover:border-charcoal/30 focus:outline-none focus:ring-2 focus:ring-crimson/20"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="h-9 rounded-lg bg-crimson px-4 text-sm font-semibold text-white transition-base hover:bg-crimson-dark focus:outline-none focus:ring-2 focus:ring-crimson/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Rename ---------------- */

export function RenameDialog({
  entry,
  onOpenChange,
  onRename,
}: {
  entry: AnyEntry | null;
  onOpenChange: (open: boolean) => void;
  onRename: (entry: AnyEntry, newName: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (entry) {
      setName(entry.name);
      setError(null);
      setSubmitting(false);
    }
  }, [entry]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!entry || submitting) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === entry.name) {
      onOpenChange(false);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onRename(entry, trimmed);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-crimson" aria-hidden="true" />
            Rename {entry?.kind === "folder" ? "Folder" : "File"}
          </DialogTitle>
          <DialogDescription>Enter a new name. The object keeps its contents and location.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="rename-input" className="block text-sm font-medium text-charcoal">
              New name
            </label>
            <input
              id="rename-input"
              name="newName"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 w-full rounded-lg border border-linen bg-white px-3 text-sm text-charcoal transition-base focus:border-crimson focus:outline-none focus:ring-2 focus:ring-crimson/20"
            />
          </div>
          <DialogError message={error} />
          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-lg border border-linen bg-white px-4 text-sm font-medium text-charcoal transition-base hover:border-charcoal/30 focus:outline-none focus:ring-2 focus:ring-crimson/20"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="h-9 rounded-lg bg-crimson px-4 text-sm font-semibold text-white transition-base hover:bg-crimson-dark focus:outline-none focus:ring-2 focus:ring-crimson/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Renaming…" : "Rename"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Copy / Move ---------------- */

export function CopyMoveDialog({
  request,
  onOpenChange,
  onComplete,
}: {
  request: { entry: AnyEntry; mode: "copy" | "move" } | null;
  onOpenChange: (open: boolean) => void;
  onComplete: (entry: AnyEntry, destinationFolder: string, mode: "copy" | "move") => Promise<void>;
}) {
  const [browseFolder, setBrowseFolder] = useState("");
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!request) return;
    setBrowseFolder("");
    setError(null);
    setSubmitting(false);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    setLoading(true);
    storageApi
      .list(browseFolder)
      .then((res) => {
        if (!cancelled) setFolders(res.folders ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Folders could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request, browseFolder]);

  const submit = async () => {
    if (!request || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onComplete(request.entry, browseFolder, request.mode);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const mode = request?.mode ?? "copy";
  const segments = browseFolder.split("/").filter(Boolean);

  return (
    <Dialog open={request !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="h-5 w-5 text-crimson" aria-hidden="true" />
            {mode === "copy" ? "Copy to folder" : "Move to folder"}
          </DialogTitle>
          <DialogDescription>
            {mode === "copy"
              ? `Create a copy of “${request?.entry.name ?? ""}” in the chosen folder.`
              : `Move “${request?.entry.name ?? ""}” to the chosen folder.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Destination breadcrumb */}
          <div className="flex items-center flex-wrap gap-1 text-sm">
            <button
              type="button"
              onClick={() => setBrowseFolder("")}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-base focus:outline-none focus:ring-2 focus:ring-crimson/30 ${
                segments.length === 0 ? "font-semibold text-charcoal" : "text-mutedink hover:bg-ivory"
              }`}
            >
              <Home className="h-3.5 w-3.5" aria-hidden="true" />
              My Storage
            </button>
            {segments.map((segment, index) => {
              const target = segments.slice(0, index + 1).join("/");
              const isLast = index === segments.length - 1;
              return (
                <span key={target} className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-mutedink/60" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => setBrowseFolder(target)}
                    className={`rounded px-1.5 py-0.5 transition-base focus:outline-none focus:ring-2 focus:ring-crimson/30 ${
                      isLast ? "font-semibold text-charcoal" : "text-mutedink hover:bg-ivory"
                    }`}
                  >
                    {segment}
                  </button>
                </span>
              );
            })}
          </div>

          {/* Folder list */}
          <div className="max-h-60 overflow-y-auto rounded-xl border border-linen bg-white scrollbar-thin">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-mutedink">Loading folders…</p>
            ) : folders.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-mutedink">
                No subfolders here. You can select this location below.
              </p>
            ) : (
              <ul>
                {folders.map((folder) => (
                  <li key={folder.path}>
                    <button
                      type="button"
                      onClick={() => setBrowseFolder(folder.path)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-charcoal transition-base hover:bg-ivory focus:outline-none focus:ring-2 focus:ring-inset focus:ring-crimson/30"
                    >
                      <FolderIcon className="h-4 w-4 text-crimson" />
                      <span className="truncate">{folder.name}</span>
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-mutedink/50" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogError message={error} />

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-lg border border-linen bg-white px-4 text-sm font-medium text-charcoal transition-base hover:border-charcoal/30 focus:outline-none focus:ring-2 focus:ring-crimson/20"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="h-9 rounded-lg bg-crimson px-4 text-sm font-semibold text-white transition-base hover:bg-crimson-dark focus:outline-none focus:ring-2 focus:ring-crimson/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? mode === "copy"
                  ? "Copying…"
                  : "Moving…"
                : mode === "copy"
                  ? `Copy here${browseFolder ? ` → ${browseFolder}` : ""}`
                  : `Move here${browseFolder ? ` → ${browseFolder}` : ""}`}
            </button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Delete confirm ---------------- */

export function DeleteConfirmDialog({
  entries,
  onOpenChange,
  onDelete,
}: {
  entries: AnyEntry[] | null;
  onOpenChange: (open: boolean) => void;
  onDelete: (entries: AnyEntry[]) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entries) {
      setSubmitting(false);
      setError(null);
    }
  }, [entries]);

  const submit = async () => {
    if (!entries || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onDelete(entries);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const count = entries?.length ?? 0;
  const folders = entries?.filter((e) => e.kind === "folder").length ?? 0;
  const files = count - folders;

  return (
    <Dialog open={entries !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-crimson">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
            Delete {count === 1 ? "“" + (entries?.[0]?.name ?? "") + "”" : `${count} items`}?
          </DialogTitle>
          <DialogDescription>
            {count === 1
              ? entries?.[0]?.kind === "folder"
                ? "This permanently deletes the folder and every object inside it from cloud storage."
                : "This permanently deletes the file from cloud storage."
              : `This permanently deletes ${files} file${files === 1 ? "" : "s"} and ${folders} folder${folders === 1 ? "" : "s"} (including all nested objects) from cloud storage.`}
          </DialogDescription>
        </DialogHeader>

        {count > 1 ? (
          <ul className="max-h-40 overflow-y-auto rounded-xl border border-linen bg-white px-4 py-2 text-sm text-charcoal scrollbar-thin">
            {entries?.slice(0, 10).map((entry) => (
              <li key={entry.path} className="truncate py-1">
                {entry.kind === "folder" ? "📁" : "📄"} {entry.path}
              </li>
            ))}
            {count > 10 ? <li className="py-1 text-mutedink">…and {count - 10} more</li> : null}
          </ul>
        ) : null}

        <DialogError message={error} />

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg border border-linen bg-white px-4 text-sm font-medium text-charcoal transition-base hover:border-charcoal/30 focus:outline-none focus:ring-2 focus:ring-crimson/20"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex h-9 items-center gap-2 rounded-lg bg-crimson px-4 text-sm font-semibold text-white transition-base hover:bg-crimson-dark focus:outline-none focus:ring-2 focus:ring-crimson/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {submitting ? "Deleting…" : "Delete permanently"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Duplicate upload confirm ---------------- */

export function DuplicateDialog({
  name,
  onOpenChange,
  onResolve,
}: {
  name: string | null;
  onOpenChange: (open: boolean) => void;
  onResolve: (replace: boolean) => void;
}) {
  return (
    <Dialog open={name !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-crimson">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            File already exists
          </DialogTitle>
          <DialogDescription>
            An object named <span className="font-mono text-xs font-semibold">{name}</span> already exists
            in this folder. Do you want to replace it with the new upload?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onResolve(false)}
            className="h-9 rounded-lg border border-linen bg-white px-4 text-sm font-medium text-charcoal transition-base hover:border-charcoal/30 focus:outline-none focus:ring-2 focus:ring-crimson/20"
          >
            Keep existing
          </button>
          <button
            type="button"
            onClick={() => onResolve(true)}
            className="h-9 rounded-lg bg-crimson px-4 text-sm font-semibold text-white transition-base hover:bg-crimson-dark focus:outline-none focus:ring-2 focus:ring-crimson/40"
          >
            Replace file
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
