"""S3 Object Studio — upload an object into a folder.

Accepts a base64-encoded file body plus a destination folder and filename,
and stores it with PutObject inside the dedicated application namespace.
Overwriting an existing object requires an explicit overwrite flag.
"""

import base64
import json

from botocore.exceptions import ClientError

STUDIO_NS = "s3-studio/"
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # bounded to respect action payload limits

CONTENT_TYPES = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "svg": "image/svg+xml",
    "bmp": "image/bmp",
    "ico": "image/x-icon",
    "txt": "text/plain",
    "md": "text/markdown",
    "markdown": "text/markdown",
    "csv": "text/csv",
    "json": "application/json",
    "xml": "application/xml",
    "yaml": "application/yaml",
    "yml": "application/yaml",
    "html": "text/html",
    "htm": "text/html",
    "css": "text/css",
    "js": "text/javascript",
    "mjs": "text/javascript",
    "ts": "text/plain",
    "pdf": "application/pdf",
    "zip": "application/zip",
    "gz": "application/gzip",
    "tar": "application/x-tar",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "mp4": "video/mp4",
    "mov": "video/quicktime",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "ppt": "application/vnd.ms-powerpoint",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


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


def folder_path(path):
    parts = segments(path)
    return "/".join(parts) + "/" if parts else ""


def name_segment(name):
    raw = "" if name is None else str(name).strip()
    parts = segments(raw)
    if len(parts) != 1:
        raise ValueError("file name must be a single path segment")
    return parts[0]


def guess_content_type(name, provided=None):
    if provided:
        provided = str(provided).strip()
        if provided:
            return provided
    lower = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return CONTENT_TYPES.get(lower, "application/octet-stream")


def object_exists(client, bucket, key):
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        try:
            code = exc.response.get("Error", {}).get("Code", "")
        except Exception:  # noqa: BLE001
            code = ""
        if code in ("404", "NoSuchKey", "NotFound", "ResourceNotFound"):
            return False
        raise


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
        folder = folder_path(data.get("path") if data.get("path") is not None else data.get("folder"))
        name = name_segment(data.get("name") or data.get("filename"))
    except ValueError as exc:
        return error(str(exc), "INVALID_NAME")

    b64 = data.get("data") or ""
    if not isinstance(b64, str) or not b64:
        return error("File data is required", "NO_DATA")

    try:
        payload = base64.b64decode(b64, validate=True)
    except Exception:  # noqa: BLE001
        return error("File data encoding is invalid", "INVALID_DATA")

    if len(payload) > MAX_UPLOAD_BYTES:
        return error(
            "File exceeds the %d MB direct upload limit" % (MAX_UPLOAD_BYTES // (1024 * 1024),),
            "TOO_LARGE",
        )

    overwrite = truthy(data.get("overwrite"))
    content_type = guess_content_type(name, data.get("contentType"))
    key = STUDIO_NS + folder + name

    try:
        if not overwrite and object_exists(client, bucket, key):
            return {
                "ok": False,
                "error": "An object named '%s' already exists in this folder" % name,
                "code": "EXISTS",
            }

        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=payload,
            ContentType=content_type,
        )
        head = client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        return error("Upload failed: %s" % (exc,), "STORAGE_ERROR")
    except Exception as exc:  # noqa: BLE001
        return error("Upload failed: %s" % (exc,), "STORAGE_ERROR")

    return {
        "ok": True,
        "object": {
            "type": "file",
            "name": name,
            "path": (folder + name),
            "key": key,
            "size": int(head.get("ContentLength", len(payload)) or len(payload)),
            "contentType": head.get("ContentType") or content_type,
            "lastModified": iso(head.get("LastModified")),
            "etag": (head.get("ETag") or "").strip('"'),
        },
    }