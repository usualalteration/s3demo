import json

WORKSPACE_PREFIX = "s3-object-studio/"
MAX_LISTED_KEYS = 10000

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
    """Merge JSON body fields and query fields into a single dict (top-level wins)."""
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


def clean_segments(path):
    """Validate a workspace-relative path and return its clean segments."""
    raw = str(path or "").replace("\\", "/")
    parts = []
    for piece in raw.split("/"):
        piece = piece.strip()
        if piece in ("", "."):
            continue
        if piece == "..":
            raise ValueError("Path cannot contain '..' segments")
        if piece.startswith("__ow"):
            raise ValueError("Invalid path segment")
        if any(ord(ch) < 32 for ch in piece):
            raise ValueError("Invalid characters in path")
        if len(piece.encode("utf-8")) > 255:
            raise ValueError("Path segment too long (max 255 bytes)")
        parts.append(piece)
    return parts


def parent_of(path):
    segments = [s for s in str(path or "").split("/") if s]
    if len(segments) <= 1:
        return ""
    return "/".join(segments[:-1])


def list_all_keys(s3, bucket):
    """List every object under the workspace prefix with bounded pagination."""
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
    """Derive the virtual folder tree and file entries from flat S3 keys."""
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


def main(args, ctx=None):
    """List the direct children of a folder, or search the whole workspace."""
    if not ctx or not hasattr(ctx, "S3_CLIENT"):
        return {"ok": False, "error": "Object storage not configured"}

    data = request_data(args)
    try:
        folder_segments = clean_segments(data.get("folder", ""))
    except ValueError as exc:
        return {"ok": False, "error": str(exc), "code": "invalid_path"}
    folder_path = "/".join(folder_segments)
    search = str(data.get("search", "") or "").strip().lower()

    s3 = ctx.S3_CLIENT
    bucket = ctx.S3_DATA
    keys = list_all_keys(s3, bucket)
    folders, files = build_tree(keys)

    totals = {
        "objects": len(files),
        "folders": len(folders),
        "bytes": sum(f["size"] for f in files),
    }

    if search:
        matched_files = sorted(
            (f for f in files if search in f["name"].lower()),
            key=lambda item: item["path"].lower(),
        )
        matched_folders = sorted(
            (f for f in folders.values() if search in f["name"].lower()),
            key=lambda item: item["path"].lower(),
        )
        return {
            "ok": True,
            "folder": folder_path,
            "search": search,
            "folders": matched_folders,
            "files": matched_files,
            "totals": totals,
        }

    child_folders = sorted(
        (f for f in folders.values() if parent_of(f["path"]) == folder_path),
        key=lambda item: item["name"].lower(),
    )
    child_files = sorted(
        (f for f in files if parent_of(f["path"]) == folder_path),
        key=lambda item: item["name"].lower(),
    )
    return {
        "ok": True,
        "folder": folder_path,
        "folders": child_folders,
        "files": child_files,
        "totals": totals,
    }
