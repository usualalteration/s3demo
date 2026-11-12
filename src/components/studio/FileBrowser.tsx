import { useEffect, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Download,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { FileIcon, FolderIcon } from "./FileIcon";
import { CATEGORY_LABELS, FILTER_CATEGORIES, categoryOf, formatBytes, formatDate } from "@/lib/files";
import type { FileEntry, FolderEntry } from "@/lib/types";

export type SortBy = "name" | "size" | "modified";
export interface SortState {
  by: SortBy;
  dir: "asc" | "desc";
}

export type EntryKind = "file" | "folder";
export type AnyEntry = (FileEntry & { kind: "file" }) | (FolderEntry & { kind: "folder" });

interface MenuCallbacks {
  onDownload: (entry: AnyEntry) => void;
  onRename: (entry: AnyEntry) => void;
  onCopy: (entry: AnyEntry) => void;
  onMove: (entry: AnyEntry) => void;
  onDelete: (entries: AnyEntry[]) => void;
}

function ItemMenu({ entry, callbacks }: { entry: AnyEntry; callbacks: MenuCallbacks }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = [
    ...(entry.kind === "file"
      ? [
          {
            label: "Download",
            icon: Download,
            action: () => callbacks.onDownload(entry),
          },
        ]
      : []),
    { label: "Rename", icon: Pencil, action: () => callbacks.onRename(entry) },
    { label: "Copy", icon: Copy, action: () => callbacks.onCopy(entry) },
    { label: "Move", icon: FolderInput, action: () => callbacks.onMove(entry) },
    { label: "Delete", icon: Trash2, action: () => callbacks.onDelete([entry]), danger: true },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`Actions for ${entry.name}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-mutedink transition-base hover:bg-ivory hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-crimson/30"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl border border-linen bg-white py-1 shadow-lg"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.action();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-base ${
                  item.danger
                    ? "text-crimson hover:bg-crimson/5"
                    : "text-charcoal hover:bg-ivory"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export interface FileBrowserProps extends MenuCallbacks {
  entries: AnyEntry[];
  loading: boolean;
  empty: boolean;
  emptySearch: boolean;
  displayMode: "list" | "grid";
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  typeFilter: string;
  onTypeFilterChange: (filter: string) => void;
  page: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  selectedPaths: Set<string>;
  onToggleSelect: (path: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  activePath: string | null;
  onSelectFile: (entry: FileEntry) => void;
  onOpenFolder: (path: string) => void;
}

export default function FileBrowser(props: FileBrowserProps) {
  const {
    entries,
    loading,
    empty,
    emptySearch,
    displayMode,
    sort,
    onSortChange,
    typeFilter,
    onTypeFilterChange,
    page,
    onPageChange,
    pageSize,
    selectedPaths,
    onToggleSelect,
    onSelectAll,
    onClearSelection,
    activePath,
    onSelectFile,
    onOpenFolder,
    onDownload,
    onDelete,
  } = props;

  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageEntries = entries.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageStart = entries.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = Math.min(safePage * pageSize, entries.length);
  const allOnPageSelected =
    pageEntries.length > 0 && pageEntries.every((entry) => selectedPaths.has(entry.path));

  const toggleSort = (by: SortBy) => {
    onSortChange(
      sort.by === by
        ? { by, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { by, dir: by === "name" ? "asc" : "desc" },
    );
  };

  const sortButton = (by: SortBy, label: string, extraClass = "") => (
    <button
      type="button"
      onClick={() => toggleSort(by)}
      className={`flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wider transition-base hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-crimson/30 ${extraClass} ${
        sort.by === by ? "text-charcoal" : "text-mutedink"
      }`}
      aria-label={`Sort by ${label}`}
    >
      {label}
      {sort.by === by ? (
        sort.dir === "asc" ? (
          <ArrowUpAZ className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ArrowDownAZ className="h-3.5 w-3.5" aria-hidden="true" />
        )
      ) : null}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Filter chips */}
      {!empty ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-linen px-6 py-3">
          <button
            type="button"
            onClick={() => onTypeFilterChange("all")}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-base focus:outline-none focus:ring-2 focus:ring-crimson/30 ${
              typeFilter === "all"
                ? "border-charcoal bg-charcoal text-white"
                : "border-linen bg-white text-mutedink hover:border-charcoal/30 hover:text-charcoal"
            }`}
          >
            All
          </button>
          {FILTER_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => onTypeFilterChange(typeFilter === category ? "all" : category)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-base focus:outline-none focus:ring-2 focus:ring-crimson/30 ${
                typeFilter === category
                  ? "border-charcoal bg-charcoal text-white"
                  : "border-linen bg-white text-mutedink hover:border-charcoal/30 hover:text-charcoal"
              }`}
            >
              {CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>
      ) : null}

      {/* Selection toolbar */}
      {selectedPaths.size > 0 ? (
        <div className="flex items-center justify-between gap-3 border-b border-linen bg-white px-6 py-2.5">
          <p className="text-sm font-medium text-charcoal">
            {selectedPaths.size} item{selectedPaths.size === 1 ? "" : "s"} selected
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onDelete(
                  entries.filter((entry) => selectedPaths.has(entry.path)),
                )
              }
              className="flex h-8 items-center gap-1.5 rounded-lg border border-crimson/30 bg-crimson/5 px-3 text-sm font-medium text-crimson transition-base hover:bg-crimson/10 focus:outline-none focus:ring-2 focus:ring-crimson/30"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete selected
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              className="h-8 rounded-lg px-3 text-sm font-medium text-mutedink transition-base hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-crimson/20"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {/* Content */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-24">
          <div className="flex items-center gap-3 text-sm text-mutedink">
            <span
              className="h-5 w-5 animate-spin rounded-full border-2 border-linen border-t-crimson"
              aria-hidden="true"
            />
            Loading your objects…
          </div>
        </div>
      ) : empty ? (
        <div className="flex flex-1 items-center justify-center py-24 text-center">
          <div>
            <p className="text-lg font-semibold text-charcoal">
              {emptySearch ? "No results found" : "This folder is empty"}
            </p>
            <p className="mt-1 text-sm text-mutedink">
              {emptySearch
                ? "Try a different search term or clear the filters."
                : "Upload files or create a folder to get started."}
            </p>
          </div>
        </div>
      ) : displayMode === "list" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linen text-mutedink">
                <th scope="col" className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    id="browser-select-all"
                    name="selectAll"
                    aria-label="Select all items on this page"
                    checked={allOnPageSelected}
                    onChange={allOnPageSelected ? onClearSelection : onSelectAll}
                    className="h-4 w-4 cursor-pointer rounded border-linen accent-crimson focus:ring-2 focus:ring-crimson/30"
                  />
                </th>
                <th scope="col" className="px-2 py-3">
                  {sortButton("name", "Name")}
                </th>
                <th scope="col" className="hidden px-2 py-3 md:table-cell">
                  <span className="text-xs font-semibold uppercase tracking-wider text-mutedink">Type</span>
                </th>
                <th scope="col" className="px-2 py-3">
                  {sortButton("size", "Size")}
                </th>
                <th scope="col" className="hidden px-2 py-3 lg:table-cell">
                  {sortButton("modified", "Modified")}
                </th>
                <th scope="col" className="w-12 px-2 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageEntries.map((entry) => {
                const selected = selectedPaths.has(entry.path);
                const active = activePath === entry.path;
                return (
                  <tr
                    key={entry.path}
                    onClick={() => {
                      if (entry.kind === "folder") onOpenFolder(entry.path);
                      else onSelectFile(entry);
                    }}
                    className={`group cursor-pointer border-b border-linen/70 transition-base last:border-0 ${
                      active ? "bg-crimson/5" : selected ? "bg-ivory" : "hover:bg-ivory"
                    }`}
                  >
                    <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        aria-label={selected ? `Deselect ${entry.name}` : `Select ${entry.name}`}
                        onClick={() => onToggleSelect(entry.path)}
                        className={`flex h-6 w-6 items-center justify-center rounded-full transition-base focus:outline-none focus:ring-2 focus:ring-crimson/40 ${
                          selected ? "text-crimson" : "text-mutedink/40 hover:text-charcoal"
                        }`}
                      >
                        {selected ? (
                          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          <Circle className="h-5 w-5" aria-hidden="true" />
                        )}
                      </button>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {entry.kind === "folder" ? (
                          <FolderIcon box />
                        ) : (
                          <FileIcon name={entry.name} box />
                        )}
                        <span className="min-w-0">
                          <span
                            className={`block truncate font-medium ${
                              active ? "text-crimson" : "text-charcoal"
                            }`}
                          >
                            {entry.name}
                          </span>
                          {entry.kind === "folder" ? (
                            <span className="block text-xs text-mutedink">
                              {entry.fileCount} item{entry.fileCount === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-2 py-3 md:table-cell">
                      <span className="text-mutedink">
                        {entry.kind === "folder" ? "Folder" : CATEGORY_LABELS[categoryOf(entry.name)]}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <span className="text-mutedink">
                        {entry.kind === "folder" ? formatBytes(entry.size) : formatBytes(entry.size)}
                      </span>
                    </td>
                    <td className="hidden px-2 py-3 lg:table-cell">
                      <span className="text-mutedink">{formatDate(entry.lastModified)}</span>
                    </td>
                    <td className="px-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <ItemMenu entry={entry} callbacks={props} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {pageEntries.map((entry) => {
            const selected = selectedPaths.has(entry.path);
            const active = activePath === entry.path;
            return (
              <div
                key={entry.path}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (entry.kind === "folder") onOpenFolder(entry.path);
                  else onSelectFile(entry);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (entry.kind === "folder") onOpenFolder(entry.path);
                    else onSelectFile(entry);
                  }
                }}
                className={`group relative flex cursor-pointer flex-col items-center gap-3 rounded-xl border p-4 text-center transition-base focus:outline-none focus:ring-2 focus:ring-crimson/40 ${
                  active
                    ? "border-crimson bg-crimson/5 shadow-sm"
                    : selected
                      ? "border-charcoal/40 bg-white"
                      : "border-linen bg-white hover:border-charcoal/25 hover:shadow-sm"
                }`}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={selected ? `Deselect ${entry.name}` : `Select ${entry.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(entry.path);
                  }}
                  className={`absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 transition-base focus:outline-none focus:ring-2 focus:ring-crimson/40 ${
                    selected ? "text-crimson" : "text-mutedink/50 hover:text-charcoal"
                  }`}
                >
                  {selected ? (
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Circle className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
                {entry.kind === "folder" ? (
                  <FolderIcon className="h-12 w-12 text-crimson" />
                ) : (
                  <FileIcon name={entry.name} className="h-12 w-12 text-charcoal/70" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-charcoal" title={entry.name}>
                    {entry.name}
                  </p>
                  <p className="mt-0.5 text-xs text-mutedink">{formatBytes(entry.size)}</p>
                </div>
                <div className="absolute right-1.5 top-1.5" onClick={(e) => e.stopPropagation()}>
                  <ItemMenu entry={entry} callbacks={props} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!empty && entries.length > pageSize ? (
        <div className="mt-auto flex items-center justify-between border-t border-linen bg-white px-6 py-3">
          <p className="text-xs text-mutedink">
            Showing {pageStart}–{pageEnd} of {entries.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous page"
              disabled={safePage <= 1}
              onClick={() => onPageChange(safePage - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-linen bg-white text-mutedink transition-base hover:text-charcoal disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-crimson/30"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="text-xs font-medium text-charcoal">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={safePage >= totalPages}
              onClick={() => onPageChange(safePage + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-linen bg-white text-mutedink transition-base hover:text-charcoal disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-crimson/30"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
