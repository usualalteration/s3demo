import { CloudUpload, FolderPlus, HardDrive } from "lucide-react";

interface EmptyStateProps {
  onUpload: () => void;
  onCreateFolder: () => void;
}

export default function EmptyState({ onUpload, onCreateFolder }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-linen">
        <HardDrive className="h-10 w-10 text-crimson" aria-hidden="true" />
      </div>
      <h2 className="mt-6 text-2xl font-bold tracking-tight text-charcoal">
        Your storage space is ready.
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-mutedink">
        Create folders, upload files, and organize your objects in secure cloud storage.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onUpload}
          className="flex h-11 items-center justify-center gap-2 rounded-lg bg-crimson px-6 text-sm font-semibold text-white shadow-sm transition-base hover:bg-crimson-dark focus:outline-none focus:ring-2 focus:ring-crimson/40"
        >
          <CloudUpload className="h-4 w-4" aria-hidden="true" />
          Upload Files
        </button>
        <button
          type="button"
          onClick={onCreateFolder}
          className="flex h-11 items-center justify-center gap-2 rounded-lg border border-linen bg-white px-6 text-sm font-semibold text-charcoal shadow-sm transition-base hover:border-charcoal/30 hover:bg-white focus:outline-none focus:ring-2 focus:ring-crimson/20"
        >
          <FolderPlus className="h-4 w-4" aria-hidden="true" />
          Create Folder
        </button>
      </div>
    </div>
  );
}
