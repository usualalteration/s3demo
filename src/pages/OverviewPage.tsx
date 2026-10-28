import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BarChart3, Clock, Database, FileText, FolderTree, HardDrive } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getStats } from "@/lib/api";
import { formatBytes, formatDate, parentFolderOf } from "@/lib/format";

const TYPE_COLORS: Record<string, string> = {
  image: "bg-violet-500",
  pdf: "bg-studio-crimson",
  document: "bg-blue-500",
  spreadsheet: "bg-emerald-500",
  text: "bg-stone-400",
  code: "bg-amber-500",
  archive: "bg-orange-500",
  audio: "bg-pink-500",
  video: "bg-indigo-500",
  other: "bg-zinc-400",
};

const TYPE_LABELS: Record<string, string> = {
  image: "Images",
  pdf: "PDFs",
  document: "Documents",
  spreadsheet: "Spreadsheets",
  text: "Text files",
  code: "Code & data",
  archive: "Archives",
  audio: "Audio",
  video: "Video",
  other: "Other",
};

export default function OverviewPage() {
  const navigate = useNavigate();
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: getStats, staleTime: 10_000 });
  const stats = statsQuery.data?.stats;

  const byType = stats
    ? Object.entries(stats.byType)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
    : [];
  const maxTypeCount = byType.length > 0 ? byType[0][1] : 1;

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-3 lg:px-6">
        <h1 className="text-lg font-semibold tracking-tight">Storage Overview</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          A live snapshot of everything inside this application's namespace.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 lg:px-6 scrollbar-thin">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Total files */}
          <div className="rounded-xl border bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total files</p>
              <FileText className="h-4 w-4 text-studio-crimson" />
            </div>
            {statsQuery.isPending ? (
              <Skeleton className="mt-2 h-8 w-20" />
            ) : (
              <p className="mt-1 text-3xl font-semibold tabular-nums">{stats?.files ?? 0}</p>
            )}
          </div>
          {/* Total folders */}
          <div className="rounded-xl border bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total folders</p>
              <FolderTree className="h-4 w-4 text-studio-crimson" />
            </div>
            {statsQuery.isPending ? (
              <Skeleton className="mt-2 h-8 w-20" />
            ) : (
              <p className="mt-1 text-3xl font-semibold tabular-nums">{stats?.folders ?? 0}</p>
            )}
          </div>
          {/* Storage used */}
          <div className="rounded-xl border bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Storage used</p>
              <HardDrive className="h-4 w-4 text-studio-crimson" />
            </div>
            {statsQuery.isPending ? (
              <Skeleton className="mt-2 h-8 w-24" />
            ) : (
              <p className="mt-1 text-3xl font-semibold tabular-nums">{formatBytes(stats?.size ?? 0)}</p>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
          {/* Type breakdown */}
          <div className="rounded-xl border bg-white p-5 lg:col-span-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-studio-crimson" />
              <h2 className="text-sm font-semibold">Content breakdown</h2>
            </div>
            {statsQuery.isPending ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-5 w-full" />
                ))}
              </div>
            ) : byType.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Nothing here yet — upload files to see the breakdown by type.
              </p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {byType.map(([type, count]) => (
                  <div key={type}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{TYPE_LABELS[type] ?? type}</span>
                      <span className="tabular-nums text-muted-foreground">{count}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className={`h-full rounded-full ${TYPE_COLORS[type] ?? "bg-zinc-400"}`}
                        style={{ width: `${Math.max(6, (count / maxTypeCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent uploads */}
          <div className="rounded-xl border bg-white p-5 lg:col-span-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-studio-crimson" />
              <h2 className="text-sm font-semibold">Recent uploads</h2>
            </div>
            {statsQuery.isPending ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-5 w-full" />
                ))}
              </div>
            ) : !stats || stats.recent.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No uploads yet. Files you upload will be listed here with their modification time.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-studio-sand/60">
                {stats.recent.map((file) => (
                  <li key={file.path} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium" title={file.name}>
                        {file.name}
                      </p>
                      <p className="truncate font-mono-tech text-[10px] text-muted-foreground" title={file.path}>
                        {parentFolderOf(file.path) || "s3-studio/"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatBytes(file.size)}</span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {formatDate(file.lastModified)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Namespace explainer */}
        <div className="mt-4 rounded-xl border bg-white p-5">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-studio-crimson" />
            <h2 className="text-sm font-semibold">How this workspace stores your data</h2>
          </div>
          <div className="mt-3 grid gap-4 text-[13px] leading-relaxed text-muted-foreground md:grid-cols-2">
            <p>
              This application stores everything under the dedicated prefix{" "}
              <code className="font-mono-tech rounded bg-stone-100 px-1 py-0.5 text-[11px] text-foreground">
                s3-studio/
              </code>{" "}
              inside its configured, bucket-scoped S3 storage. Only objects under this prefix are listed,
              counted, or modified — unrelated data is never touched.
            </p>
            <p>
              S3 is an object store: it has no real directories. Folders are{" "}
              <strong className="text-foreground">object-key prefixes</strong> (for example{" "}
              <code className="font-mono-tech rounded bg-stone-100 px-1 py-0.5 text-[11px] text-foreground">
                s3-studio/documents/
              </code>
              ), and empty folders stay visible thanks to zero-byte marker objects. Renaming and moving use
              verified copy-and-delete semantics.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/storage")}
            className="mt-3 text-[13px] font-medium text-studio-crimson underline-offset-4 hover:underline"
          >
            Browse your storage →
          </button>
        </div>
      </div>
    </div>
  );
}