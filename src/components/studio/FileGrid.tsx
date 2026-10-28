import { MoreVertical } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import { FileTypeTile } from "./FileIcon";
import type { ItemAction, StorageItem } from "./types";

export interface FileGridProps {
  items: StorageItem[];
  selectedKeys: Set<string>;
  onRowClick: (item: StorageItem, event: React.MouseEvent) => void;
  onRowDoubleClick: (item: StorageItem) => void;
  onAction: (action: ItemAction, item: StorageItem) => void;
}

function MenuItems({ item, onAction }: { item: StorageItem; onAction: (a: ItemAction, i: StorageItem) => void }) {
  return (
    <>
      <ContextMenuItem onSelect={() => onAction(item.type === "folder" ? "open" : "preview", item)}>
        {item.type === "folder" ? "Open folder" : "Preview"}
      </ContextMenuItem>
      {item.type === "file" && <ContextMenuItem onSelect={() => onAction("download", item)}>Download</ContextMenuItem>}
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => onAction("rename", item)}>Rename…</ContextMenuItem>
      <ContextMenuItem onSelect={() => onAction("move", item)}>Move…</ContextMenuItem>
      <ContextMenuItem onSelect={() => onAction("copy", item)}>Copy…</ContextMenuItem>
      <ContextMenuItem onSelect={() => onAction("copy-key", item)}>Copy S3 key</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        onSelect={() => onAction("delete", item)}
      >
        Delete…
      </ContextMenuItem>
    </>
  );
}

export function FileGrid({ items, selectedKeys, onRowClick, onRowDoubleClick, onAction }: FileGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {items.map((item) => {
        const selected = selectedKeys.has(item.key);
        return (
          <ContextMenu key={item.key}>
            <ContextMenuTrigger asChild>
              <div
                role="button"
                tabIndex={0}
                onClick={(event) => onRowClick(item, event)}
                onDoubleClick={() => onRowDoubleClick(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onRowDoubleClick(item);
                }}
                className={cn(
                  "group relative flex cursor-default flex-col items-center gap-2.5 rounded-xl border p-4 text-center outline-none transition-all duration-200",
                  selected
                    ? "border-studio-crimson/60 bg-studio-crimson/5 shadow-[0_0_0_1px_hsl(0_66%_47%/0.25)]"
                    : "border-studio-sand bg-white hover:border-studio-slate/40 hover:shadow-sm",
                )}
              >
                {item.type === "folder" ? (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-stone-100">
                    <svg viewBox="0 0 24 24" className="h-8 w-8 text-stone-400" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    </svg>
                  </div>
                ) : (
                  <FileTypeTile name={item.name} size="lg" />
                )}
                <div className="w-full">
                  <p className="truncate text-[13px] font-medium" title={item.name}>
                    {item.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {item.type === "folder" ? "Folder" : formatBytes(item.size ?? 0)}
                  </p>
                </div>
                <div className="absolute right-1.5 top-1.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Actions for ${item.name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onAction(item.type === "folder" ? "open" : "preview", item)}>
                        {item.type === "folder" ? "Open folder" : "Preview"}
                      </DropdownMenuItem>
                      {item.type === "file" && (
                        <DropdownMenuItem onSelect={() => onAction("download", item)}>Download</DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => onAction("rename", item)}>Rename…</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onAction("move", item)}>Move…</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onAction("copy", item)}>Copy…</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onAction("copy-key", item)}>Copy S3 key</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        onSelect={() => onAction("delete", item)}
                      >
                        Delete…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <MenuItems item={item} onAction={onAction} />
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}