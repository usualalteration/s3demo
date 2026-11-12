# Trustant prompt

```
# Build S3 Object Studio — A Complete Cloud File Manager

Create from scratch a fully functional **S3 Object Studio** application using React, Tailwind CSS, Python actions on Nuvolaris OpenServerless, and S3-compatible object storage.

Build and configure the entire application automatically using the available Trustant tools. Do not ask for confirmation between steps.

The application must provide a beautiful, professional file manager with real uploads, downloads, virtual folders, previews, and object management.

## 1. Mandatory S3 Integration

**All S3 connectivity MUST be configured exclusively through the Nuvolaris OpenServerless `action_add_s3` tool.**

This is a strict architectural requirement.

- Use `action_add_s3` to bind S3 storage to every OpenServerless action that needs it.
- Use the S3 connection automatically provided by the configured OpenServerless runtime.
- Inspect the integration's supported methods and use the existing runtime connection.
- Never ask the user for S3 credentials, access keys, secret keys, passwords, endpoints, regions, or bucket configuration.
- Never create a credential configuration screen.
- Never request environment variables containing S3 credentials.
- Never hardcode credentials or connection settings.
- Never use a separate, manually configured S3 SDK connection.
- Never require the user to configure AWS CLI, `.env` files, or S3 connection strings.
- Never ask the user to sign in to an S3 provider.
- Never expose S3 credentials to the frontend.
- Do not implement an alternative storage provider or use browser localStorage as persistent storage.

The S3 integration must be handled transparently by OpenServerless.

Use the available S3 storage configuration and bucket through `action_add_s3`.

If an S3 operation fails, investigate the bound action, runtime connection, permissions, or API implementation. Do not respond by asking the user for credentials.

If the runtime integration is unavailable, report the actual technical error instead of inventing a connection.

## 2. Application Workspace

Create an isolated storage workspace for the application.

Use a dedicated prefix such as:

`s3-object-studio/`

inside the S3 storage made available through `action_add_s3`.

Do not request the bucket name from the user.

Do not create or enumerate unrelated S3 buckets.

don't make a login page, the action_add_s3 must connect automatically

**The application must never scan or inspect the local development environment to populate its file browser.**

Specifically:

- Do not inspect host directories.
- Do not scan the development container.
- Do not browse virtual machine files.
- Do not import project files.
- Do not search for existing documents.
- Do not automatically generate example files.
- Do not use local filesystem content as demo data.
- Do not list S3 objects outside the dedicated application prefix.

For a new application namespace, display an empty workspace.

If the dedicated namespace already contains objects, preserve and display them. Never delete existing objects simply to simulate an empty workspace.

The initial empty state should display:

**Your storage space is ready.**

"Create folders, upload files, and organize your objects in secure cloud storage."

Provide two clear actions:

- **Upload Files**
- **Create Folder**

The application must store all user-created content in S3.

## 3. Working File Upload — Highest Priority

Implement real file uploads from the user's browser to S3.

**The application is not complete unless file upload and download work correctly.**

### Browser Upload

Implement a functional HTML file input with multiple-file support.

The Upload Files button must open the native browser file picker.

Support drag-and-drop as an additional upload method.

When users select files:

1. Read the actual browser File objects.
2. Extract filename, size, content type, and binary contents.
3. Transfer the actual file contents to a Python OpenServerless action.
4. Store the bytes in S3 using the connection bound through `action_add_s3`.
5. Verify that the object was successfully stored.
6. Refresh the file browser automatically.
7. Display the uploaded file immediately.

Never transmit only filenames or paths without file contents.

### Small File Upload Implementation

Implement a reliable Base64-over-JSON upload mechanism for small files.

Frontend request example:

```json
{
  "filename": "example.pdf",
  "folder": "documents/",
  "contentType": "application/pdf",
  "contentBase64": "<BASE64_FILE_CONTENT>",
  "overwrite": false
}
```

The Python action must:

- Receive the JSON request.
- Validate the filename and destination.
- Decode Base64 into original binary bytes.
- Use the S3 client made available by the `action_add_s3` binding.
- Store the bytes using the integration's supported object-upload method.
- Preserve the content type.
- Verify successful storage.
- Return the object key and stored size.

Use a safe upload size limit based on actual OpenServerless request limits.

Do not silently discard or truncate file contents.

### Large File Uploads

If the bound S3 integration supports generating presigned upload URLs, use them for larger files.

The OpenServerless action must generate short-lived, narrowly scoped URLs without exposing credentials.

React must use these URLs to upload the original binary contents directly from the browser.

Verify successful upload using the S3 connection before reporting completion.

Handle required CORS permissions.

If presigned uploads are unavailable, provide a clear maximum file size and keep small-file uploads fully functional.

Do not introduce a manual credential setup as a workaround.

### Upload Experience

Provide:

- Multiple-file selection.
- Drag-and-drop upload.
- Upload queue.
- Filename and size display.
- Progress indicators where supported.
- Clear processing states.
- Success and failure notifications.
- Retry failed uploads.
- Duplicate filename confirmation.
- Automatic file list refresh.

## 4. Folder Management

Implement persistent virtual folders using S3 object key prefixes.

Allow users to:

- Create folders.
- Create nested folders.
- Navigate folders.
- Rename folders.
- Move folders.
- Delete folders with confirmation.

Use zero-byte folder marker objects ending in `/` when necessary to persist empty folders.

Display breadcrumbs and folder navigation.

All folder operations must remain inside the application's dedicated S3 prefix.

Do not use local filesystem directories to implement folders.

## 5. File Browser

Create an elegant file browser with two display modes.

**List View**

Display:

- File name
- File type
- File size
- Last modified date
- Available actions

**Grid View**

Display:

- Large file-type icons.
- Folder icons.
- File names.
- File sizes.
- Contextual action menus.

Support:

- Sorting by name, size, and modification date.
- Searching files within the application prefix.
- Filtering by file type.
- Breadcrumb navigation.
- Multiple selection.
- Pagination for large collections.
- Refreshing the current folder.

All displayed files must correspond to actual S3 objects.

## 6. File Preview and Metadata

Create a right-side file inspector.

When a user selects a file, display:

- Filename
- Full object key
- Size
- Content type
- Last modified date
- ETag
- Custom metadata, when available

Support previews for:

- PNG, JPEG, GIF, and WebP.
- TXT, JSON, CSV, and Markdown.
- PDF documents.

Use secure download actions or short-lived read-only presigned URLs generated through the existing S3 integration.

Never expose S3 credentials in browser code.

Provide a working Download button for every file.

Downloads must preserve the original file contents.

## 7. File Operations

Implement the following actions using S3:

- Upload
- Download
- Rename
- Copy
- Move
- Delete
- Metadata retrieval

Use the operations supported by the S3 client provided by the OpenServerless binding.

Verify successful copies before deleting original objects.

Prevent accidental overwrites.

Validate filenames and object keys.

Prevent operations outside the application's dedicated namespace.

Use confirmation dialogs for destructive actions.

## 8. OpenServerless Backend Architecture

Use Python actions running on Nuvolaris OpenServerless.

**Every action requiring access to S3 must be configured using `action_add_s3`.**

Do not create standalone S3 connections using manually supplied credentials.

Create actions for:

- Workspace initialization
- Object listing
- Folder creation
- File upload
- Upload verification
- File download
- Object metadata
- Copy and move
- Rename
- Delete
- Storage statistics

Use the runtime-provided S3 client or connection object.

Inspect the actual integration interface rather than assuming unsupported methods.

Return structured JSON responses.

Handle errors including:

- Storage unavailable.
- Permission denied.
- Object not found.
- Duplicate object.
- Invalid filename.
- Upload too large.
- Upload timeout.
- Network failure.

Provide accurate technical error information without revealing secrets.

Ensure API access follows the application's authentication and authorization configuration.

Do not expose unrestricted public write or delete endpoints.

## 9. UI Design — Industrial Minimalism

Create a premium React application using Tailwind CSS and Lucide icons.

Use a consistent visual language inspired by modern professional cloud storage consoles.

**Design direction: Industrial Minimalism + Premium Cloud Console**

### Color Palette

| Element | Color |
|---|---|
| Primary crimson | `#C62828` |
| Deep burgundy | `#7F1D1D` |
| Warm red accent | `#EF4444` |
| Charcoal sidebar | `#18181B` |
| Graphite | `#27272A` |
| Warm ivory background | `#FAF9F6` |
| White cards | `#FFFFFF` |
| Light gray borders | `#E4E4E7` |
| Muted text | `#71717A` |

