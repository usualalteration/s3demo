import {
  Clock,
  Database,
  HardDrive,
  LayoutGrid,
  PieChart,
} from "lucide-react";
import { formatBytes } from "@/lib/files";
import type { StatsResponse } from "@/lib/types";

export type StudioView = "storage" | "recent" | "overview";

interface SidebarProps {
  view: StudioView;
  onViewChange: (view: StudioView) => void;
  stats: StatsResponse | null;
}

export default function Sidebar({ view, onViewChange, stats }: SidebarProps) {
  const usedBytes = stats?.totals.bytes ?? 0;

  const navItems: { id: StudioView; label: string; icon: typeof Database }[] = [
    { id: "storage", label: "My Storage", icon: Database },
    { id: "recent", label: "Recent Files", icon: Clock },
    { id: "overview", label: "Storage Overview", icon: PieChart },
  ];

  return (
    <aside className="flex h-full w-64 flex-col bg-charcoal text-zinc-200">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
          <HardDrive className="h-5 w-5 text-crimson-accent" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-bold tracking-tight text-white">S3 Object Studio</p>
          <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Cloud storage</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 scrollbar-thin-dark" aria-label="Primary">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-base ${
                active
                  ? "bg-crimson text-white shadow-sm"
                  : "text-zinc-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Storage usage summary */}
      <div className="mx-3 mb-3 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-crimson-accent" aria-hidden="true" />
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Storage</p>
        </div>
        <p className="mt-2 text-xl font-bold text-white">{formatBytes(usedBytes)}</p>
        <p className="mt-0.5 text-xs text-zinc-400">
          {stats ? `${stats.totals.files} file${stats.totals.files === 1 ? "" : "s"}` : "—"}
          {" · "}
          {stats ? `${stats.totals.folders} folder${stats.totals.folders === 1 ? "" : "s"}` : "—"}
        </p>
      </div>

      {/* Automatic S3 connection status */}
      <div className="border-t border-white/10 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <p className="text-xs font-semibold text-white">S3 storage connected</p>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          OpenServerless runtime binding · no configuration required
        </p>
      </div>
    </aside>
  );
}
