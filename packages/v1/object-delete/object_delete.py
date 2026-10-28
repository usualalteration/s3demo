"""S3 Object Studio — delete an object or folder.

Files are deleted with DeleteObject. Folders delete every object under
their prefix (including the zero-byte folder marker). Deleting a non-empty
folder requires an explicit recursive flag; the backend reports the object
count so the UI can ask for confirmation first.
"""

import json

from botocore.exceptions import ClientError

STUDIO_NS = "s3-studio/"
DELETE_CAP = 5000


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


def collect_keys(client, bucket, prefix, cap):
    keys = []
    token = None
    truncated = False
    while True:
        kwargs = {
            "Bucket": bucket,
            "Prefix": prefix,
            "MaxKeys": min(1000, max(1, cap - len(keys))),
        }
        if token:
            kwargs["ContinuationToken"] = token
        resp = client.list_objects_v2(**kwargs)
        page = resp.get("Contents") or []
        if not page:
            # Empty page: no progress possible. Stop instead of looping on a
            # misbehaving continuation token.
            break
        for item in page:
            keys.append(item.get("Key", ""))
        if len(keys) >= cap:
            truncated = True
            break
        if not resp.get("IsTruncated"):
            break
        next_token = resp.get("NextContinuationToken")
        if not next_token or next_token == token:
            # Token did not advance — avoid an infinite pagination loop.
            truncated = True
            break
        token = next_token
    return keys, truncated


def main(args, ctx=None):
    client = getattr(ctx, "S3_CLIENT", None) if ctx is not None else None
    bucket = getattr(ctx, "S3_DATA", None) if ctx is not None else None
    if client is None or not bucket:
        return error("S3 storage is not configured for this application", "NOT_CONFIGURED")

    try:
        data = request_data(args)
        path_raw = "" if data.get("path") is None else str(data.get("path"))
        if not path_raw:
            return error("Path is required", "INVALID_PATH")
        recursive = truthy(data.get("recursive"))
    except ValueError as exc:
        return error(str(exc), "INVALID_PATH")

    is_folder = path_raw.endswith("/")

    try:
        if is_folder:
            folder = folder_path(path_raw)
            if not folder:
                return error("Folder path is invalid", "INVALID_PATH")
            prefix = STUDIO_NS + folder
            keys, truncated = collect_keys(client, bucket, prefix, DELETE_CAP)
            if not keys:
                # Some S3-compatible stores keep empty directory entries that
                # plain prefix listings no longer return. If the marker still
                # exists, remove it directly instead of reporting NOT_FOUND.
                if not object_exists(client, bucket, prefix):
                    return error("Folder not found", "NOT_FOUND")
                keys = [prefix]

            content_count = sum(1 for k in keys if k != prefix)
            if content_count > 0 and not recursive:
                return {
                    "ok": False,
                    "error": "Folder contains %d object(s). Confirm recursive delete to remove them." % content_count,
                    "code": "NOT_EMPTY",
                    "count": content_count,
                }
            if truncated:
                return error("Folder contains too many objects to delete in one operation", "TOO_LARGE")

            deleted = 0
            failed = []
            # Batch delete first (efficient). Some S3-compatible stores
            # (SeaweedFS among them) silently skip zero-byte folder markers
            # whose contents were in the same batch, so verify with one
            # re-list and fall back to individual deletes for leftovers.
            for start in range(0, len(keys), 1000):
                batch = [{"Key": k} for k in keys[start:start + 1000]]
                try:
                    client.delete_objects(
                        Bucket=bucket,
                        Delete={"Objects": batch, "Quiet": True},
                    )
                except ClientError:
                    failed.extend(keys[start:start + 1000])

            remaining, _ = collect_keys(client, bucket, prefix, DELETE_CAP)
            leftovers = [k for k in remaining if k != prefix] + [k for k in failed if k != prefix]
            for key in leftovers:
                try:
                    client.delete_object(Bucket=bucket, Key=key)
                    deleted += 1
                except ClientError:
                    pass
            if remaining and prefix in remaining:
                # Marker survived the batch — remove it individually now that
                # its contents are gone.
                try:
                    client.delete_object(Bucket=bucket, Key=prefix)
                    deleted += 1
                except ClientError:
                    pass
            elif not remaining and not keys:
                deleted += 1

            # Directory entries can outlive both the batch delete and the
            # plain prefix listing on some S3-compatible stores. Make sure
            # the folder marker itself is really gone.
            marker_gone = True
            try:
                if object_exists(client, bucket, prefix):
                    client.delete_object(Bucket=bucket, Key=prefix)
                    deleted += 1
                    marker_gone = not object_exists(client, bucket, prefix)
            except ClientError:
                marker_gone = True  # cannot verify — do not fail the operation

            if not marker_gone:
                return {
                    "ok": False,
                    "error": "Deleted the folder contents but the folder itself could not be removed",
                    "code": "PARTIAL_DELETE",
                    "deleted": deleted,
                    "remaining": 1,
                }
            return {"ok": True, "type": "folder", "deleted": max(deleted, len(keys))}

        path = file_path(path_raw)
        key = STUDIO_NS + path
        try:
            client.head_object(Bucket=bucket, Key=key)
        except ClientError as exc:
            try:
                code = exc.response.get("Error", {}).get("Code", "")
            except Exception:  # noqa: BLE001
                code = ""
            if code in ("404", "NoSuchKey", "NotFound", "ResourceNotFound"):
                return error("Object not found", "NOT_FOUND")
            raise
        client.delete_object(Bucket=bucket, Key=key)
        return {"ok": True, "type": "file", "deleted": 1}
    except ValueError as exc:
        return error(str(exc), "INVALID_PATH")
    except ClientError as exc:
        return error("Delete failed: %s" % (exc,), "STORAGE_ERROR")
    except Exception as exc:  # noqa: BLE001
        return error("Delete failed: %s" % (exc,), "STORAGE_ERROR")