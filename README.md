# Trustant prompt

```
# Fix S3 File Upload — Make Upload Fully Functional

Fix the file upload functionality in the existing S3 Object Studio application.

Currently, users cannot successfully upload files. Investigate and fix the complete upload flow.

**Do not rebuild the application, change its visual design, or replace existing functionality.**

## Diagnose the Upload Problem

Inspect the existing React upload components, API calls, Python OpenServerless actions, and S3 integration.

Identify the actual cause of the upload failure.

Check:

- Whether the Upload Files button opens the browser's native file picker.
- Whether the selected File objects are correctly processed.
- Whether drag-and-drop produces valid browser File objects.
- Whether the frontend correctly sends file content rather than only filenames or metadata.
- Whether the OpenServerless upload action receives the expected request format.
- Whether the S3 client is properly configured through `action_add_s3`.
- Whether the upload action writes to the application's dedicated S3 namespace.
- Whether HTTP errors, CORS restrictions, payload limits, or binary encoding issues prevent uploads.

## Implement a Reliable Upload Flow

Use the simplest reliable upload mechanism supported by the existing environment.

For small files:

1. Let users select files using the browser file picker.
2. Read the selected file content in the browser.
3. Encode binary content as Base64 when sending it through a JSON OpenServerless action.
4. Decode the content in the Python backend.
5. Upload the actual binary content to S3 using `PutObject`.
6. Preserve the original filename and MIME type.
7. Return a JSON response indicating success or failure.

For large files, use short-lived, scoped presigned S3 upload URLs if supported by the configured storage service and its CORS settings. If unavailable, clearly enforce the small-file upload limit instead of silently failing.

Never send local filesystem paths to the backend as a substitute for file content.

Do not scan local directories or development environment files.

## Python OpenServerless Backend

Ensure the upload action:

- Uses the S3 integration already configured in Trustant.
- Accepts the filename, MIME type, destination folder, and Base64 file content.
- Validates input and file size before decoding.
- Decodes Base64 safely.
- Uses the existing dedicated application bucket or prefix.
- Calls S3 `PutObject` with the actual file bytes.
- Handles S3 errors and returns meaningful messages.
- Does not overwrite an existing object without explicit confirmation.
- Never writes files into unrelated buckets or prefixes.

Do not assume a particular S3 client API. Inspect the actual runtime integration and use the supported client methods.

## React Frontend

Make sure the existing Upload Files button and drag-and-drop area work correctly.

- Support selecting multiple files.
- Upload each selected file.
- Display upload progress or clearly labeled upload status.
- Show an error when an upload fails.
- Show a success notification after S3 confirms the upload.
- Automatically refresh the current folder after successful uploads.
- Ensure uploaded files appear immediately in the file browser.
- Preserve the current crimson, charcoal, and ivory design.

## Verify the Fix

Test the actual end-to-end upload flow:

1. Upload a small TXT file containing known text.
2. Verify that the object exists in S3.
3. Download the object and verify its contents match the original.
4. Upload a small PNG file and verify its bytes remain intact.
5. Refresh the browser and confirm both objects are visible.
6. Test uploading into a nested folder.
7. Test upload errors and duplicate filenames.
8. Clean up only temporary test objects created during this verification.

Do not claim that uploads work unless the file bytes have been successfully stored and retrieved from S3.

If an end-to-end test cannot be performed, report exactly which step remains unverified and why.

**Expected result:** Users must be able to select a file from their computer, upload its actual contents to S3, and see it in the application's file browser immediately.

Fix the existing implementation rather than generating another mock upload interface.
```

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