Use crimson for primary actions, selection indicators, and upload progress.

Avoid excessive gradients, neon, glassmorphism, and unnecessary animations.

### Layout

**Left Sidebar**

Create a dark charcoal sidebar containing:

- S3 Object Studio logo.
- My Storage.
- Recent Files.
- Storage Overview.
- Storage usage summary.

Do not display unrelated storage resources.

**Top Toolbar**

Provide:

- Breadcrumb navigation.
- Search.
- List/grid toggle.
- Create Folder button.
- Prominent crimson Upload Files button.

**Main Workspace**

Use a warm ivory background and white content surfaces.

Display an attractive empty state when no objects exist.

When users upload files or create folders, dynamically show the real contents of S3.

**Right Inspector**

Create a collapsible panel for previews and metadata.

### UI Components

Use:

- Inter typography.
- Monospace fonts for technical object keys.
- Rounded corners of 8–12px.
- Thin borders.
- Minimal shadows.
- Consistent spacing.
- Smooth transitions of approximately 200ms.
- Subtle hover states.
- Accessible keyboard navigation.
- Responsive desktop, tablet, and mobile layouts.

Keep the entire application visually coherent.

## 10. Storage Statistics

Show actual storage information:

- Total files.
- Total folders.
- Total storage used.
- Recent uploads.
- Distribution by file type.

