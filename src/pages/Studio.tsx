import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import Sidebar, { type StudioView } from "@/components/studio/Sidebar";
import Toolbar from "@/components/studio/Toolbar";
import FileBrowser, { type AnyEntry, type SortState } from "@/components/studio/FileBrowser";
import Inspector from "@/components/studio/Inspector";
import EmptyState from "@/components/studio/EmptyState";
import UploadQueue from "@/components/studio/UploadQueue";
import RecentFiles from "@/components/studio/RecentFiles";
import Overview from "@/components/studio/Overview";
import {
  CopyMoveDialog,
  DeleteConfirmDialog,
  DuplicateDialog,
  NewFolderDialog,
  RenameDialog,
} from "@/components/studio/Dialogs";
import { ApiError, storageApi } from "@/lib/api";
import { categoryOf, parentPath } from "@/lib/files";
import type {
  FileEntry,
  FolderEntry,
  ListingResponse,
  StatsResponse,
  UploadItem,
} from "@/lib/types";

const MAX_INLINE_UPLOAD = 700 * 1024;      // single-request upload ceiling (matches backend)
const MAX_TOTAL_UPLOAD = 64 * 1024 * 1024; // matches backend chunked-upload ceiling
const DOWNLOAD_CHUNK = 512 * 1024;         // ranged download chunk size (matches backend)
const PAGE_SIZE = 50;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function Studio() {
  // view + navigation
  const [view, setView] = useState<StudioView>("storage");
  const [folder, setFolder] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // data
  const [listing, setListing] = useState<ListingResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // browser controls
  const [displayMode, setDisplayMode] = useState<"list" | "grid">("list");
  const [sort, setSort] = useState<SortState>({ by: "name", dir: "asc" });
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);

  // selection + inspector
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [inspectorEntry, setInspectorEntry] = useState<FileEntry | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  // uploads
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSeq = useRef(0);
  const [dragActive, setDragActive] = useState(false);

  // dialogs
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<AnyEntry | null>(null);
  const [copyMoveRequest, setCopyMoveRequest] = useState<{ entry: AnyEntry; mode: "copy" | "move" } | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<AnyEntry[] | null>(null);

  /* ---------------- data loading ---------------- */

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setRefreshing(true);
      try {
        const [listRes, statsRes] = await Promise.all([
          storageApi.list(folder, debouncedSearch),
          storageApi.stats().catch(() => null),
        ]);
        setListing(listRes);
        if (statsRes) setStats(statsRes);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load your storage.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [folder, debouncedSearch],
  );

  useEffect(() => {
    setLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, debouncedSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  /* ---------------- uploads ---------------- */

  const updateUpload = (id: string, patch: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const runUpload = useCallback(
    async (item: UploadItem, overwrite: boolean): Promise<void> => {
      const { file, folder: targetFolder, name, size } = item;
      const id = item.id;

      if (size > MAX_TOTAL_UPLOAD) {
        updateUpload(id, {
          status: "error",
          error: `File exceeds the maximum upload size of 64 MB.`,
        });
        return;
      }

      updateUpload(id, { status: "processing", progress: 4, error: undefined });

      try {
        if (size <= MAX_INLINE_UPLOAD) {
          updateUpload(id, { progress: 18 });
          const contentBase64 = await readAsBase64(file);
          updateUpload(id, { progress: 60 });
          const res = await storageApi.uploadSmall({
            filename: name,
            folder: targetFolder,
            contentType: file.type || "application/octet-stream",
            contentBase64,
            overwrite,
          });
          if (!res.ok) throw new ApiError("Upload failed", "upload_failed");
          updateUpload(id, { status: "done", progress: 100 });
        } else {
          // Chunked upload for larger files.
          const init = await storageApi.chunkInit({
            filename: name,
            folder: targetFolder,
            totalSize: size,
            overwrite,
          });
          const uploadId = init.uploadId;
          const partBytes = init.partBytes || 600 * 1024;
          const parts = Math.ceil(size / partBytes);

          for (let partNumber = 1; partNumber <= parts; partNumber++) {
            const start = (partNumber - 1) * partBytes;
            const end = Math.min(start + partBytes, size);
            const chunk = file.slice(start, end);
            const chunkB64 = await readAsBase64(chunk as File);
            const res = await storageApi.chunkPart({
              uploadId,
              partNumber,
              partBase64: chunkB64,
            });
            if (!res.ok) throw new ApiError(`Chunk ${partNumber} failed`, "upload_failed");
            updateUpload(id, {
              progress: Math.min(95, Math.round((partNumber / parts) * 92) + 4),
            });
          }

          const done = await storageApi.chunkComplete({
            uploadId,
            filename: name,
            folder: targetFolder,
            totalSize: size,
            contentType: file.type || "application/octet-stream",
            overwrite,
          });
          if (!done.ok) throw new ApiError("Upload could not be finalized", "upload_failed");
          updateUpload(id, { status: "done", progress: 100 });
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === "duplicate") {
          updateUpload(id, { status: "confirming", progress: 100 });
          return;
        }
        // The platform may complete an activation whose response timed out:
        // verify whether the object actually made it to storage.
        if (err instanceof ApiError && err.code === "busy") {
          try {
            const key = targetFolder ? `${targetFolder}/${name}` : name;
            const meta = await storageApi.metadata(key);
            if (meta.ok && meta.size === size) {
              updateUpload(id, { status: "done", progress: 100 });
              return;
            }
          } catch {
            /* fall through to error */
          }
        }
        updateUpload(id, {
          status: "error",
          error: err instanceof ApiError ? err.message : "Upload failed. Please retry.",
        });
      }
    },
    [],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = Array.from(files);
      if (incoming.length === 0) return;
      const items: UploadItem[] = incoming.map((file) => {
        uploadSeq.current += 1;
        return {
          id: `upload-${uploadSeq.current}`,
          file,
          folder: view === "recent" || view === "overview" ? "" : folder,
          name: file.name,
          size: file.size,
          progress: 0,
          status: "queued" as const,
        };
      });
      setUploads((prev) => [...prev, ...items]);
      // Upload sequentially to keep request sizes predictable.
      (async () => {
        for (const item of items) {
          await runUpload(item, false);
        }
      })();
    },
    [folder, view, runUpload],
  );

  const retryUpload = (id: string) => {
    const item = uploads.find((u) => u.id === id);
    if (!item) return;
    runUpload(item, false);
  };

  const resolveDuplicate = (replace: boolean) => {
    const item = uploads.find((u) => u.status === "confirming");
    if (!item) return;
    if (replace) {
      runUpload(item, true);
    } else {
      updateUpload(item.id, { status: "done", progress: 100, error: undefined });
      toast.info(`Kept the existing “${item.name}”.`);
    }
  };

  /* ---------------- downloads ---------------- */

  const downloadEntry = useCallback(
    async (entry: FileEntry) => {
      const toastId = toast.loading(`Preparing “${entry.name}”…`);
      try {
        const meta = await storageApi.metadata(entry.path);
        const size = meta.ok ? meta.size : entry.size;
        const contentType = meta.ok ? meta.contentType : "application/octet-stream";

        if (size <= 700 * 1024) {
          const res = await storageApi.download(entry.path);
          const bytes = b64ToBytes(res.contentBase64);
          saveBlob(new Blob([bytes], { type: contentType }), entry.name);
        } else {
          const chunks: Uint8Array[] = [];
          let offset = 0;
          while (offset < size) {
            const length = Math.min(DOWNLOAD_CHUNK, size - offset);
            const res = await storageApi.downloadChunk(entry.path, offset, length);
            if (!res.ok) throw new ApiError("Download chunk failed", "download_failed");
            chunks.push(b64ToBytes(res.chunkBase64));
            offset += res.chunkSize;
            toast.loading(`Downloading “${entry.name}”… ${Math.round((offset / size) * 100)}%`, {
              id: toastId,
            });
          }
          const total = new Uint8Array(new ArrayBuffer(size));
          let cursor = 0;
          for (const chunk of chunks) {
            total.set(chunk, cursor);
            cursor += chunk.length;
          }
          saveBlob(new Blob([total], { type: contentType }), entry.name);
        }
        toast.success(`“${entry.name}” downloaded.`, { id: toastId });
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : `Could not download “${entry.name}”.`,
          { id: toastId },
        );
      }
    },
    [],
  );

  /* ---------------- mutations ---------------- */

  const afterMutation = () => {
    refresh();
  };

  const createFolder = async (path: string) => {
    await storageApi.createFolder(path);
    toast.success(`Folder “${path}” created.`);
    afterMutation();
  };

  const doRename = async (entry: AnyEntry, newName: string) => {
    await storageApi.rename(entry.path, newName, entry.kind);
    toast.success(`${entry.kind === "folder" ? "Folder" : "File"} renamed to “${newName}”.`);
    if (inspectorEntry && inspectorEntry.path === entry.path) {
      setInspectorEntry(null);
      setInspectorOpen(false);
    }
    afterMutation();
  };

  const doCopyMove = async (entry: AnyEntry, destinationFolder: string, mode: "copy" | "move") => {
    await storageApi.copy({
      key: entry.path,
      type: entry.kind,
      destinationFolder,
      move: mode === "move",
    });
    toast.success(
      mode === "move"
        ? `“${entry.name}” moved${destinationFolder ? ` to ${destinationFolder}` : " to My Storage"}.`
        : `“${entry.name}” copied${destinationFolder ? ` to ${destinationFolder}` : " to My Storage"}.`,
    );
    if (mode === "move" && inspectorEntry && inspectorEntry.path === entry.path) {
      setInspectorEntry(null);
      setInspectorOpen(false);
    }
    afterMutation();
  };

  const doDelete = async (entries: AnyEntry[]) => {
    for (const entry of entries) {
      await storageApi.delete(entry.path, entry.kind, true);
    }
    toast.success(
      entries.length === 1
        ? `“${entries[0].name}” deleted.`
        : `${entries.length} items deleted.`,
    );
    setSelectedPaths(new Set());
    if (inspectorEntry && entries.some((e) => e.path === inspectorEntry.path)) {
      setInspectorEntry(null);
      setInspectorOpen(false);
    }
    afterMutation();
  };

  /* ---------------- navigation & selection ---------------- */

  const navigateTo = (target: string) => {
    setFolder(target);
    setPage(1);
    setSelectedPaths(new Set());
    setInspectorEntry(null);
    setInspectorOpen(false);
    setView("storage");
  };

  const selectFile = (entry: FileEntry) => {
    setInspectorEntry(entry);
    setInspectorOpen(true);
  };

  const toggleSelect = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  /* ---------------- derived entries ---------------- */

  const entries = useMemo<AnyEntry[]>(() => {
    if (!listing) return [];
    const folders: AnyEntry[] = listing.folders.map((f: FolderEntry) => ({ ...f, kind: "folder" as const }));
    const files: AnyEntry[] = listing.files.map((f: FileEntry) => ({ ...f, kind: "file" as const }));
    if (typeFilter !== "all") {
      return files.filter((f) => categoryOf(f.name) === typeFilter);
    }
    const direction = sort.dir === "asc" ? 1 : -1;
    const compare = (a: AnyEntry, b: AnyEntry) => {
      if (sort.by === "name") {
        return a.name.localeCompare(b.name, undefined, { numeric: true }) * direction;
      }
      if (sort.by === "size") {
        return (a.size - b.size) * direction;
      }
      const aTime = a.lastModified ? Date.parse(a.lastModified) : 0;
      const bTime = b.lastModified ? Date.parse(b.lastModified) : 0;
      return (aTime - bTime) * direction;
    };
    return [...folders].sort(compare).concat([...files].sort(compare));
  }, [listing, sort, typeFilter]);

  const workspaceEmpty =
    !loading &&
    listing &&
    listing.totals.objects === 0 &&
    listing.totals.folders === 0 &&
    !debouncedSearch;

  /* ---------------- drag & drop ---------------- */

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragActive(false);
    if (event.dataTransfer?.files?.length) {
      addFiles(event.dataTransfer.files);
    }
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = (event: DragEvent) => {
    event.preventDefault();
    setDragActive(false);
  };

  /* ---------------- render ---------------- */

  const duplicateItem = uploads.find((u) => u.status === "confirming") ?? null;

  return (
    <div className="flex h-screen overflow-hidden bg-ivory">
      <div className="hidden lg:block">
        <Sidebar view={view} onViewChange={setView} stats={stats} />
      </div>

      <main
        className="flex min-w-0 flex-1 flex-col"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {/* mobile top bar */}
        <div className="flex items-center justify-between border-b border-linen bg-white px-4 py-3 lg:hidden">
          <p className="text-sm font-bold text-charcoal">S3 Object Studio</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg bg-crimson px-3 py-1.5 text-xs font-semibold text-white transition-base hover:bg-crimson-dark"
            >
              Upload
            </button>
          </div>
        </div>

        {view === "storage" ? (
          <Toolbar
            folder={folder}
            onNavigate={navigateTo}
            search={search}
            onSearchChange={setSearch}
            displayMode={displayMode}
            onDisplayModeChange={setDisplayMode}
            onRefresh={() => refresh()}
            refreshing={refreshing}
            onUpload={() => fileInputRef.current?.click()}
            onCreateFolder={() => setNewFolderOpen(true)}
          />
        ) : (
          <div className="border-b border-linen bg-white px-6 py-4">
            <h1 className="text-lg font-bold tracking-tight text-charcoal">
              {view === "recent" ? "Recent Files" : "Storage Overview"}
            </h1>
            <p className="text-sm text-mutedink">
              {view === "recent"
                ? "Latest objects uploaded to your workspace, newest first."
                : "Live statistics computed from the objects in your S3 workspace."}
            </p>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            {dragActive ? (
              <div className="pointer-events-none fixed inset-4 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-crimson bg-crimson/5">
                <p className="rounded-xl bg-white px-6 py-4 text-base font-semibold text-crimson shadow-lg">
                  Drop files to upload to {folder ? `“${folder}”` : "My Storage"}
                </p>
              </div>
            ) : null}

            {view === "storage" ? (
              workspaceEmpty ? (
                <EmptyState
                  onUpload={() => fileInputRef.current?.click()}
                  onCreateFolder={() => setNewFolderOpen(true)}
                />
              ) : (
                <FileBrowser
                  entries={entries}
                  loading={loading}
                  empty={entries.length === 0}
                  emptySearch={Boolean(debouncedSearch) || typeFilter !== "all"}
                  displayMode={displayMode}
                  sort={sort}
                  onSortChange={setSort}
                  typeFilter={typeFilter}
                  onTypeFilterChange={(filter) => {
                    setTypeFilter(filter);
                    setPage(1);
                  }}
                  page={page}
                  onPageChange={setPage}
                  pageSize={PAGE_SIZE}
                  selectedPaths={selectedPaths}
                  onToggleSelect={toggleSelect}
                  onSelectAll={() => {
                    const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
                    const safe = Math.min(page, totalPages);
                    const next = new Set(selectedPaths);
                    entries.slice((safe - 1) * PAGE_SIZE, safe * PAGE_SIZE).forEach((e) => next.add(e.path));
                    setSelectedPaths(next);
                  }}
                  onClearSelection={() => setSelectedPaths(new Set())}
                  activePath={inspectorEntry?.path ?? null}
                  onSelectFile={selectFile}
                  onOpenFolder={navigateTo}
                  onDownload={(entry) => entry.kind === "file" && downloadEntry(entry)}
                  onRename={(entry) => setRenameTarget(entry)}
                  onCopy={(entry) => setCopyMoveRequest({ entry, mode: "copy" })}
                  onMove={(entry) => setCopyMoveRequest({ entry, mode: "move" })}
                  onDelete={(targets) => setDeleteTargets(targets)}
                />
              )
            ) : view === "recent" ? (
              <RecentFiles
                recent={stats?.recent ?? []}
                loading={loading && !stats}
                onSelectFile={(entry) => {
                  setView("storage");
                  navigateTo(parentPath(entry.path));
                  setInspectorEntry(entry);
                  setInspectorOpen(true);
                }}
                onDownload={downloadEntry}
                onOpenParent={(entry) => navigateTo(parentPath(entry.path))}
              />
            ) : (
              <Overview stats={stats} loading={loading && !stats} />
            )}
          </div>

          {inspectorOpen && inspectorEntry ? (
            <div className="hidden md:block">
              <Inspector
                entry={inspectorEntry}
                onClose={() => {
                  setInspectorOpen(false);
                  setInspectorEntry(null);
                }}
                onDownload={downloadEntry}
                onRename={(entry) => setRenameTarget({ ...entry, kind: "file" })}
                onCopy={(entry) => setCopyMoveRequest({ entry: { ...entry, kind: "file" }, mode: "copy" })}
                onMove={(entry) => setCopyMoveRequest({ entry: { ...entry, kind: "file" }, mode: "move" })}
                onDelete={(entry) => setDeleteTargets([{ ...entry, kind: "file" }])}
              />
            </div>
          ) : null}
        </div>
      </main>

      {/* hidden native file picker */}
      <input
        ref={fileInputRef}
        type="file"
        id="file-upload-input"
        name="files"
        multiple
        aria-hidden="true"
        tabIndex={-1}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <UploadQueue
        uploads={uploads}
        onRetry={retryUpload}
        onDismiss={(id) => setUploads((prev) => prev.filter((u) => u.id !== id))}
        onClearCompleted={() => setUploads((prev) => prev.filter((u) => u.status !== "done"))}
      />

      {/* dialogs */}
      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        onCreate={async (path) => {
          await createFolder(folder ? `${folder}/${path}` : path);
        }}
      />
      <RenameDialog entry={renameTarget} onOpenChange={() => setRenameTarget(null)} onRename={doRename} />
      <CopyMoveDialog
        request={copyMoveRequest}
        onOpenChange={() => setCopyMoveRequest(null)}
        onComplete={doCopyMove}
      />
      <DeleteConfirmDialog
        entries={deleteTargets}
        onOpenChange={() => setDeleteTargets(null)}
        onDelete={doDelete}
      />
      <DuplicateDialog
        name={duplicateItem?.name ?? null}
        onOpenChange={(open) => {
          if (!open) resolveDuplicate(false);
        }}
        onResolve={resolveDuplicate}
      />
    </div>
  );
}
