"""S3 Object Studio — object and folder metadata.

For files: HeadObject (size, content type, last modified, ETag).
For folders: aggregates object count and total size under the prefix.
"""

import json

from botocore.exceptions import ClientError

STUDIO_NS = "s3-studio/"
FOLDER_SCAN_CAP = 1000


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


def truthy(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in ("1", "true", "yes", "on")


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


def file_path(path):
    parts = segments(path)
    if not parts:
        raise ValueError("file path is required")
    return "/".join(parts)


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
        raw = data.get("path")
        raw = "" if raw is None else str(raw)
        is_folder = raw.endswith("/") or truthy(data.get("folder"))
    except ValueError as exc:
        return error(str(exc), "INVALID_PATH")

    try:
        if is_folder:
            path = folder_path(raw)
            if not path:
                return error("Folder path is required", "INVALID_PATH")
            prefix = STUDIO_NS + path
            marker_key = prefix

            count = 0
            total_size = 0
            scanned = 0
            truncated = False
            marker_exists = False

            paginator = client.get_paginator("list_objects_v2")
            for page in paginator.paginate(
                Bucket=bucket, Prefix=prefix, PaginationConfig={"PageSize": 1000}
            ):
                for item in page.get("Contents") or []:
                    scanned += 1
                    if scanned > FOLDER_SCAN_CAP:
                        truncated = True
                        break
                    key = item.get("Key", "")
                    if key == marker_key:
                        marker_exists = True
                        continue
                    if key.endswith("/"):
                        continue
                    count += 1
                    total_size += int(item.get("Size", 0) or 0)
                if truncated:
                    break

            if not marker_exists and count == 0:
                return error("Folder not found", "NOT_FOUND")

            return {
                "ok": True,
                "meta": {
                    "type": "folder",
                    "name": path.rstrip("/").split("/")[-1],
                    "path": path,
                    "key": prefix,
                    "objectCount": count,
                    "size": total_size,
                    "hasMarker": marker_exists,
                    "truncated": truncated,
                },
            }

        path = file_path(raw)
        key = STUDIO_NS + path
        head = client.head_object(Bucket=bucket, Key=key)
    except ValueError as exc:
        return error(str(exc), "INVALID_PATH")
    except ClientError as exc:
        try:
            code = exc.response.get("Error", {}).get("Code", "")
        except Exception:  # noqa: BLE001
            code = ""
        if code in ("404", "NoSuchKey", "NotFound", "ResourceNotFound"):
            return error("Object not found", "NOT_FOUND")
        return error("Failed to read metadata: %s" % (exc,), "STORAGE_ERROR")

    return {
        "ok": True,
        "meta": {
            "type": "file",
            "name": path.rsplit("/", 1)[-1],
            "path": path,
            "key": key,
            "size": int(head.get("ContentLength", 0) or 0),
            "contentType": head.get("ContentType") or "application/octet-stream",
            "lastModified": iso(head.get("LastModified")),
            "etag": (head.get("ETag") or "").strip('"'),
        },
    }