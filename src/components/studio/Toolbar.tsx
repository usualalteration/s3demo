import { ChevronRight, CloudUpload, FolderPlus, LayoutGrid, List, RefreshCw, Search } from "lucide-react";

interface ToolbarProps {
  folder: string;
  onNavigate: (folder: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  displayMode: "list" | "grid";
  onDisplayModeChange: (mode: "list" | "grid") => void;
  onRefresh: () => void;
  refreshing: boolean;
  onUpload: () => void;
  onCreateFolder: () => void;
}

export default function Toolbar({
  folder,
  onNavigate,
  search,
  onSearchChange,
  displayMode,
  onDisplayModeChange,
  onRefresh,
  refreshing,
  onUpload,
  onCreateFolder,
}: ToolbarProps) {
  const segments = folder.split("/").filter(Boolean);

  return (
    <div className="flex flex-col gap-3 border-b border-linen bg-ivory px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1 text-sm">
          <li>
            <button
              type="button"
              onClick={() => onNavigate("")}
              className={`rounded px-1.5 py-0.5 font-semibold transition-base ${
                segments.length === 0
                  ? "text-charcoal"
                  : "text-mutedink hover:bg-white hover:text-charcoal"
              } focus:outline-none focus:ring-2 focus:ring-crimson/30`}
              aria-current={segments.length === 0 ? "page" : undefined}
            >
              My Storage
            </button>
          </li>
          {segments.map((segment, index) => {
            const target = segments.slice(0, index + 1).join("/");
            const isLast = index === segments.length - 1;
            return (
              <li key={target} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-mutedink/60" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => onNavigate(target)}
                  className={`max-w-[12rem] truncate rounded px-1.5 py-0.5 transition-base ${
                    isLast
                      ? "font-semibold text-charcoal"
                      : "text-mutedink hover:bg-white hover:text-charcoal"
                  } focus:outline-none focus:ring-2 focus:ring-crimson/30`}
                  aria-current={isLast ? "page" : undefined}
                >
                  {segment}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mutedink"
            aria-hidden="true"
          />
          <label htmlFor="storage-search" className="sr-only">
            Search files
          </label>
          <input
            id="storage-search"
            name="search"
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files…"
            className="h-9 w-44 rounded-lg border border-linen bg-white pl-9 pr-3 text-sm text-charcoal transition-base placeholder:text-mutedink/60 focus:border-crimson focus:outline-none focus:ring-2 focus:ring-crimson/20 sm:w-56"
          />
        </div>

        <div className="flex overflow-hidden rounded-lg border border-linen bg-white" role="group" aria-label="Display mode">
          <button
            type="button"
            title="List view"
            aria-label="List view"
            aria-pressed={displayMode === "list"}
            onClick={() => onDisplayModeChange("list")}
            className={`flex h-9 w-9 items-center justify-center transition-base focus:outline-none focus:ring-2 focus:ring-crimson/30 ${
              displayMode === "list" ? "bg-charcoal text-white" : "text-mutedink hover:text-charcoal"
            }`}
          >
            <List className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Grid view"
            aria-label="Grid view"
            aria-pressed={displayMode === "grid"}
            onClick={() => onDisplayModeChange("grid")}
            className={`flex h-9 w-9 items-center justify-center transition-base focus:outline-none focus:ring-2 focus:ring-crimson/30 ${
              displayMode === "grid" ? "bg-charcoal text-white" : "text-mutedink hover:text-charcoal"
            }`}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh"
          aria-label="Refresh current folder"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-linen bg-white text-mutedink transition-base hover:text-charcoal disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-crimson/30"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onCreateFolder}
          className="flex h-9 items-center gap-2 rounded-lg border border-linen bg-white px-3.5 text-sm font-medium text-charcoal transition-base hover:border-charcoal/30 focus:outline-none focus:ring-2 focus:ring-crimson/20"
        >
          <FolderPlus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Create Folder</span>
        </button>

        <button
          type="button"
          onClick={onUpload}
          className="flex h-9 items-center gap-2 rounded-lg bg-crimson px-4 text-sm font-semibold text-white shadow-sm transition-base hover:bg-crimson-dark focus:outline-none focus:ring-2 focus:ring-crimson/40"
        >
          <CloudUpload className="h-4 w-4" aria-hidden="true" />
          Upload Files
        </button>
      </div>
    </div>
  );
}
