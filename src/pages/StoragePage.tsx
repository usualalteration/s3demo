import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowDownAZ,
  ArrowUpDown,
  CheckCircle2,
  Download,
  FileSearch,
  FolderPlus,
  LayoutGrid,
  List,
  Loader2,
  Search,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";
import {
  ApiError,
  copyObject,
  createFolder,
  deleteObject,
  downloadToDisk,
  listFolder,
  moveObject,
  renameObject,
  searchObjects,
  type FileEntry,
  type FolderEntry,
} from "@/lib/api";
import { fileCategory, parentFolderOf, type FileCategory } from "@/lib/format";
import { Breadcrumbs } from "@/components/studio/Breadcrumbs";
import { EmptyFolder, EmptyWorkspace } from "@/components/studio/EmptyState";
import { FileTable } from "@/components/studio/FileTable";
import { FileGrid } from "@/components/studio/FileGrid";
import { Inspector } from "@/components/studio/Inspector";
import { UploadTray } from "@/components/studio/UploadTray";
import { useUploads } from "@/components/studio/useUploads";
import {
  CreateFolderDialog,
  DeleteDialog,
  MoveCopyDialog,
  RenameDialog,
} from "@/components/studio/Dialogs";
import { FileTypeTile } from "@/components/studio/FileIcon";
import type { ItemAction, SortBy, SortState, StorageItem } from "@/components/studio/types";

type DialogState =
  | { kind: "none" }
  | { kind: "create-folder" }
  | { kind: "rename"; item: StorageItem }
  | { kind: "move"; item: StorageItem }
  | { kind: "copy"; item: StorageItem }
  | { kind: "delete"; item: StorageItem };

const FILTERS: { id: "all" | FileCategory; label: string }[] = [
  { id: "all", label: "All types" },
  { id: "image", label: "Images" },
  { id: "pdf", label: "PDFs" },
  { id: "document", label: "Documents" },
  { id: "spreadsheet", label: "Spreadsheets" },
  { id: "text", label: "Text" },
  { id: "code", label: "Code & Data" },
  { id: "archive", label: "Archives" },
  { id: "audio", label: "Audio" },
  { id: "video", label: "Video" },
  { id: "other", label: "Other" },
];

const SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "size", label: "Size" },
  { id: "modified", label: "Modified" },
];

function toStorageItem(entry: FolderEntry | FileEntry): StorageItem {
  if (entry.type === "folder") {
    return { type: "folder", name: entry.name, path: entry.path, key: entry.key };
  }
  return {
    type: "file",
    name: entry.name,
    path: entry.path,
    key: entry.key,
    size: entry.size,
    lastModified: entry.lastModified,
    etag: entry.etag,
  };
}

