"""S3 Object Studio — download an object.

Returns the object body as base64 for bounded sizes. For larger objects it
attempts a short-lived, scoped presigned URL so the browser can fetch the
bytes directly from storage when reachable.
"""

import base64
import json

from botocore.exceptions import ClientError

STUDIO_NS = "s3-studio/"
MAX_INLINE_BYTES = 8 * 1024 * 1024
PRESIGN_EXPIRES = 900  # 15 minutes


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


def main(args, ctx=None):
    client = getattr(ctx, "S3_CLIENT", None) if ctx is not None else None
    bucket = getattr(ctx, "S3_DATA", None) if ctx is not None else None
    if client is None or not bucket:
        return error("S3 storage is not configured for this application", "NOT_CONFIGURED")

    try:
        data = request_data(args)
        path = file_path(data.get("path") if data.get("path") is not None else data.get("key"))
    except ValueError as exc:
        return error(str(exc), "INVALID_PATH")

    key = STUDIO_NS + path
    name = path.rsplit("/", 1)[-1]

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

    if size > MAX_INLINE_BYTES:
        # Large object: hand back a short-lived presigned URL when possible.
        try:
            url = client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=PRESIGN_EXPIRES,
            )
            return {
                "ok": True,
                "mode": "url",
                "url": url,
                "name": name,
                "size": size,
                "contentType": content_type,
                "expiresIn": PRESIGN_EXPIRES,
            }
        except Exception:  # noqa: BLE001
            return error(
                "File is too large to download through this API endpoint",
                "TOO_LARGE",
            )

    try:
        body = client.get_object(Bucket=bucket, Key=key)["Body"].read()
    except ClientError as exc:
        try:
            code = exc.response.get("Error", {}).get("Code", "")
        except Exception:  # noqa: BLE001
            code = ""
        if code in ("404", "NoSuchKey", "NotFound", "ResourceNotFound"):
            return error("Object not found", "NOT_FOUND")
        return error("Failed to read object: %s" % (exc,), "STORAGE_ERROR")

    return {
        "ok": True,
        "mode": "base64",
        "data": base64.b64encode(body).decode("ascii"),
        "name": name,
        "size": size,
        "contentType": content_type,
    }