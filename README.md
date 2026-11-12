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