export default function StoragePage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const folderParam = searchParams.get("path") ?? "";
  const currentFolder = folderParam ? `${folderParam.replace(/\/+$/, "")}/` : "";

  const navigateToFolder = useCallback(
    (folder: string) => {
      const normalized = folder.replace(/\/+$/, "");
      setSearchParams(normalized ? { path: normalized } : {});
    },
    [setSearchParams],
  );

  /* ------------------------- view preferences ------------------------- */
  const [view, setView] = useState<"list" | "grid">(() =>
    window.localStorage.getItem("studio-view") === "grid" ? "grid" : "list",
  );
  useEffect(() => {
    window.localStorage.setItem("studio-view", view);
  }, [view]);

  const [sort, setSort] = useState<SortState>({ by: "name", dir: "asc" });
  const [filter, setFilter] = useState<"all" | FileCategory>("all");

  /* ------------------------------ search ------------------------------ */
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searching = searchQuery.trim().length > 0;
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const searchResult = useQuery({
    queryKey: ["search", searchQuery],
    queryFn: () => searchObjects(searchQuery),
    enabled: searching,
    staleTime: 10_000,
    retry: 1,
  });

  /* ------------------------------- data ------------------------------- */
  const listQuery = useInfiniteList(currentFolder);

  const folders = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((page) => page.folders.map(toStorageItem)),
    [listQuery.data],
  );
  const files = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((page) => page.objects.map(toStorageItem)),
    [listQuery.data],
  );

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["storage-list"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
    queryClient.invalidateQueries({ queryKey: ["search"] });
    queryClient.invalidateQueries({ queryKey: ["meta"] });
  }, [queryClient]);

  /* ---------------------------- selection ----------------------------- */
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [inspected, setInspected] = useState<StorageItem | null>(null);
  const anchorRef = useRef<number>(-1);

  useEffect(() => {
    setSelectedKeys(new Set());
    // Keep the inspector open when navigating to the parent of the inspected
    // item (e.g. locating a search result); otherwise close it.
    setInspected((current) =>
      current && parentFolderOf(current.path) === currentFolder ? current : null,
    );
  }, [currentFolder, searching]);

  const visibleItems = useMemo(() => {
    if (searching) return [];
    const filteredFiles = filter === "all" ? files : files.filter((file) => fileCategory(file.name) === filter);
    const direction = sort.dir === "asc" ? 1 : -1;
    const sortedFolders = [...folders].sort((a, b) => direction * a.name.localeCompare(b.name, "en", { numeric: true }));
    const sortedFiles = [...filteredFiles].sort((a, b) => {
      if (sort.by === "name") return direction * a.name.localeCompare(b.name, "en", { numeric: true });
      if (sort.by === "size") return direction * ((a.size ?? 0) - (b.size ?? 0));
      const at = a.lastModified ? new Date(a.lastModified).getTime() : 0;
      const bt = b.lastModified ? new Date(b.lastModified).getTime() : 0;
      return direction * (at - bt);
    });
    return [...sortedFolders, ...sortedFiles];
  }, [searching, folders, files, filter, sort]);

  const searchItems = useMemo(() => {
    if (!searching || !searchResult.data) return [];
    return [
      ...searchResult.data.folders.map(toStorageItem),
      ...searchResult.data.objects.map(toStorageItem),
    ];
  }, [searching, searchResult.data]);

  const items = searching ? searchItems : visibleItems;

  const toggleItem = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedKeys((prev) =>
      prev.size >= items.length && items.length > 0 ? new Set() : new Set(items.map((item) => item.key)),
    );
  }, [items]);

  const rowClick = useCallback(
    (item: StorageItem, event: React.MouseEvent) => {
      const index = items.findIndex((entry) => entry.key === item.key);
      if (event.metaKey || event.ctrlKey) {
        toggleItem(item.key);
        anchorRef.current = index;
        return;
      }
      if (event.shiftKey && anchorRef.current >= 0 && anchorRef.current !== index) {
        const [from, to] = anchorRef.current < index ? [anchorRef.current, index] : [index, anchorRef.current];
        const rangeKeys = items.slice(from, to + 1).map((entry) => entry.key);
        setSelectedKeys((prev) => new Set([...prev, ...rangeKeys]));
        setInspected(item);
        return;
      }
      setSelectedKeys(new Set([item.key]));
      setInspected(item);
      anchorRef.current = index;
    },
    [items, toggleItem],
  );

  const rowDoubleClick = useCallback(
    (item: StorageItem) => {
      if (item.type === "folder") {
        navigateToFolder(item.path);
      } else if (searching) {
        // Locating a search result: jump to its parent folder.
        navigateToFolder(parentFolderOf(item.path));
        setSelectedKeys(new Set([item.key]));
        setInspected(item);
      } else {
        setSelectedKeys(new Set([item.key]));
        setInspected(item);
      }
    },
    [navigateToFolder, searching],
  );

  /* ------------------------------ uploads ----------------------------- */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploads = useUploads({ folder: currentFolder, onChanged: invalidateAll });

  const handleUploadClick = () => fileInputRef.current?.click();

  /* ---------------------------- drag & drop --------------------------- */
  const [dragging, setDragging] = useState(false);

  /* ------------------------------ dialogs ----------------------------- */
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [batchDelete, setBatchDelete] = useState<{ keys: string[] } | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

  const openCreateFolder = () => setDialog({ kind: "create-folder" });

  /* ---------------------------- mutations ----------------------------- */
  const copyKeyToClipboard = useCallback(async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success("S3 key copied to clipboard");
    } catch {
      toast.error("Could not copy the key — clipboard unavailable");
    }
  }, []);

  const clearInspectedIfMatches = useCallback((path: string) => {
    setInspected((current) => (current && current.path === path ? null : current));
  }, []);

  const handleCreateFolder = useCallback(
    async (name: string): Promise<string | null> => {
      try {
        await createFolder(`${currentFolder}${name}`);
        invalidateAll();
        toast.success(`Folder “${name}” created`);
        return null;
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Could not create the folder";
        toast.error(message);
        return message;
      }
    },
    [currentFolder, invalidateAll],
  );

  const handleRename = useCallback(
    async (item: StorageItem, newName: string): Promise<string | null> => {
      try {
        await renameObject({ path: item.path, newName });
        invalidateAll();
        clearInspectedIfMatches(item.path);
        toast.success(`Renamed to “${newName}”`);
        return null;
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Rename failed";
        toast.error(message);
        return message;
      }
    },
    [invalidateAll, clearInspectedIfMatches],
  );

  const handleMove = useCallback(
    async (item: StorageItem, destFolder: string): Promise<string | null> => {
      try {
        await moveObject({
          source: item.path,
          destFolder: destFolder ? `${destFolder}/` : "",
        });
        invalidateAll();
        clearInspectedIfMatches(item.path);
        toast.success(`Moved “${item.name}”`);
        return null;
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Move failed";
        toast.error(message);
        return message;
      }
    },
    [invalidateAll, clearInspectedIfMatches],
  );

  const handleCopy = useCallback(
    async (item: StorageItem, destFolder: string, destName?: string): Promise<string | null> => {
      try {
        await copyObject({
          source: item.path,
          destFolder: destFolder ? `${destFolder}/` : "",
          destName,
        });
        invalidateAll();
        toast.success(`Copied “${item.name}”`);
        return null;
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Copy failed";
        toast.error(message);
        return message;
      }
    },
    [invalidateAll],
  );

  const handleDelete = useCallback(
    async (item: StorageItem, recursive: boolean) => {
      try {
        await deleteObject(item.path, recursive);
        invalidateAll();
        clearInspectedIfMatches(item.path);
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          next.delete(item.key);
          return next;
        });
        toast.success(`Deleted “${item.name}”`);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Delete failed";
        toast.error(message);
      }
    },
    [invalidateAll, clearInspectedIfMatches],
  );

  const handleDownload = useCallback(async (item: StorageItem) => {
    if (item.type !== "file") return;
    try {
      await downloadToDisk(item.path, item.name);
      toast.success(`Downloading “${item.name}”`);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Download failed";
      toast.error(message);
    }
  }, []);

  const handleAction = useCallback(
    (action: ItemAction, item: StorageItem) => {
      switch (action) {
        case "open":
          navigateToFolder(item.path);
          break;
        case "preview":
          if (item.type === "folder") navigateToFolder(item.path);
          else rowDoubleClick(item);
          break;
        case "download":
          void handleDownload(item);
          break;
        case "rename":
          setDialog({ kind: "rename", item });
          break;
        case "move":
          setDialog({ kind: "move", item });
          break;
        case "copy":
          setDialog({ kind: "copy", item });
          break;
        case "copy-key":
          void copyKeyToClipboard(item.key);
          break;
        case "delete":
          setDialog({ kind: "delete", item });
          break;
      }
    },
    [navigateToFolder, rowDoubleClick, handleDownload, copyKeyToClipboard],
  );

  /* --------------------------- batch actions -------------------------- */
  const selectedItems = useMemo(() => items.filter((item) => selectedKeys.has(item.key)), [items, selectedKeys]);

  const handleBatchDownload = useCallback(async () => {
    const filesToDownload = selectedItems.filter((item) => item.type === "file");
    toast.info(`Downloading ${filesToDownload.length} file${filesToDownload.length === 1 ? "" : "s"}…`);
    for (const item of filesToDownload) {
      try {
        await downloadToDisk(item.path, item.name);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Download failed";
        toast.error(`“${item.name}”: ${message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }, [selectedItems]);

  const confirmBatchDelete = useCallback(async () => {
    if (!batchDelete) return;
    setBatchBusy(true);
    let deleted = 0;
    let failed = 0;
    for (const key of batchDelete.keys) {
      const item = items.find((entry) => entry.key === key);
      if (!item) continue;
      try {
        await deleteObject(item.path, item.type === "folder");
        deleted += 1;
      } catch {
        failed += 1;
      }
    }
    setBatchBusy(false);
    setBatchDelete(null);
    setSelectedKeys(new Set());
    setInspected(null);
    invalidateAll();
    if (failed > 0) toast.error(`Deleted ${deleted} item${deleted === 1 ? "" : "s"}, ${failed} failed`);
    else toast.success(`Deleted ${deleted} item${deleted === 1 ? "" : "s"}`);
  }, [batchDelete, items, invalidateAll]);

  /* ---------------------------- keyboard ------------------------------ */
  const handleWorkspaceKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setSelectedKeys(new Set());
      setInspected(null);
      return;
    }
    const target = event.target as HTMLElement;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selectedKeys.size > 0) {
      event.preventDefault();
      if (selectedKeys.size === 1 && inspected) {
        setDialog({ kind: "delete", item: inspected });
      } else {
        setBatchDelete({ keys: [...selectedKeys] });
      }
    }
  };

  /* ------------------------------ render ------------------------------ */
  const isLoading = searching
    ? searchResult.isPending && searchResult.isFetching
    : listQuery.isPending;

  const emptyWorkspace = !searching && !isLoading && currentFolder === "" && items.length === 0;
  const emptyFolder = !searching && !isLoading && currentFolder !== "" && items.length === 0;
  const emptySearch = searching && !isLoading && items.length === 0;

  return (
    <div
      className="flex h-full flex-col"
      onKeyDown={handleWorkspaceKeyDown}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(event) => {
          if (event.target.files?.length) {
            void uploads.enqueue(event.target.files);
          }
          event.target.value = "";
        }}
      />

      {/* Top toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 lg:px-6">
        <Breadcrumbs folder={currentFolder} onNavigate={navigateToFolder} className="min-w-0 flex-1" />
        <div className="relative order-first w-full sm:order-none sm:w-64 lg:w-72">
          <Search
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors duration-200",
              searching ? "text-studio-crimson" : "text-muted-foreground",
            )}
          />
          <Input
            id="workspace-search-input"
            name="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && searchInput) {
                event.preventDefault();
                setSearchInput("");
              }
            }}
            placeholder="Search storage…"
            aria-label="Search storage"
            autoComplete="off"
            className={cn(
              "h-9 bg-white pl-10 pr-9 !text-[13px]",
              searching && "border-studio-crimson/60 ring-1 ring-studio-crimson/20",
            )}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-stone-100 hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          onClick={openCreateFolder}
          className="h-9 gap-2 bg-white px-3 text-[13px]"
        >
          <FolderPlus className="h-4 w-4 text-studio-crimson" />
          <span className="hidden sm:inline">Create Folder</span>
          <span className="sm:hidden">Folder</span>
        </Button>
        <Button
          onClick={handleUploadClick}
          className="h-9 gap-2 bg-studio-crimson px-4 text-[13px] hover:bg-studio-crimson-dark"
        >
          <UploadCloud className="h-4 w-4" />
          <span className="hidden sm:inline">Upload Files</span>
          <span className="sm:hidden">Upload</span>
        </Button>
      </div>

      {/* Workspace */}
      <div className="relative flex min-h-0 flex-1 gap-0 px-4 pb-4 lg:px-6 lg:pb-6">
        <div
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white transition-shadow",
            dragging && "shadow-[0_0_0_2px_hsl(0_66%_47%)]",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (event.dataTransfer.files?.length) {
              void uploads.enqueue(event.dataTransfer.files);
            }
          }}
        >
          {/* Card header */}
          <div className="flex flex-wrap items-center gap-2 border-b border-studio-sand/80 px-4 py-2.5">
            {selectedKeys.size > 1 ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-studio-crimson">
                  {selectedKeys.size} selected
                </span>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 bg-white px-2 text-xs" onClick={() => void handleBatchDownload()}>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 bg-white px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setBatchDelete({ keys: [...selectedKeys] })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setSelectedKeys(new Set())}>
                  Clear
                </Button>
              </div>
            ) : (
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {searching ? (
                  <>
                    Results for “{searchQuery}”{" "}
                    <span className="font-normal text-muted-foreground">
                      · {searchItems.length} item{searchItems.length === 1 ? "" : "s"}
                      {searchResult.data?.truncated ? " (truncated)" : ""}
                    </span>
                  </>
                ) : (
                  <>
                    {currentFolder === "" ? "My Storage" : currentFolder.replace(/\/+$/, "").split("/").pop()}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {folders.length} folder{folders.length === 1 ? "" : "s"}, {files.length} file
                      {files.length === 1 ? "" : "s"}
                      {filter !== "all" && " (filtered)"}
                    </span>
                  </>
                )}
              </p>
            )}

            <div className="flex shrink-0 items-center gap-1.5">
              {/* Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("h-7 gap-1.5 bg-white px-2 text-xs", filter !== "all" && "border-studio-crimson/50 text-studio-crimson")}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">{FILTERS.find((f) => f.id === filter)?.label}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Filter by type</DropdownMenuLabel>
                  {FILTERS.map((option) => (
                    <DropdownMenuItem
                      key={option.id}
                      className="justify-between"
                      onSelect={() => {
                        setFilter(option.id);
                        setSelectedKeys(new Set());
                      }}
                    >
                      {option.label}
                      {filter === option.id && <CheckCircle2 className="h-3.5 w-3.5 text-studio-crimson" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Sort */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 bg-white px-2 text-xs">
                    {sort.by === "name" ? <ArrowDownAZ className="h-3.5 w-3.5" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
                    <span className="hidden md:inline capitalize">
                      {sort.by} · {sort.dir}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  {SORT_OPTIONS.map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.id}
                      checked={sort.by === option.id}
                      onSelect={() => setSort((prev) => ({ by: option.id, dir: prev.dir }))}
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setSort((prev) => ({ ...prev, dir: "asc" }))}>
                    Ascending {sort.dir === "asc" && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-studio-crimson" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSort((prev) => ({ ...prev, dir: "desc" }))}>
                    Descending {sort.dir === "desc" && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-studio-crimson" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* View toggle */}
              <div className="flex items-center rounded-md border border-input bg-white p-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("h-6 w-7 p-0", view === "list" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground")}
                  onClick={() => setView("list")}
                  aria-label="List view"
                  aria-pressed={view === "list"}
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("h-6 w-7 p-0", view === "grid" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground")}
                  onClick={() => setView("grid")}
                  aria-label="Grid view"
                  aria-pressed={view === "grid"}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {isLoading ? (
              view === "list" ? (
                <div className="space-y-2.5 p-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <Skeleton className="h-6 w-6 rounded" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="hidden h-4 w-16 md:block" />
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="hidden h-4 w-24 lg:block" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className="flex flex-col items-center gap-3 rounded-xl border border-studio-sand p-4">
                      <Skeleton className="h-16 w-16 rounded-lg" />
                      <Skeleton className="h-3.5 w-3/4" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  ))}
                </div>
              )
            ) : emptyWorkspace ? (
              <EmptyWorkspace onCreateFolder={openCreateFolder} onUpload={handleUploadClick} />
            ) : emptyFolder ? (
              <EmptyFolder onCreateFolder={openCreateFolder} onUpload={handleUploadClick} />
            ) : emptySearch ? (
              <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-100">
                  <FileSearch className="h-6 w-6 text-stone-400" />
                </div>
                <h3 className="mt-4 text-base font-semibold">No objects match “{searchQuery}”</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Try a different search term — only this application’s namespace is searched.
                </p>
              </div>
            ) : (
              <>
                {view === "list" ? (
                  <FileTable
                    items={items}
                    selectedKeys={selectedKeys}
                    allSelected={items.length > 0 && selectedKeys.size >= items.length}
                    sort={sort}
                    onToggleItem={toggleItem}
                    onToggleAll={toggleAll}
                    onRowClick={rowClick}
                    onRowDoubleClick={rowDoubleClick}
                    onSortChange={(by) =>
                      setSort((prev) =>
                        prev.by === by
                          ? { by, dir: prev.dir === "asc" ? "desc" : "asc" }
                          : { by, dir: "asc" },
                      )
                    }
                    onAction={handleAction}
                  />
                ) : (
                  <FileGrid
                    items={items}
                    selectedKeys={selectedKeys}
                    onRowClick={rowClick}
                    onRowDoubleClick={rowDoubleClick}
                    onAction={handleAction}
                  />
                )}

                {searching && searchResult.data?.truncated && (
                  <p className="px-4 py-2 text-center text-xs text-muted-foreground">
                    Showing the first {items.length} matches — refine the search to narrow results.
                  </p>
                )}

                {!searching && listQuery.hasNextPage && (
                  <div className="flex items-center justify-center gap-2 px-4 py-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white"
                      onClick={() => void listQuery.fetchNextPage()}
                      disabled={listQuery.isFetchingNextPage}
                    >
                      {listQuery.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Load more
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Drop zone overlay */}
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-studio-crimson bg-white/85">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-studio-crimson/10">
                  <UploadCloud className="h-6 w-6 text-studio-crimson" />
                </div>
                <p className="text-sm font-semibold text-studio-crimson">Drop files to upload</p>
                <p className="font-mono-tech text-[11px] text-muted-foreground">
                  → {currentFolder || "s3-studio/"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Inspector */}
        {inspected && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-30 bg-black/20 lg:hidden"
              onClick={() => setInspected(null)}
              aria-label="Close inspector"
            />
            <Inspector item={inspected} onClose={() => setInspected(null)} onAction={handleAction} />
          </>
        )}
      </div>

      {/* Uploads */}
      <UploadTray
        tasks={uploads.tasks}
        folder={currentFolder}
        onCancel={uploads.cancel}
        onOverwrite={uploads.overwrite}
        onRemove={uploads.remove}
        onClearFinished={uploads.clearFinished}
      />

      {/* Dialogs */}
      <CreateFolderDialog
        open={dialog.kind === "create-folder"}
        onClose={() => setDialog({ kind: "none" })}
        parentFolder={currentFolder}
        onSubmit={handleCreateFolder}
      />
      <RenameDialog
        item={dialog.kind === "rename" ? dialog.item : null}
        onClose={() => setDialog({ kind: "none" })}
        onSubmit={handleRename}
      />
      <MoveCopyDialog
        mode="move"
        item={dialog.kind === "move" ? dialog.item : null}
        currentFolder={currentFolder}
        onClose={() => setDialog({ kind: "none" })}
        onSubmit={(item, destFolder) => handleMove(item, destFolder)}
      />
      <MoveCopyDialog
        mode="copy"
        item={dialog.kind === "copy" ? dialog.item : null}
        currentFolder={currentFolder}
        onClose={() => setDialog({ kind: "none" })}
        onSubmit={handleCopy}
      />
      <DeleteDialog
        item={dialog.kind === "delete" ? dialog.item : null}
        onClose={() => setDialog({ kind: "none" })}
        onConfirm={handleDelete}
      />

      {/* Batch delete confirmation */}
      <AlertDialog open={batchDelete !== null} onOpenChange={(value) => !value && setBatchDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {batchDelete?.keys.length ?? 0} items?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This permanently deletes the selected files and folders (including every object inside
                  selected folders) from S3 storage. This action cannot be undone.
                </p>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-studio-sand bg-stone-50 p-2.5 scrollbar-thin">
                  {batchDelete?.keys.map((key) => {
                    const item = items.find((entry) => entry.key === key);
                    if (!item) return null;
                    return (
                      <p key={key} className="truncate font-mono-tech text-[11px] text-muted-foreground" title={item.key}>
                        {item.key}
                      </p>
                    );
                  })}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="bg-studio-crimson hover:bg-studio-crimson-dark"
              disabled={batchBusy}
              onClick={(event) => {
                event.preventDefault();
                void confirmBatchDelete();
              }}
            >
              {batchBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Infinite list helper                                                 */
/* ------------------------------------------------------------------ */

function useInfiniteList(folder: string) {
  return useInfiniteQuery({
    queryKey: ["storage-list", folder],
    queryFn: ({ pageParam }) => listFolder(folder, (pageParam as string) || null),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.token ?? undefined,
    staleTime: 5_000,
    retry: 1,
  });
}