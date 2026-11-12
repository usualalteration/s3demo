import base64
import json
import re
import tempfile
from uuid import uuid4

WORKSPACE_PREFIX = "s3-object-studio/"
TEMP_UPLOAD_PREFIX = WORKSPACE_PREFIX + ".uploads/"
MAX_UPLOAD_BYTES = 700 * 1024        # single-request Base64 upload ceiling (request limit is 1 MiB)
MAX_PART_BYTES = 600 * 1024          # per-chunk binary ceiling for chunked uploads
MAX_TOTAL_UPLOAD_BYTES = 64 * 1024 * 1024
UPLOAD_ID_RE = re.compile(r"^[a-f0-9]{32}$")

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


def list_prefix_keys(s3, bucket, prefix):
    keys = []
    token = None
    while True:
        kwargs = {"Bucket": bucket, "Prefix": prefix, "MaxKeys": 1000}
        if token:
            kwargs["ContinuationToken"] = token
        resp = s3.list_objects_v2(**kwargs)
        keys.extend(obj["Key"] for obj in resp.get("Contents") or [])
        if not resp.get("IsTruncated") or len(keys) >= 10000:
            break
        token = resp.get("NextContinuationToken")
    return keys


def target_key(data):
    """Validate filename/folder and return (rel_key, full_key, filename, folder)."""
    filename = str(data.get("filename", "") or "").strip()
    folder = str(data.get("folder", "") or "")
    if not filename:
        raise ValueError("Filename is required")
    folder_segments = clean_segments(folder)
    name_segments = clean_segments(filename)
    if len(name_segments) != 1:
        raise ValueError("Filename cannot contain path separators")
    rel_key = "/".join(folder_segments + name_segments)
    return rel_key, WORKSPACE_PREFIX + rel_key, filename, "/".join(folder_segments)


def chunk_init(s3, bucket, data):
    """Start a chunked upload: reserve an id and validate the destination."""
    try:
        rel_key, full_key, filename, folder = target_key(data)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), "code": "invalid_name"}
    try:
        total_size = int(data.get("totalSize", 0) or 0)
    except Exception:
        total_size = 0
    if total_size <= 0:
        return {"ok": False, "error": "totalSize is required for chunked uploads", "code": "invalid_size"}
    if total_size > MAX_TOTAL_UPLOAD_BYTES:
        return {
            "ok": False,
            "error": f"File exceeds the maximum upload size of {MAX_TOTAL_UPLOAD_BYTES // (1024 * 1024)} MB",
            "code": "too_large",
        }
    if not is_truthy(data.get("overwrite")) and object_exists(s3, bucket, full_key):
        return {
            "ok": False,
            "error": "An object with this name already exists in this folder",
            "code": "duplicate",
            "key": rel_key,
        }
    upload_id = uuid4().hex
    return {
        "ok": True,
        "uploadId": upload_id,
        "mode": "chunked",
        "key": rel_key,
        "name": filename,
        "folder": folder,
        "partBytes": MAX_PART_BYTES,
    }


def chunk_part(s3, bucket, data):
    """Store one uploaded chunk in the hidden staging area."""
    upload_id = str(data.get("uploadId", "") or "")
    part_number = data.get("partNumber")
    part_b64 = str(data.get("partBase64", "") or "")
    if not UPLOAD_ID_RE.match(upload_id):
        return {"ok": False, "error": "Invalid upload id", "code": "invalid_upload"}
    try:
        part_number = int(part_number)
    except Exception:
        return {"ok": False, "error": "Invalid part number", "code": "invalid_part"}
    if not 1 <= part_number <= 10000:
        return {"ok": False, "error": "Part number out of range", "code": "invalid_part"}
    try:
        content = base64.b64decode("".join(part_b64.split()), validate=True)
    except Exception:
        return {"ok": False, "error": "Chunk could not be decoded", "code": "bad_content"}
    if not content:
        return {"ok": False, "error": "Empty chunk", "code": "bad_content"}
    if len(content) > MAX_PART_BYTES:
        return {"ok": False, "error": "Chunk exceeds the allowed size", "code": "chunk_too_large"}
    staging_key = f"{TEMP_UPLOAD_PREFIX}{upload_id}/{part_number:05d}"
    try:
        s3.put_object(Bucket=bucket, Key=staging_key, Body=content)
    except Exception as exc:
        return {"ok": False, "error": f"Chunk storage failed: {exc}", "code": "storage_error"}
    return {"ok": True, "partNumber": part_number, "size": len(content)}


def chunk_cleanup(s3, bucket, upload_id):
    """Remove every staged chunk for an upload id."""
    prefix = f"{TEMP_UPLOAD_PREFIX}{upload_id}/"
    try:
        for key in list_prefix_keys(s3, bucket, prefix):
            s3.delete_object(Bucket=bucket, Key=key)
    except Exception:
        pass


