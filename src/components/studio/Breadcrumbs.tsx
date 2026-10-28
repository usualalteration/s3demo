import { ChevronRight, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbsProps {
  /** Folder path with trailing slash, "" for the workspace root. */
  folder: string;
  onNavigate: (folder: string) => void;
  className?: string;
}

export function Breadcrumbs({ folder, onNavigate, className }: BreadcrumbsProps) {
  const segments = folder.replace(/\/+$/, "").split("/").filter(Boolean);

  return (
    <nav aria-label="Folder path" className={cn("flex min-w-0 items-center gap-1 text-sm", className)}>
      <button
        type="button"
        onClick={() => onNavigate("")}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors",
          segments.length === 0
            ? "bg-secondary text-secondary-foreground"
            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
        )}
      >
        <HardDrive className="h-4 w-4" />
        <span className="hidden sm:inline">My Storage</span>
      </button>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const target = `${segments.slice(0, index + 1).join("/")}/`;
        return (
          <div key={target} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
            <button
              type="button"
              onClick={() => onNavigate(target)}
              className={cn(
                "max-w-[10rem] truncate rounded-md px-2 py-1 transition-colors",
                isLast
                  ? "bg-secondary font-semibold text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
              title={target}
            >
              {segment}
            </button>
          </div>
        );
      })}
    </nav>
  );
}