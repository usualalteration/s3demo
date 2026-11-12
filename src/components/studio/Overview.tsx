import { Clock, Database, FolderClosed, HardDrive, PieChart } from "lucide-react";
import { FileIcon } from "./FileIcon";
import { CATEGORY_LABELS, categoryOf, formatBytes, formatDate, type FileCategory } from "@/lib/files";
import type { StatsResponse } from "@/lib/types";

interface OverviewProps {
  stats: StatsResponse | null;
  loading: boolean;
}

const BAR_COLORS: Record<FileCategory, string> = {
  image: "bg-crimson",
  pdf: "bg-crimson-dark",
  document: "bg-blue-900",
  spreadsheet: "bg-emerald-700",
  presentation: "bg-amber-600",
  archive: "bg-amber-800",
  audio: "bg-violet-800",
  video: "bg-rose-700",
  code: "bg-charcoal",
  other: "bg-mutedink",
};

export default function Overview({ stats, loading }: OverviewProps) {
  if (loading || !stats) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-linen border-t-crimson" aria-hidden="true" />
      </div>
    );
  }

  const { totals, byType, recent } = stats;
  const maxCount = Math.max(1, ...byType.map((t) => t.count));

  const cards = [
    { label: "Total files", value: String(totals.files), icon: Database, hint: "objects stored in S3" },
    { label: "Total folders", value: String(totals.folders), icon: FolderClosed, hint: "virtual folder prefixes" },
    { label: "Storage used", value: formatBytes(totals.bytes), icon: HardDrive, hint: "within your workspace" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border border-linen bg-white p-5 shadow-sm transition-base hover:shadow-md">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-mutedink">{card.label}</p>
                <Icon className="h-4 w-4 text-crimson" aria-hidden="true" />
              </div>
              <p className="mt-2 text-3xl font-bold tracking-tight text-charcoal">{card.value}</p>
              <p className="mt-1 text-xs text-mutedink">{card.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Type distribution */}
        <div className="rounded-xl border border-linen bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <PieChart className="h-4 w-4 text-crimson" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-charcoal">Distribution by file type</h3>
          </div>
          {byType.length === 0 ? (
            <p className="mt-6 text-sm text-mutedink">Upload files to see their distribution here.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {byType.map((item) => {
                const category = item.type as FileCategory;
                return (
                  <li key={item.type}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-charcoal">{CATEGORY_LABELS[category] ?? item.type}</span>
                      <span className="text-mutedink">
                        {item.count} · {formatBytes(item.bytes)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ivory">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${BAR_COLORS[category] ?? "bg-charcoal"}`}
                        style={{ width: `${Math.max(6, (item.count / maxCount) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Recent uploads */}
        <div className="rounded-xl border border-linen bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-crimson" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-charcoal">Recent uploads</h3>
          </div>
          {recent.length === 0 ? (
            <p className="mt-6 text-sm text-mutedink">No uploads yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-linen">
              {recent.map((entry) => (
                <li key={entry.path} className="flex items-center gap-3 py-2.5">
                  <FileIcon name={entry.name} box />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-charcoal">{entry.name}</p>
                    <p className="truncate font-mono text-[11px] text-mutedink">{entry.path}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-charcoal">{formatBytes(entry.size)}</p>
                    <p className="text-[11px] text-mutedink">{formatDate(entry.lastModified)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