def chunk_complete(s3, bucket, data):
    """Assemble staged chunks into the final object, verify, and clean up."""
    upload_id = str(data.get("uploadId", "") or "")
    overwrite = is_truthy(data.get("overwrite"))
    content_type = str(data.get("contentType", "") or "").strip() or "application/octet-stream"
    if not UPLOAD_ID_RE.match(upload_id):
        return {"ok": False, "error": "Invalid upload id", "code": "invalid_upload"}
    try:
        rel_key, full_key, filename, folder = target_key(data)
    except ValueError as exc:
        chunk_cleanup(s3, bucket, upload_id)
        return {"ok": False, "error": str(exc), "code": "invalid_name"}
    try:
        expected_size = int(data.get("totalSize", 0) or 0)
    except Exception:
        expected_size = 0

    prefix = f"{TEMP_UPLOAD_PREFIX}{upload_id}/"
    part_keys = sorted(list_prefix_keys(s3, bucket, prefix))
    if not part_keys:
        return {"ok": False, "error": "No chunks were received for this upload", "code": "no_parts"}

    if not overwrite and object_exists(s3, bucket, full_key):
        chunk_cleanup(s3, bucket, upload_id)
        return {
            "ok": False,
            "error": "An object with this name already exists in this folder",
            "code": "duplicate",
        }

    try:
        # Stream the parts through a temp file so memory stays bounded.
        total = 0
        with tempfile.TemporaryFile() as tmp:
            for part_key in part_keys:
                body = s3.get_object(Bucket=bucket, Key=part_key)["Body"].read()
                tmp.write(body)
                total += len(body)
            if expected_size and total != expected_size:
                chunk_cleanup(s3, bucket, upload_id)
                return {
                    "ok": False,
                    "error": "Assembled size does not match the uploaded file",
                    "code": "verify_failed",
                    "expected": expected_size,
                    "received": total,
                }
            if total > MAX_TOTAL_UPLOAD_BYTES:
                chunk_cleanup(s3, bucket, upload_id)
                return {"ok": False, "error": "File exceeds the maximum upload size", "code": "too_large"}
            tmp.seek(0)
            s3.put_object(
                Bucket=bucket,
                Key=full_key,
                Body=tmp,
                ContentType=content_type,
                Metadata={"original-name": filename},
            )
    except Exception as exc:
        chunk_cleanup(s3, bucket, upload_id)
        return {"ok": False, "error": f"Assembly failed: {exc}", "code": "storage_error"}

    # Verify the final object really stored the exact byte count.
    try:
        head = s3.head_object(Bucket=bucket, Key=full_key)
        stored_size = int(head.get("ContentLength", 0) or 0)
    except Exception:
        chunk_cleanup(s3, bucket, upload_id)
        return {"ok": False, "error": "Upload could not be verified in storage", "code": "verify_failed"}
    if stored_size != total:
        chunk_cleanup(s3, bucket, upload_id)
        return {"ok": False, "error": "Stored size does not match the uploaded file", "code": "verify_failed"}

    chunk_cleanup(s3, bucket, upload_id)
    return {
        "ok": True,
        "key": rel_key,
        "name": filename,
        "folder": folder,
        "size": stored_size,
        "etag": (head.get("ETag") or "").strip('"'),
    }


def chunk_abort(s3, bucket, data):
    """Discard every staged chunk for an upload id."""
    upload_id = str(data.get("uploadId", "") or "")
    if not UPLOAD_ID_RE.match(upload_id):
        return {"ok": False, "error": "Invalid upload id", "code": "invalid_upload"}
    chunk_cleanup(s3, bucket, upload_id)
    return {"ok": True, "aborted": True}


def main(args, ctx=None):
    """Store real file bytes in S3.

    Default action: single Base64-over-JSON upload for small files.
    Chunked actions (chunk-init/part/complete/abort) stream larger files in
    bounded requests and assemble them server-side.
    """
    if not ctx or not hasattr(ctx, "S3_CLIENT"):
        return {"ok": False, "error": "Object storage not configured"}

    s3 = ctx.S3_CLIENT
    bucket = ctx.S3_DATA
    data = request_data(args)
    action = str(data.get("action", "") or "").lower()

    if action == "chunk-init":
        return chunk_init(s3, bucket, data)
    if action == "chunk-part":
        return chunk_part(s3, bucket, data)
    if action == "chunk-complete":
        return chunk_complete(s3, bucket, data)
    if action == "chunk-abort":
        return chunk_abort(s3, bucket, data)

    # ---- single-shot small upload ----
    overwrite = is_truthy(data.get("overwrite"))
    content_type = str(data.get("contentType", "") or "").strip() or "application/octet-stream"
    content_b64 = str(data.get("contentBase64", "") or "")
    try:
        rel_key, full_key, filename, folder = target_key(data)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), "code": "invalid_name"}

    try:
        content = base64.b64decode("".join(content_b64.split()), validate=True)
    except Exception:
        return {"ok": False, "error": "File content could not be decoded", "code": "bad_content"}

    if len(content) > MAX_UPLOAD_BYTES:
        return {
            "ok": False,
            "error": f"File exceeds the maximum single-request upload size of {MAX_UPLOAD_BYTES // 1024} KB",
            "code": "too_large",
            "maxBytes": MAX_UPLOAD_BYTES,
            "size": len(content),
        }

    existed = object_exists(s3, bucket, full_key)
    if existed and not overwrite:
        return {
            "ok": False,
            "error": "An object with this name already exists in this folder",
            "code": "duplicate",
            "key": rel_key,
        }

    try:
        s3.put_object(
            Bucket=bucket,
            Key=full_key,
            Body=content,
            ContentType=content_type,
            Metadata={"original-name": filename},
        )
    except Exception as exc:
        return {"ok": False, "error": f"Storage write failed: {exc}", "code": "storage_error"}

    # Verify the object was really stored with the exact byte count.
    try:
        head = s3.head_object(Bucket=bucket, Key=full_key)
        stored_size = int(head.get("ContentLength", 0) or 0)
    except Exception:
        return {"ok": False, "error": "Upload could not be verified in storage", "code": "verify_failed"}
    if stored_size != len(content):
        return {"ok": False, "error": "Stored size does not match the uploaded file", "code": "verify_failed"}

    return {
        "ok": True,
        "key": rel_key,
        "name": filename,
        "folder": folder,
        "size": stored_size,
        "etag": (head.get("ETag") or "").strip('"'),
        "overwritten": existed,
    }
