import json

WORKSPACE_PREFIX = "s3-object-studio/"
MAX_LISTED_KEYS = 10000

TYPE_CATEGORIES = {
    "image": {"png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tif", "tiff", "heic"},
    "pdf": {"pdf"},
    "document": {"txt", "md", "doc", "docx", "rtf", "odt", "pages"},
    "spreadsheet": {"csv", "xls", "xlsx", "tsv", "ods", "numbers"},
    "presentation": {"ppt", "pptx", "odp", "key"},
    "archive": {"zip", "tar", "gz", "rar", "7z", "bz2", "xz"},
    "audio": {"mp3", "wav", "ogg", "flac", "m4a", "aac"},
    "video": {"mp4", "mov", "avi", "mkv", "webm", "m4v"},
    "code": {"json", "js", "ts", "tsx", "jsx", "py", "html", "css", "xml", "yaml", "yml", "sh", "sql", "java", "c", "cpp", "go", "rs", "rb", "php"},
}

RESERVED_KEYS = {
    "body",
    "REDIS_URL",
    "REDIS_PREFIX",
    "S3_HOST",
    "S3_PORT",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "S3_BUCKET_DATA",
    "S3_BUCKET_STATIC",
    "S3_PUBLIC",
}


def request_data(args):
    data = dict(args) if isinstance(args, dict) else {}
    body = data.get("body")
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except Exception:
            body = None
    if not isinstance(body, dict):
        raw = data.get("__ow_body")
        if isinstance(raw, str) and raw.strip():
            try:
                body = json.loads(raw)
            except Exception:
                body = None
    merged = dict(body) if isinstance(body, dict) else {}
    merged.update(
        {k: v for k, v in data.items() if k not in RESERVED_KEYS and not str(k).startswith("__ow")}
    )
    return merged


def list_all_keys(s3, bucket):
    keys = []
    token = None
    while True:
        kwargs = {"Bucket": bucket, "Prefix": WORKSPACE_PREFIX, "MaxKeys": 1000}
        if token:
            kwargs["ContinuationToken"] = token
        resp = s3.list_objects_v2(**kwargs)
        keys.extend(resp.get("Contents") or [])
        if not resp.get("IsTruncated") or len(keys) >= MAX_LISTED_KEYS:
            break
        token = resp.get("NextContinuationToken")
    return keys


def build_tree(keys):
    folders = {}
    files = []

    def ensure_folder(path):
        entry = folders.get(path)
        if entry is None:
            entry = {
                "name": path.split("/")[-1],
                "path": path,
                "size": 0,
                "fileCount": 0,
                "lastModified": None,
                "explicit": False,
            }
            folders[path] = entry
        return entry

    for obj in keys or []:
        key = obj.get("Key", "")
        if not key.startswith(WORKSPACE_PREFIX):
            continue
        rel = key[len(WORKSPACE_PREFIX):]
        if not rel:
            continue
        if rel.startswith(".uploads/"):
            # Hidden server-side staging area for chunked uploads.
            continue
        modified = obj.get("LastModified")
        if modified is not None and hasattr(modified, "isoformat"):
            modified = modified.isoformat()
        size = int(obj.get("Size", 0) or 0)
        if rel.endswith("/"):
            folder_path = rel.rstrip("/")
            if folder_path:
                entry = ensure_folder(folder_path)
                entry["explicit"] = True
                if entry["lastModified"] is None or (modified and modified > entry["lastModified"]):
                    entry["lastModified"] = modified
            continue
        segments = rel.split("/")
        files.append({
            "name": segments[-1],
            "path": "/".join(segments),
            "size": size,
            "lastModified": modified,
            "etag": (obj.get("ETag") or "").strip('"'),
        })
        acc = ""
        for seg in segments[:-1]:
            acc = f"{acc}/{seg}" if acc else seg
            entry = ensure_folder(acc)
            entry["size"] += size
            entry["fileCount"] += 1
            if entry["lastModified"] is None or (modified and modified > entry["lastModified"]):
                entry["lastModified"] = modified
    return folders, files


def category_for(name):
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    for category, extensions in TYPE_CATEGORIES.items():
        if ext in extensions:
            return category
    return "other"


def main(args, ctx=None):
    """Compute real storage statistics from objects inside the workspace prefix."""
    if not ctx or not hasattr(ctx, "S3_CLIENT"):
        return {"ok": False, "error": "Object storage not configured"}

    s3 = ctx.S3_CLIENT
    bucket = ctx.S3_DATA
    keys = list_all_keys(s3, bucket)
    folders, files = build_tree(keys)

    totals = {
        "files": len(files),
        "folders": len(folders),
        "bytes": sum(f["size"] for f in files),
    }

    by_type = {}
    for f in files:
        category = category_for(f["name"])
        entry = by_type.setdefault(category, {"type": category, "count": 0, "bytes": 0})
        entry["count"] += 1
        entry["bytes"] += f["size"]

    by_type_list = sorted(by_type.values(), key=lambda e: (-e["count"], -e["bytes"]))
    recent = sorted(files, key=lambda f: f["lastModified"] or "", reverse=True)[:8]

    return {
        "ok": True,
        "totals": totals,
        "byType": by_type_list,
        "recent": recent,
    }
