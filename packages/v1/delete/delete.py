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


def is_truthy(value):
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def object_exists(s3, bucket, key):
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except Exception:
        return False


def has_children(s3, bucket, prefix):
    try:
        resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=1)
        return bool(resp.get("Contents"))
    except Exception:
        return False


def list_prefix_keys(s3, bucket, prefix):
    keys = []
    token = None
    while True:
        kwargs = {"Bucket": bucket, "Prefix": prefix, "MaxKeys": 1000}
        if token:
            kwargs["ContinuationToken"] = token
        resp = s3.list_objects_v2(**kwargs)
        keys.extend(obj["Key"] for obj in resp.get("Contents") or [])
        if not resp.get("IsTruncated") or len(keys) >= MAX_LISTED_KEYS:
            break
        token = resp.get("NextContinuationToken")
    return keys


def main(args, ctx=None):
    """Delete a single object or a whole folder subtree inside the workspace."""
    if not ctx or not hasattr(ctx, "S3_CLIENT"):
        return {"ok": False, "error": "Object storage not configured"}

    data = request_data(args)
    key = str(data.get("key", "") or "")
    item_type = str(data.get("type", "") or "").lower()
    confirm = is_truthy(data.get("confirm"))

    if not confirm:
        return {"ok": False, "error": "Confirmation is required to delete", "code": "confirm_required"}

    try:
        segments = clean_segments(key)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), "code": "invalid_key"}
    if not segments:
        return {"ok": False, "error": "Object key is required", "code": "invalid_key"}

    s3 = ctx.S3_CLIENT
    bucket = ctx.S3_DATA
    rel_key = "/".join(segments)
    full_key = WORKSPACE_PREFIX + rel_key

    file_exists = object_exists(s3, bucket, full_key)
    marker_exists = object_exists(s3, bucket, full_key + "/")
    children_exist = has_children(s3, bucket, full_key + "/")

    if item_type == "folder" or (not file_exists and (marker_exists or children_exist)):
        # Folder deletion: remove every object under the prefix plus the marker.
        prefix = full_key + "/"
        child_keys = list_prefix_keys(s3, bucket, prefix)
        if marker_exists and prefix not in child_keys:
            child_keys.append(prefix)
        if not child_keys:
            return {"ok": False, "error": "Folder not found", "code": "not_found", "key": rel_key}
        try:
            # Children are deleted before folder markers because the backend
            # rejects deleting a non-empty trailing-slash directory marker.
            for ck in sorted(child_keys, reverse=True):
                s3.delete_object(Bucket=bucket, Key=ck)
        except Exception as exc:
            return {"ok": False, "error": f"Delete failed: {exc}", "code": "delete_failed", "key": rel_key}
        remaining = has_children(s3, bucket, prefix) or object_exists(s3, bucket, prefix)
        if remaining:
            return {
                "ok": False,
                "error": "Some objects could not be deleted",
                "code": "delete_failed",
            }
        return {"ok": True, "deleted": len(child_keys), "type": "folder", "key": rel_key}

    if not file_exists:
        return {"ok": False, "error": "Object not found", "code": "not_found", "key": rel_key}

    s3.delete_object(Bucket=bucket, Key=full_key)
    if object_exists(s3, bucket, full_key):
        return {"ok": False, "error": "Object could not be deleted", "code": "delete_failed"}
    return {"ok": True, "deleted": 1, "type": "file", "key": rel_key}
