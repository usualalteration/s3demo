"""S3 Object Studio — object preview.

Returns previewable content for a single object with strict size limits so
large files are never downloaded just to render a preview:
  - text files (<= 256 KB) as decoded text
  - images (<= 3 MB) as base64 data
  - PDFs (<= 8 MB) as base64 data for an embedded viewer
  - anything else (or oversized files) as metadata only
"""

import base64
import json

from botocore.exceptions import ClientError

STUDIO_NS = "s3-studio/"

TEXT_EXTS = {
    "txt", "md", "markdown", "log", "csv", "json", "xml", "yaml", "yml",
    "ini", "toml", "html", "htm", "css", "js", "mjs", "ts", "tsx", "jsx",
    "py", "rb", "go", "rs", "java", "c", "cpp", "h", "sh", "sql", "conf",
}
IMAGE_EXTS = {"png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"}
PDF_CONTENT_TYPES = {"application/pdf"}

MAX_TEXT_BYTES = 256 * 1024
MAX_IMAGE_BYTES = 3 * 1024 * 1024
MAX_PDF_BYTES = 8 * 1024 * 1024


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


def file_path(path):
    parts = segments(path)
    if not parts:
        raise ValueError("file path is required")
    return "/".join(parts)


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
        path = file_path(data.get("path"))
    except ValueError as exc:
        return error(str(exc), "INVALID_PATH")

    key = STUDIO_NS + path
    name = path.rsplit("/", 1)[-1]
    lower_name = name.lower()
    ext = lower_name.rsplit(".", 1)[-1] if "." in lower_name else ""

    try:
        head = client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        try:
            code = exc.response.get("Error", {}).get("Code", "")
        except Exception:  # noqa: BLE001
            code = ""
        if code in ("404", "NoSuchKey", "NotFound", "ResourceNotFound"):
            return error("Object not found", "NOT_FOUND")
        return error("Failed to read object: %s" % (exc,), "STORAGE_ERROR")

    size = int(head.get("ContentLength", 0) or 0)
    content_type = head.get("ContentType") or "application/octet-stream"
    meta = {
        "type": "file",
        "name": name,
        "path": path,
        "key": key,
        "size": size,
        "contentType": content_type,
        "lastModified": iso(head.get("LastModified")),
        "etag": (head.get("ETag") or "").strip('"'),
    }

    is_text = ext in TEXT_EXTS or content_type.startswith("text/")
    is_image = ext in IMAGE_EXTS or (content_type.startswith("image/"))
    is_pdf = ext == "pdf" or content_type in PDF_CONTENT_TYPES

    def get_body():
        return client.get_object(Bucket=bucket, Key=key)["Body"].read()

    try:
        if is_text:
            if size > MAX_TEXT_BYTES:
                return {"ok": True, "kind": "too_large", "meta": meta}
            body = get_body()
            text = body.decode("utf-8", errors="replace")
            truncated = len(body) >= MAX_TEXT_BYTES
            return {
                "ok": True,
                "kind": "text",
                "text": text,
                "truncated": truncated,
                "meta": meta,
            }

        if is_image:
            if size > MAX_IMAGE_BYTES:
                return {"ok": True, "kind": "too_large", "meta": meta}
            body = get_body()
            return {
                "ok": True,
                "kind": "image",
                "data": base64.b64encode(body).decode("ascii"),
                "contentType": content_type if content_type.startswith("image/") else "image/png",
                "meta": meta,
            }

        if is_pdf:
            if size > MAX_PDF_BYTES:
                return {"ok": True, "kind": "too_large", "meta": meta}
            body = get_body()
            return {
                "ok": True,
                "kind": "pdf",
                "data": base64.b64encode(body).decode("ascii"),
                "contentType": "application/pdf",
                "meta": meta,
            }
    except ClientError as exc:
        return error("Failed to read object: %s" % (exc,), "STORAGE_ERROR")
    except Exception as exc:  # noqa: BLE001
        return error("Failed to read object: %s" % (exc,), "STORAGE_ERROR")

    return {"ok": True, "kind": "generic", "meta": meta}