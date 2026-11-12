import json

WORKSPACE_PREFIX = "s3-object-studio/"

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


def object_exists(s3, bucket, key):
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except Exception:
        return False


def main(args, ctx=None):
    """Create one folder (possibly nested) using persistent zero-byte marker objects."""
    if not ctx or not hasattr(ctx, "S3_CLIENT"):
        return {"ok": False, "error": "Object storage not configured"}

    data = request_data(args)
    path = str(data.get("path", "") or "")
    parent = str(data.get("parent", "") or "")
    name = str(data.get("name", "") or "")
    if not path:
        path = "/".join(p for p in (parent, name) if p)

    try:
        segments = clean_segments(path)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), "code": "invalid_path"}
    if not segments:
        return {"ok": False, "error": "Folder name is required", "code": "invalid_name"}

    s3 = ctx.S3_CLIENT
    bucket = ctx.S3_DATA

    # Reject conflicts where a file already occupies any level of the path.
    acc = ""
    for seg in segments:
        acc = f"{acc}/{seg}" if acc else seg
        if object_exists(s3, bucket, WORKSPACE_PREFIX + acc):
            return {
                "ok": False,
                "error": f"An object named '{seg}' already exists at this location",
                "code": "duplicate",
            }

    created = []
    acc = ""
    for seg in segments:
        acc = f"{acc}/{seg}" if acc else seg
        marker = WORKSPACE_PREFIX + acc + "/"
        if not object_exists(s3, bucket, marker):
            s3.put_object(
                Bucket=bucket,
                Key=marker,
                Body=b"",
                ContentType="application/x-directory",
            )
            created.append(acc)

    return {"ok": True, "path": "/".join(segments), "created": created}
