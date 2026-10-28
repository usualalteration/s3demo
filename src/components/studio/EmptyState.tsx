import { FolderPlus, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Abstract storage illustration — thin crimson line art on a warm circle. */
export function StorageIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 170" role="img" aria-label="Abstract storage illustration" className={className}>
      {/* warm-gray circular background */}
      <circle cx="110" cy="86" r="72" fill="#F0EBE2" />
      <circle cx="110" cy="86" r="72" fill="none" stroke="#E7E0D4" strokeWidth="1" />
      {/* floating accents */}
      <circle cx="38" cy="42" r="3" fill="#C62828" opacity="0.55" />
      <circle cx="186" cy="120" r="2.5" fill="#C62828" opacity="0.35" />
      <circle cx="176" cy="34" r="2" fill="#71717A" opacity="0.4" />
      {/* stacked storage outlines */}
      <g fill="none" stroke="#C62828" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="58" y="104" width="104" height="32" rx="7" />
        <rect x="67" y="76" width="86" height="28" rx="7" />
        <rect x="76" y="48" width="68" height="28" rx="7" />
      </g>
      {/* detail lines */}
      <g stroke="#C62828" strokeWidth="1.5" opacity="0.45" strokeLinecap="round">
        <line x1="84" y1="60" x2="136" y2="60" />
        <line x1="76" y1="90" x2="144" y2="90" />
        <line x1="70" y1="120" x2="150" y2="120" />
      </g>
      {/* label dots */}
      <circle cx="86" cy="66" r="1.8" fill="#C62828" opacity="0.8" />
      <circle cx="78" cy="96" r="1.8" fill="#C62828" opacity="0.8" />
      <circle cx="72" cy="126" r="1.8" fill="#C62828" opacity="0.8" />
      <line x1="70" y1="146" x2="150" y2="146" stroke="#E7E0D4" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface EmptyWorkspaceProps {
  onCreateFolder: () => void;
  onUpload: () => void;
}

/** The launch screen shown when the storage workspace has no content. */
export function EmptyWorkspace({ onCreateFolder, onUpload }: EmptyWorkspaceProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <StorageIllustration className="h-44 w-auto" />
      <h2 className="mt-6 text-xl font-semibold tracking-tight">Your storage space is ready.</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Create folders, upload files, and organize your objects in secure S3 storage.
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <Button onClick={onUpload} className="gap-2 bg-studio-crimson px-5 hover:bg-studio-crimson-dark">
          <UploadCloud className="h-4 w-4" />
          Upload Files
        </Button>
        <Button variant="outline" onClick={onCreateFolder} className="gap-2 bg-white px-5">
          <FolderPlus className="h-4 w-4 text-studio-crimson" />
          Create Folder
        </Button>
      </div>
      <p className="mt-8 text-xs uppercase tracking-widest text-muted-foreground/70">
        Workspace is empty — 0 items
      </p>
    </div>
  );
}

/** Small inline empty state for folders with no content. */
export function EmptyFolder({ onCreateFolder, onUpload }: EmptyWorkspaceProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-100">
        <FolderPlus className="h-6 w-6 text-stone-400" />
      </div>
      <h3 className="mt-4 text-base font-semibold">This folder is empty</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Upload files or create a subfolder to get started.
      </p>
      <div className="mt-5 flex gap-2.5">
        <Button size="sm" onClick={onUpload} className="gap-2 bg-studio-crimson hover:bg-studio-crimson-dark">
          <UploadCloud className="h-3.5 w-3.5" />
          Upload
        </Button>
        <Button size="sm" variant="outline" onClick={onCreateFolder} className="gap-2 bg-white">
          <FolderPlus className="h-3.5 w-3.5 text-studio-crimson" />
          New Folder
        </Button>
      </div>
    </div>
  );
}