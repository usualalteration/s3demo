import base64
import json

WORKSPACE_PREFIX = "s3-object-studio/"
MAX_DOWNLOAD_BYTES = 700 * 1024   # inline Base64 download ceiling (response limit is 1 MiB)
MAX_CHUNK_BYTES = 512 * 1024      # per-request ranged chunk size

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


def clean_segments(path):
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


def main(args, ctx=None):
    """Return the real binary content of an object as Base64 plus its metadata."""
    if not ctx or not hasattr(ctx, "S3_CLIENT"):
        return {"ok": False, "error": "Object storage not configured"}

    data = request_data(args)
    key = str(data.get("key", "") or "")
    try:
        segments = clean_segments(key)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), "code": "invalid_key"}
    if not segments:
        return {"ok": False, "error": "Object key is required", "code": "invalid_key"}

    rel_key = "/".join(segments)
    full_key = WORKSPACE_PREFIX + rel_key

    s3 = ctx.S3_CLIENT
    bucket = ctx.S3_DATA
    try:
        head = s3.head_object(Bucket=bucket, Key=full_key)
    except Exception:
        return {"ok": False, "error": "Object not found", "code": "not_found", "key": rel_key}

    size = int(head.get("ContentLength", 0) or 0)
    modified = head.get("LastModified")
    if modified is not None and hasattr(modified, "isoformat"):
        modified = modified.isoformat()

    # Ranged chunk mode: the frontend streams large files in bounded chunks.
    offset = data.get("offset")
    length = data.get("length")
    if offset is not None or length is not None:
        try:
            offset = int(offset or 0)
            length = int(length or 0)
        except Exception:
            return {"ok": False, "error": "Invalid range parameters", "code": "invalid_range"}
        if offset < 0 or length <= 0:
            return {"ok": False, "error": "Invalid range parameters", "code": "invalid_range"}
        if length > MAX_CHUNK_BYTES:
            return {
                "ok": False,
                "error": f"Requested chunk exceeds the maximum of {MAX_CHUNK_BYTES // 1024} KB",
                "code": "chunk_too_large",
            }
        if offset >= size:
            return {"ok": False, "error": "Offset beyond end of object", "code": "invalid_range"}
        try:
            resp = s3.get_object(
                Bucket=bucket,
                Key=full_key,
                Range=f"bytes={offset}-{offset + length - 1}",
            )
            content = resp["Body"].read()
        except Exception as exc:
            return {"ok": False, "error": f"Storage read failed: {exc}", "code": "storage_error"}
        return {
            "ok": True,
            "key": rel_key,
            "name": segments[-1],
            "size": size,
            "offset": offset,
            "chunkSize": len(content),
            "eof": offset + len(content) >= size,
            "contentType": head.get("ContentType") or "application/octet-stream",
            "chunkBase64": base64.b64encode(content).decode("ascii"),
        }

    if size > MAX_DOWNLOAD_BYTES:
        return {
            "ok": False,
            "error": "File is too large for a single response. Use chunked mode with offset/length.",
            "code": "too_large",
            "size": size,
            "maxBytes": MAX_DOWNLOAD_BYTES,
            "chunkBytes": MAX_CHUNK_BYTES,
        }

    try:
        resp = s3.get_object(Bucket=bucket, Key=full_key)
        content = resp["Body"].read()
    except Exception as exc:
        return {"ok": False, "error": f"Storage read failed: {exc}", "code": "storage_error"}

    return {
        "ok": True,
        "key": rel_key,
        "name": segments[-1],
        "contentType": head.get("ContentType") or "application/octet-stream",
        "size": size,
        "etag": (head.get("ETag") or "").strip('"'),
        "lastModified": modified,
        "metadata": head.get("Metadata") or {},
        "contentBase64": base64.b64encode(content).decode("ascii"),
    }
