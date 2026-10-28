import { ArrowDown, ArrowUp, MoreVertical } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { categoryLabel, formatBytes, formatDate } from "@/lib/format";
import { FolderIcon, FileTypeIcon } from "./FileIcon";
import type { ItemAction, SortBy, SortDir, StorageItem } from "./types";

export interface FileTableProps {
  items: StorageItem[];
  selectedKeys: Set<string>;
  allSelected: boolean;
  sort: { by: SortBy; dir: SortDir };
  onToggleItem: (key: string) => void;
  onToggleAll: () => void;
  onRowClick: (item: StorageItem, event: React.MouseEvent) => void;
  onRowDoubleClick: (item: StorageItem) => void;
  onSortChange: (by: SortBy) => void;
  onAction: (action: ItemAction, item: StorageItem) => void;
}

function actionItems(item: StorageItem) {
  const items: { id: ItemAction; label: string }[] = [];
  if (item.type === "folder") {
    items.push({ id: "open", label: "Open folder" });
  } else {
    items.push({ id: "preview", label: "Preview" });
  }
  if (item.type === "file") {
    items.push({ id: "download", label: "Download" });
  }
  items.push(
    { id: "rename", label: "Rename…" },
    { id: "move", label: "Move…" },
    { id: "copy", label: "Copy…" },
    { id: "copy-key", label: "Copy S3 key" },
  );
  items.push({ id: "delete", label: "Delete…" });
  return items;
}

function MenuItems({ item, onAction }: { item: StorageItem; onAction: (a: ItemAction, i: StorageItem) => void }) {
  const entries = actionItems(item);
  return (
    <>
      {entries.slice(0, 2).map((entry) => (
        <ContextMenuItem key={entry.id} onSelect={() => onAction(entry.id, item)}>
          {entry.label}
        </ContextMenuItem>
      ))}
      <ContextMenuSeparator />
      {entries.slice(2, 6).map((entry) => (
        <ContextMenuItem key={entry.id} onSelect={() => onAction(entry.id, item)}>
          {entry.label}
        </ContextMenuItem>
      ))}
      <ContextMenuSeparator />
      <ContextMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onSelect={() => onAction("delete", item)}>
        Delete…
      </ContextMenuItem>
    </>
  );
}

function DropdownItems({ item, onAction }: { item: StorageItem; onAction: (a: ItemAction, i: StorageItem) => void }) {
  const entries = actionItems(item);
  return (
    <>
      {entries.slice(0, 2).map((entry) => (
        <DropdownMenuItem key={entry.id} onSelect={() => onAction(entry.id, item)}>
          {entry.label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      {entries.slice(2, 6).map((entry) => (
        <DropdownMenuItem key={entry.id} onSelect={() => onAction(entry.id, item)}>
          {entry.label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onSelect={() => onAction("delete", item)}>
        Delete…
      </DropdownMenuItem>
    </>
  );
}

function SortHeader({
  label,
  by,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  by: SortBy;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded px-2 py-1 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground",
        active && "text-studio-crimson",
        className,
      )}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  );
}

export function FileTable({
  items,
  selectedKeys,
  allSelected,
  sort,
  onToggleItem,
  onToggleAll,
  onRowClick,
  onRowDoubleClick,
  onSortChange,
  onAction,
}: FileTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[540px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-studio-sand/80 bg-white/60">
            <th className="w-10 py-2.5 pl-4 pr-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleAll}
                aria-label="Select all items"
                className="data-[state=unchecked]:border-studio-slate/70"
              />
            </th>
            <th className="py-2.5 pr-2 text-left">
              <SortHeader label="Name" by="name" active={sort.by === "name"} dir={sort.dir} onClick={() => onSortChange("name")} />
            </th>
            <th className="hidden py-2.5 pr-2 text-left md:table-cell">
              <span className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</span>
            </th>
            <th className="py-2.5 pr-2 text-right">
              <SortHeader label="Size" by="size" active={sort.by === "size"} dir={sort.dir} onClick={() => onSortChange("size")} className="justify-end" />
            </th>
            <th className="hidden py-2.5 pr-2 text-left lg:table-cell">
              <SortHeader label="Modified" by="modified" active={sort.by === "modified"} dir={sort.dir} onClick={() => onSortChange("modified")} />
            </th>
            <th className="w-12 py-2.5 pr-3" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const selected = selectedKeys.has(item.key);
            return (
              <ContextMenu key={item.key}>
                <ContextMenuTrigger asChild>
                  <tr
                    tabIndex={0}
                    onClick={(event) => onRowClick(item, event)}
                    onDoubleClick={() => onRowDoubleClick(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        onRowDoubleClick(item);
                      }
                    }}
                    className={cn(
                      "group cursor-default border-b border-studio-sand/60 outline-none transition-colors last:border-b-0",
                      selected ? "bg-studio-crimson/5" : "hover:bg-secondary/50",
                      selected && "shadow-[inset_2px_0_0_0_hsl(0_66%_47%)]",
                    )}
                  >
                    <td className="py-2.5 pl-4 pr-2 align-middle">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => onToggleItem(item.key)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Select ${item.name}`}
                        className="data-[state=unchecked]:border-studio-slate/70"
                      />
                    </td>
                    <td className="max-w-0 py-2.5 pr-2">
                      <div className="flex items-center gap-2.5">
                        {item.type === "folder" ? <FolderIcon /> : <FileTypeIcon name={item.name} />}
                        <span className="truncate font-medium text-[13px]" title={item.name}>
                          {item.name}
                        </span>
                      </div>
                    </td>
                    <td className="hidden max-w-[10rem] py-2.5 pr-2 md:table-cell">
                      <span className="truncate text-xs text-muted-foreground">
                        {item.type === "folder" ? "Folder" : categoryLabel(item.name)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-2 text-right text-xs tabular-nums text-muted-foreground">
                      {item.type === "folder" ? "—" : formatBytes(item.size ?? 0)}
                    </td>
                    <td className="hidden whitespace-nowrap py-2.5 pr-2 text-xs text-muted-foreground lg:table-cell">
                      {item.type === "folder" ? "—" : formatDate(item.lastModified)}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
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
                          <DropdownItems item={item} onAction={onAction} />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <MenuItems item={item} onAction={onAction} />
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}