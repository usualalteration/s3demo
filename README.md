# S3 Object Studio

A premium cloud storage manager for S3-compatible object storage, built with
React + Tailwind CSS on the frontend and Python actions on Nuvolaris
OpenServerless on the backend.

```
React (Vite, HashRouter) → /api/my/v1/* Python Actions → S3-compatible storage
```

## How it works

- **Isolated namespace.** Every object the app manages lives under the
  dedicated prefix `s3-studio/` inside the bucket-scoped S3 data bucket
  (`ctx.S3_DATA`) provided by the OpenServerless runtime. The app never
  enumerates the local filesystem, never lists other buckets, and only ever
  reads/writes/deletes inside its own prefix.
- **Empty first run.** The workspace starts empty. Folders and files appear
  only through explicit user actions.
- **S3 semantics.** Folders are object-key prefixes; empty folders stay
  visible via zero-byte marker objects. Renames and moves use verified
  copy-and-delete semantics (the copy is confirmed before the original is
  deleted, with rollback on failure).

## Backend actions (package `v1`)

| Endpoint | Purpose |
|---|---|
| `storage-init` | Verify the S3 connection with a real put/get/compare/delete probe |
| `storage-list` | List folders/objects under a prefix (continuation-token pagination) |
| `folder-create` | Create a virtual folder (zero-byte marker object) |
| `object-upload` | Upload a base64-encoded file (overwrite requires an explicit flag) |
| `object-download` | Download an object (base64, or presigned URL for large files) |
| `object-meta` | HeadObject metadata for files; object count/size for folders |
| `object-preview` | Bounded preview content (text ≤256 KB, images ≤3 MB, PDF ≤8 MB) |
| `object-copy` | Copy a file or a whole folder within the namespace |
| `object-move` | Move a file/folder (verified copy, then delete originals) |
| `object-rename` | Rename a file/folder (verified copy, then delete originals) |
| `object-delete` | Delete a file, or a folder (recursive with confirmation) |
| `storage-search` | Case-insensitive search within the application namespace |
| `storage-stats` | Totals, per-type breakdown, and recent uploads |

All actions validate and normalize user paths, reject `..` traversal, and
confine every operation to the `s3-studio/` prefix.

## Frontend

- **My Storage** — breadcrumbs, list/grid views, sorting, type filters,
  search, drag-and-drop uploads with progress + cancel, context menus,
  multi-select with batch download/delete, and an inspector panel with
  previews and metadata.
- **Recent Files** — the latest modified objects with locate/download.
- **Storage Overview** — totals, type breakdown, recent uploads, and an
  explanation of the S3 key/prefix model.

Design: Industrial Minimalism + Premium Cloud Console — charcoal sidebar,
ivory workspace, crimson actions (Inter UI, JetBrains Mono for S3 keys).