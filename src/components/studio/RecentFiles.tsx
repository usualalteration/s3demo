import { Clock, Download } from "lucide-react";
import { FileIcon } from "./FileIcon";
import { formatBytes, formatDate } from "@/lib/files";
import type { FileEntry } from "@/lib/types";

interface RecentFilesProps {
  recent: FileEntry[];
  loading: boolean;
  onSelectFile: (entry: FileEntry) => void;
  onDownload: (entry: FileEntry) => void;
  onOpenParent: (entry: FileEntry) => void;
}

export default function RecentFiles({ recent, loading, onSelectFile, onDownload, onOpenParent }: RecentFilesProps) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-linen border-t-crimson" aria-hidden="true" />
      </div>
    );
  }

  if (recent.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <Clock className="h-10 w-10 text-mutedink/40" aria-hidden="true" />
        <p className="mt-4 text-lg font-semibold text-charcoal">No recent activity yet</p>
        <p className="mt-1 max-w-sm text-sm text-mutedink">
          Files you upload will appear here, newest first.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="overflow-hidden rounded-xl border border-linen bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-linen bg-ivory/60 text-left text-xs font-semibold uppercase tracking-wider text-mutedink">
              <th scope="col" className="px-4 py-3">File</th>
              <th scope="col" className="hidden px-4 py-3 sm:table-cell">Location</th>
              <th scope="col" className="px-4 py-3">Size</th>
              <th scope="col" className="hidden px-4 py-3 md:table-cell">Uploaded</th>
              <th scope="col" className="w-24 px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((entry) => (
              <tr key={entry.path} className="border-b border-linen/70 transition-base last:border-0 hover:bg-ivory/60">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelectFile(entry)}
                    className="flex min-w-0 items-center gap-3 text-left focus:outline-none focus:ring-2 focus:ring-crimson/30 rounded"
                  >
                    <FileIcon name={entry.name} box />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-charcoal">{entry.name}</span>
                      <span className="block truncate font-mono text-[11px] text-mutedink">{entry.path}</span>
                    </span>
                  </button>
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <button
                    type="button"
                    onClick={() => onOpenParent(entry)}
                    className="rounded text-mutedink transition-base hover:text-crimson focus:outline-none focus:ring-2 focus:ring-crimson/30"
                  >
                    {entry.path.includes("/") ? entry.path.split("/").slice(0, -1).join("/") : "My Storage"}
                  </button>
                </td>
                <td className="px-4 py-3 text-mutedink">{formatBytes(entry.size)}</td>
                <td className="hidden px-4 py-3 text-mutedink md:table-cell">{formatDate(entry.lastModified)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onDownload(entry)}
                    aria-label={`Download ${entry.name}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-mutedink transition-base hover:bg-crimson/5 hover:text-crimson focus:outline-none focus:ring-2 focus:ring-crimson/30"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