Calculate statistics using only objects within the application's S3 prefix.

Do not generate fictional data.

Use zero values for a new empty workspace.

Handle pagination when computing statistics for larger collections.

## 11. Verification

Before declaring the application complete, perform the following checks.

**S3 Connection**

- Verify that every S3 action is bound through `action_add_s3`.
- Verify that actions can access the runtime-provided S3 client.
- Verify that no credentials are requested from the user.
- Verify that no credentials are embedded in frontend or backend code.

**File Upload**

1. Create a small test TXT file in an isolated test procedure.
2. Upload its actual bytes through the implemented API.
3. Verify the object exists in S3.
4. Download the object.
5. Compare downloaded contents with the original.
6. Repeat using a small binary image.
7. Verify that uploaded files appear in the React file browser.
8. Verify persistence after refreshing the browser.
9. Test uploads inside nested folders.
10. Test duplicate filenames and error handling.

**Folder Operations**

- Create an empty folder.
- Refresh the browser.
- Verify the folder remains visible.
- Upload a file into the folder.
- Verify navigation, listing, and download.

**Security**

- Confirm that all operations are restricted to the dedicated application prefix.
- Confirm that unrelated S3 objects are never listed or modified.
- Confirm that no local environment directories are scanned.
- Confirm that S3 credentials never appear in API responses or client code.

Use isolated temporary objects for automated tests and remove only those test objects.

If any test cannot be executed, report the exact unverified functionality rather than claiming success.

## 12. Final Requirements

Deliver a complete, working application demonstrating:

**React → Nuvolaris OpenServerless Python Actions → S3-Compatible Storage**

The application must:

- Connect to S3 exclusively using `action_add_s3`.
- Never ask the user for passwords, access keys, credentials, endpoints, or bucket settings.
- Never create a manual S3 configuration interface.
- Start with an empty workspace for a new application namespace.
- Never scan or import local environment files.
- Allow users to create persistent folders.
- Support real file uploads from the browser.
- Store and retrieve actual binary file contents.
- Allow downloads, previews, renaming, copying, moving, and deletion.
- Preserve all files across browser refreshes.
- Use a consistent crimson, charcoal, and ivory design.

**CRITICAL: Implement and verify working file uploads first. Do not consider the application complete until actual file contents have been successfully uploaded to and retrieved from S3 using the OpenServerless `action_add_s3` integration.**

Build the entire application from scratch without requiring any manual S3 credential configuration.

don't make a login page, the action_add_s3 must connect automatically
```

```
# S3 Object Studio

A professional cloud file manager built on **React + Tailwind CSS** with a
**Python OpenServerless** backend and **S3-compatible object storage**.

## What it does

- **Real uploads and downloads** — files are transferred from the browser as
  Base64-over-JSON for small files and streamed in verified chunks for larger
  ones, then stored byte-exact in S3 under the dedicated `s3-object-studio/`
  workspace prefix.
- **Virtual folders** — persistent zero-byte marker objects implement
  folders with full create / navigate / rename / move / delete support.
- **File browser** — list and grid views, sorting, type filters, workspace
  search, multi-selection, pagination, and breadcrumb navigation.
- **File inspector** — right-side panel with live metadata (ETag, content
  type, custom metadata) and inline previews for images, text, JSON, CSV,
  Markdown, and PDF.
- **Storage statistics** — real totals, type distribution, and recent
  uploads computed from the objects in the workspace.
- **No configuration, no accounts** — the studio opens straight into the
  file manager. All S3 connectivity is provided automatically by the
  OpenServerless runtime binding; there is no login page, no credential
  screen, and nothing to set up.

## Architecture

```
React (Vite, Tailwind, shadcn/ui)
        │  relative /api/my/... fetches
        ▼
OpenServerless Python actions (packages/v1/*)
        │  ctx.S3_CLIENT binding (action_add_s3)
        ▼
S3-compatible object storage
```

All S3 connectivity is provided exclusively by the OpenServerless runtime
binding — no credentials, endpoints, or buckets are configured in the app
and no sign-in is required.

## Backend endpoints

| Endpoint | Purpose |
|---|---|
| `v1/objects` | folder listing + workspace search |
| `v1/upload` | single-request and chunk-assemble uploads |
| `v1/download` | inline and ranged (chunked) downloads |
| `v1/folders` | create (nested) virtual folders |
| `v1/rename` | rename files and folders |
| `v1/copy-object` | copy / move files and folders |
| `v1/delete` | delete files or folder subtrees |
| `v1/metadata` | object HEAD metadata |
| `v1/stats` | workspace statistics |
| `v1/presign` | short-lived presigned URLs (cluster-internal) |
| `setup/storage` | idempotent workspace initialization + S3 read/write check |
