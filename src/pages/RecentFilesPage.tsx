import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clock, Download, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadToDisk, getStats, ApiError, type RecentFile } from "@/lib/api";
import { formatBytes, formatDate, parentFolderOf } from "@/lib/format";
import { FileTypeIcon } from "@/components/studio/FileIcon";

export default function RecentFilesPage() {
  const navigate = useNavigate();
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: getStats, staleTime: 10_000 });
  const recent = statsQuery.data?.stats.recent ?? [];

  const locate = (file: RecentFile) => {
    const folder = parentFolderOf(file.path).replace(/\/+$/, "");
    navigate(folder ? `/storage?path=${encodeURIComponent(folder)}` : "/storage");
  };

  const download = async (file: RecentFile) => {
    try {
      await downloadToDisk(file.path, file.name);
      toast.success(`Downloading “${file.name}”`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Download failed");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-3 lg:px-6">
        <h1 className="text-lg font-semibold tracking-tight">Recent Files</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          The most recently modified objects in this workspace.
        </p>
      </div>

      <div className="min-h-0 flex-1 px-4 pb-4 lg:px-6 lg:pb-6">
        <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-white">
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {statsQuery.isPending ? (
              <div className="space-y-2.5 p-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <Skeleton className="h-6 w-6 rounded" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-100">
                  <Clock className="h-6 w-6 text-stone-400" />
                </div>
                <h3 className="mt-4 text-base font-semibold">No recent activity yet</h3>
                <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                  Upload or create files and they will appear here, newest first.
                </p>
                <Button
                  size="sm"
                  className="mt-5 bg-studio-crimson hover:bg-studio-crimson-dark"
                  onClick={() => navigate("/storage")}
                >
                  Go to My Storage
                </Button>
              </div>
            ) : (
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-studio-sand/80 bg-white/60">
                    {["Name", "Location", "Size", "Modified", ""].map((label, index) => (
                      <th
                        key={label || index}
                        className={`px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground ${
                          index === 2 ? "hidden md:table-cell" : ""
                        } ${index === 3 ? "hidden lg:table-cell" : ""}`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((file) => (
                    <tr
                      key={file.path}
                      className="border-b border-studio-sand/60 transition-colors last:border-b-0 hover:bg-secondary/50"
                    >
                      <td className="max-w-0 px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <FileTypeIcon name={file.name} />
                          <span className="truncate text-[13px] font-medium" title={file.name}>
                            {file.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono-tech truncate text-[11px] text-muted-foreground" title={parentFolderOf(file.path) || "s3-studio/"}>
                          {parentFolderOf(file.path) || "s3-studio/"}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-muted-foreground md:table-cell">
                        {formatBytes(file.size)}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground lg:table-cell">
                        {formatDate(file.lastModified)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-xs"
                            onClick={() => locate(file)}
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Show</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-xs"
                            onClick={() => void download(file)}
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Download</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}