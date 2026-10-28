import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderInput, FolderPlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getObjectMeta } from "@/lib/api";
import { formatBytes, validateFolderPath, validateName } from "@/lib/format";
import type { StorageItem } from "./types";

/* ------------------------------------------------------------------ */
/* Shared bits                                                          */
/* ------------------------------------------------------------------ */

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-xs text-studio-crimson" role="alert">{message}</p>;
}

/* ------------------------------------------------------------------ */
/* Create folder                                                        */
/* ------------------------------------------------------------------ */

interface CreateFolderDialogProps {
  open: boolean;
  onClose: () => void;
  /** Destination parent folder (trailing slash, "" for root). */
  parentFolder: string;
  onSubmit: (name: string) => Promise<string | null>;
}

export function CreateFolderDialog({ open, onClose, parentFolder, onSubmit }: CreateFolderDialogProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateName(name);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    const failure = await onSubmit(name.trim());
    setBusy(false);
    if (failure) {
      setError(failure);
    } else {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-studio-crimson" />
            Create Folder
          </DialogTitle>
          <DialogDescription>
            S3 represents folders as object-key prefixes. The new folder will be created inside{" "}
            <code className="font-mono-tech rounded bg-stone-100 px-1 py-0.5 text-[11px]">
              {parentFolder || "s3-studio/"}
            </code>
            .
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="folder-name-input">Folder name</Label>
            <Input
              id="folder-name-input"
              name="folderName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Projects"
              autoFocus
              autoComplete="off"
              maxLength={200}
            />
            <FieldError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="bg-white" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="gap-2 bg-studio-crimson hover:bg-studio-crimson-dark">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
              Create Folder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Rename                                                               */
/* ------------------------------------------------------------------ */

interface RenameDialogProps {
  item: StorageItem | null;
  onClose: () => void;
  onSubmit: (item: StorageItem, newName: string) => Promise<string | null>;
}

export function RenameDialog({ item, onClose, onSubmit }: RenameDialogProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setError(null);
      setBusy(false);
    }
  }, [item]);

  if (!item) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateName(name);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    const failure = await onSubmit(item, name.trim());
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  };

  return (
    <Dialog open={item !== null} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename {item.type === "folder" ? "Folder" : "File"}</DialogTitle>
          <DialogDescription>
            Renaming uses S3 copy-and-delete: the object is copied to the new key and verified before the
            original is removed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rename-input">New name</Label>
            <Input
              id="rename-input"
              name="newName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              autoComplete="off"
              maxLength={200}
            />
            <FieldError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="bg-white" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-studio-crimson hover:bg-studio-crimson-dark">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Move / Copy                                                          */
/* ------------------------------------------------------------------ */

interface MoveCopyDialogProps {
  mode: "move" | "copy";
  item: StorageItem | null;
  currentFolder: string;
  onClose: () => void;
  onSubmit: (item: StorageItem, destFolder: string, destName?: string) => Promise<string | null>;
}

export function MoveCopyDialog({ mode, item, currentFolder, onClose, onSubmit }: MoveCopyDialogProps) {
  const [dest, setDest] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (item) {
      setDest(currentFolder);
      setNewName("");
      setError(null);
      setBusy(false);
    }
  }, [item, currentFolder]);

  if (!item) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateFolderPath(dest);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    const failure = await onSubmit(item, dest.trim().replace(/\/+$/, ""), newName.trim() || undefined);
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  };

  const normalize = (value: string) => value.trim().replace(/^\/+|\/+$/g, "");

  return (
    <Dialog open={item !== null} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="h-4 w-4 text-studio-crimson" />
            {mode === "move" ? "Move" : "Copy"} {item.type === "folder" ? "Folder" : "File"}
          </DialogTitle>
          <DialogDescription>
            {mode === "move"
              ? "The object is copied to the destination and verified before the original is deleted."
              : "A copy of the object will be created at the destination."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md bg-stone-50 px-3 py-2">
            <p className="truncate text-xs text-muted-foreground">
              {item.type === "file" ? "File" : "Folder"}:{" "}
              <span className="font-medium text-foreground">{item.path}</span>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dest-folder-input">Destination folder</Label>
            <Input
              id="dest-folder-input"
              name="destFolder"
              value={dest}
              onChange={(event) => setDest(event.target.value)}
              placeholder='e.g. "documents/2024" or empty for the root'
              autoComplete="off"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 bg-white px-2 text-[11px]"
                onClick={() => setDest("")}
              >
                Root
              </Button>
              {currentFolder && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 bg-white px-2 text-[11px]"
                  onClick={() => setDest(currentFolder)}
                >
                  Here ({normalize(currentFolder) || "root"})
                </Button>
              )}
            </div>
            <FieldError message={error} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dest-name-input">
              {mode === "copy" ? "Copy name" : "New name"} <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="dest-name-input"
              name="destName"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={item.name}
              autoComplete="off"
              maxLength={200}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="bg-white" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-studio-crimson hover:bg-studio-crimson-dark">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "move" ? "Move" : "Copy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Delete confirmation                                                  */
/* ------------------------------------------------------------------ */

interface DeleteDialogProps {
  item: StorageItem | null;
  onClose: () => void;
  onConfirm: (item: StorageItem, recursive: boolean) => Promise<void>;
}

export function DeleteDialog({ item, onClose, onConfirm }: DeleteDialogProps) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (item) setBusy(false);
  }, [item]);

  const folderMeta = useQuery({
    queryKey: ["meta", item?.path],
    queryFn: () => getObjectMeta(item!.path),
    enabled: item !== null && item.type === "folder",
    staleTime: 5_000,
    retry: 0,
  });

  if (!item) return null;

  const isFolder = item.type === "folder";
  const meta = folderMeta.data?.meta;
  const count = isFolder && meta?.type === "folder" ? meta.objectCount : null;
  const hasContents = isFolder && folderMeta.isSuccess && meta?.type === "folder" && meta.objectCount > 0;

  const handleConfirm = async () => {
    setBusy(true);
    await onConfirm(item, isFolder);
    setBusy(false);
    onClose();
  };

  return (
    <AlertDialog open={item !== null} onOpenChange={(value) => !value && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {isFolder ? "folder" : "file"} “{item.name}”?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                This permanently deletes{" "}
                <code className="font-mono-tech rounded bg-stone-100 px-1 py-0.5 text-[11px]">{item.key}</code> from
                S3 storage. This action cannot be undone.
              </p>
              {isFolder && folderMeta.isPending && <Skeleton className="h-4 w-48" />}
              {isFolder && hasContents && meta?.type === "folder" && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                  This folder contains <strong>{count} object{count === 1 ? "" : "s"}</strong> (
                  {formatBytes(meta.size)} total). All of them will be deleted.
                </p>
              )}
              {isFolder && folderMeta.isSuccess && meta?.type === "folder" && meta.objectCount === 0 && (
                <p className="rounded-md border border-studio-sand bg-stone-50 px-3 py-2 text-muted-foreground">
                  The folder is empty — only its marker object will be removed.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="gap-2 bg-studio-crimson hover:bg-studio-crimson-dark"
            disabled={busy || (isFolder && folderMeta.isPending)}
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}