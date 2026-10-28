"""S3 Object Studio — create a virtual folder.

S3 has no real directories: folders are represented by object key prefixes.
To keep an empty folder visible after a page refresh, this action stores a
zero-byte "folder marker" object whose key is the prefix plus a trailing
slash (for example s3-studio/documents/).
"""

import json

STUDIO_NS = "s3-studio/"

from botocore.exceptions import ClientError


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
            raise ValueError("invalid characters in folder name")
        if len(part.encode("utf-8")) > 255:
            raise ValueError("path segment is too long")
    if len((STUDIO_NS + "/".join(parts)).encode("utf-8")) > 1000:
        raise ValueError("path is too long")
    return parts


def folder_path(path):
    parts = segments(path)
    return "/".join(parts) + "/" if parts else ""


def object_exists(client, bucket, key):
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        code = ""
        try:
            code = exc.response.get("Error", {}).get("Code", "")
        except Exception:  # noqa: BLE001
            code = ""
        if code in ("404", "NoSuchKey", "NotFound", "ResourceNotFound"):
            return False
        raise


def main(args, ctx=None):
    client = getattr(ctx, "S3_CLIENT", None) if ctx is not None else None
    bucket = getattr(ctx, "S3_DATA", None) if ctx is not None else None
    if client is None or not bucket:
        return error("S3 storage is not configured for this application", "NOT_CONFIGURED")

    try:
        data = request_data(args)
        path = folder_path(data.get("path") or data.get("name"))
    except ValueError as exc:
        return error(str(exc), "INVALID_NAME")

    if not path:
        return error("Folder name is required", "INVALID_NAME")

    marker_key = STUDIO_NS + path
    file_conflict_key = marker_key.rstrip("/")

    try:
        if object_exists(client, bucket, marker_key):
            return error("A folder with this name already exists here", "EXISTS")
        if object_exists(client, bucket, file_conflict_key):
            return error("A file with this name already exists here", "EXISTS")

        client.put_object(
            Bucket=bucket,
            Key=marker_key,
            Body=b"",
            ContentType="application/x-directory",
        )
    except ClientError as exc:
        return error("Failed to create folder: %s" % (exc,), "STORAGE_ERROR")
    except Exception as exc:  # noqa: BLE001
        return error("Failed to create folder: %s" % (exc,), "STORAGE_ERROR")

    name = path.rstrip("/").split("/")[-1]
    return {
        "ok": True,
        "folder": {
            "type": "folder",
            "name": name,
            "path": path,
            "key": marker_key,
        },
    }