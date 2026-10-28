"""S3 Object Studio — storage statistics for the application namespace.

Aggregates total files, total folders (derived from key prefixes and folder
markers), total bytes used, a per-category type breakdown, and the most
recently modified objects. Only objects under the dedicated application
prefix are counted.
"""

STUDIO_NS = "s3-studio/"
SCAN_CAP = 3000

IMAGE_EXTS = {"png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"}
TEXT_EXTS = {"txt", "md", "markdown", "log", "csv", "json", "xml", "yaml", "yml", "ini", "toml"}
CODE_EXTS = {"js", "mjs", "ts", "tsx", "jsx", "html", "htm", "css", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "sh", "sql"}
AUDIO_EXTS = {"mp3", "wav", "ogg", "flac", "m4a"}
VIDEO_EXTS = {"mp4", "mov", "avi", "mkv", "webm"}
ARCHIVE_EXTS = {"zip", "gz", "tar", "rar", "7z", "bz2"}
DOC_EXTS = {"doc", "docx", "odt", "rtf"}
SHEET_EXTS = {"xls", "xlsx", "ods"}


def error(message, code):
    return {"ok": False, "error": message, "code": code}


def iso(value):
    if value is None:
        return None
    try:
        return value.isoformat()
    except Exception:  # noqa: BLE001
        return str(value)


def category_of(rel_path):
    name = rel_path.rsplit("/", 1)[-1]
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext in IMAGE_EXTS:
        return "image"
    if ext == "pdf":
        return "pdf"
    if ext in DOC_EXTS:
        return "document"
    if ext in SHEET_EXTS:
        return "spreadsheet"
    if ext in ARCHIVE_EXTS:
        return "archive"
    if ext in AUDIO_EXTS:
        return "audio"
    if ext in VIDEO_EXTS:
        return "video"
    if ext in CODE_EXTS:
        return "code"
    if ext in TEXT_EXTS:
        return "text"
    return "other"


def main(args, ctx=None):
    client = getattr(ctx, "S3_CLIENT", None) if ctx is not None else None
    bucket = getattr(ctx, "S3_DATA", None) if ctx is not None else None
    if client is None or not bucket:
        return error("S3 storage is not configured for this application", "NOT_CONFIGURED")

    total_files = 0
    total_size = 0
    folders = set()
    recent = []
    by_type = {
        "image": 0,
        "pdf": 0,
        "document": 0,
        "spreadsheet": 0,
        "text": 0,
        "code": 0,
        "archive": 0,
        "audio": 0,
        "video": 0,
        "other": 0,
    }
    scanned = 0
    truncated = False

    try:
        paginator = client.get_paginator("list_objects_v2")
        pages = paginator.paginate(
            Bucket=bucket,
            Prefix=STUDIO_NS,
            PaginationConfig={"MaxItems": SCAN_CAP, "PageSize": 1000},
        )
        for page in pages:
            for item in page.get("Contents") or []:
                scanned += 1
                if scanned > SCAN_CAP:
                    truncated = True
                    break
                key = item.get("Key", "")
                rel = key[len(STUDIO_NS):]
                if key.endswith("/"):
                    # Folder marker object: registers the folder itself.
                    folders.add(rel)
                    continue
                total_files += 1
                size = int(item.get("Size", 0) or 0)
                total_size += size
                # Register every ancestor prefix as a folder.
                parts = rel.split("/")[:-1]
                accumulated = ""
                for part in parts:
                    accumulated += part + "/"
                    folders.add(accumulated)
                by_type[category_of(rel)] = by_type.get(category_of(rel), 0) + 1
                recent.append(
                    {
                        "name": rel.rsplit("/", 1)[-1],
                        "path": rel,
                        "size": size,
                        "lastModified": iso(item.get("LastModified")),
                        "sortKey": item.get("LastModified"),
                    }
                )
            if truncated:
                break
    except Exception as exc:  # noqa: BLE001
        return error("Failed to compute storage statistics: %s" % (exc,), "STORAGE_ERROR")

    recent.sort(key=lambda r: (r["sortKey"] is not None, r["sortKey"]), reverse=True)
    recent_files = [
        {
            "name": r["name"],
            "path": r["path"],
            "size": r["size"],
            "lastModified": r["lastModified"],
        }
        for r in recent[:10]
        if r["sortKey"] is not None
    ]

    return {
        "ok": True,
        "stats": {
            "files": total_files,
            "folders": len(folders),
            "size": total_size,
            "scanned": scanned,
            "truncated": truncated,
            "byType": by_type,
            "recent": recent_files,
        },
    }