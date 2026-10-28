"""S3 Object Studio — list folders and objects under a prefix.

Uses ListObjectsV2 with a "/" delimiter so virtual folders (common
prefixes) and objects are returned separately. Supports continuation-token
pagination so large folders can be paged.
"""

import json

STUDIO_NS = "s3-studio/"


def request_data(args):
    data = dict(args) if isinstance(args, dict) else {}
    body = data.get("body")
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except Exception:  # noqa: BLE001
            body = {}
    merged = dict(body) if isinstance(body, dict) else {}
    ignored = {"body", "__ow_method", "__ow_headers", "__ow_path"}
    merged.update({k: v for k, v in data.items() if k not in ignored})
    return merged


def error(message, code):
    return {"ok": False, "error": message, "code": code}


def segments(path):
    raw = "" if path is None else str(path)
    parts = [p for p in raw.split("/") if p not in ("", ".")]
    for part in parts:
        if part == "..":
            raise ValueError("path traversal is not allowed")
        if part != part.strip() or any(c in part for c in "\x00\r\n\t\\"):
            raise ValueError("invalid characters in path")
        if len(part.encode("utf-8")) > 255:
            raise ValueError("path segment is too long")
    if len((STUDIO_NS + "/".join(parts)).encode("utf-8")) > 1000:
        raise ValueError("path is too long")
    return parts


def folder_path(path):
    parts = segments(path)
    return "/".join(parts) + "/" if parts else ""


def iso(value):
    if value is None:
        return None
    try:
        return value.isoformat()
    except Exception:  # noqa: BLE001
        return str(value)


def main(args, ctx=None):
    client = getattr(ctx, "S3_CLIENT", None) if ctx is not None else None
    bucket = getattr(ctx, "S3_DATA", None) if ctx is not None else None
    if client is None or not bucket:
        return error("S3 storage is not configured for this application", "NOT_CONFIGURED")

    try:
        data = request_data(args)
        path = folder_path(data.get("path") if data.get("path") is not None else data.get("prefix"))
    except ValueError as exc:
        return error(str(exc), "INVALID_PATH")

    token = str(data.get("token") or data.get("continuationToken") or "").strip()
    try:
        max_keys = int(data.get("maxKeys") or 200)
    except (TypeError, ValueError):
        max_keys = 200
    max_keys = max(1, min(1000, max_keys))

    prefix = STUDIO_NS + path
    kwargs = {
        "Bucket": bucket,
        "Prefix": prefix,
        "Delimiter": "/",
        "MaxKeys": max_keys,
    }
    if token:
        kwargs["ContinuationToken"] = token

    try:
        resp = client.list_objects_v2(**kwargs)
    except Exception as exc:  # noqa: BLE001
        return error("Failed to list storage: %s" % (exc,), "STORAGE_ERROR")

    folders = []
    for common in resp.get("CommonPrefixes") or []:
        full = common.get("Prefix", "")
        rel = full[len(STUDIO_NS):]
        if not rel:
            continue
        folders.append(
            {
                "type": "folder",
                "name": rel.rstrip("/").split("/")[-1],
                "path": rel,
                "key": full,
            }
        )

    objects = []
    for item in resp.get("Contents") or []:
        key = item.get("Key", "")
        if key == prefix or key.endswith("/"):
            # Skip the folder marker of the folder being listed (and any
            # nested marker that escapes delimiter grouping).
            continue
        rel = key[len(STUDIO_NS):]
        objects.append(
            {
                "type": "file",
                "name": rel.rsplit("/", 1)[-1],
                "path": rel,
                "key": key,
                "size": int(item.get("Size", 0) or 0),
                "lastModified": iso(item.get("LastModified")),
                "etag": (item.get("ETag") or "").strip('"'),
            }
        )

    truncated = bool(resp.get("IsTruncated"))
    next_token = resp.get("NextContinuationToken") if truncated else None

    return {
        "ok": True,
        "path": path,
        "folders": folders,
        "objects": objects,
        "truncated": truncated,
        "token": next_token,
    }