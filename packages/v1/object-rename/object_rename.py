"""S3 Object Studio — rename a file or folder.

S3 has no atomic rename. Renaming copies the object (or every object under
a folder prefix) to the new name, verifies each copy with HeadObject, and
only then deletes the originals. Folder renames roll back copied objects if
verification fails so nothing is lost.
"""

import json

from botocore.exceptions import ClientError

STUDIO_NS = "s3-studio/"
FOLDER_RENAME_CAP = 2000


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


def name_segment(name):
    raw = "" if name is None else str(name).strip()
    parts = segments(raw)
    if len(parts) != 1:
        raise ValueError("name must be a single path segment")
    return parts[0]


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


def prefix_has_objects(client, bucket, prefix):
    resp = client.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=1)
    return bool(resp.get("KeyCount"))


def iter_objects(client, bucket, prefix, cap):
    yielded = 0
    token = None
    while yielded < cap:
        kwargs = {"Bucket": bucket, "Prefix": prefix, "MaxKeys": min(1000, cap - yielded)}
        if token:
            kwargs["ContinuationToken"] = token
        resp = client.list_objects_v2(**kwargs)
        page = resp.get("Contents") or []
        if not page:
            # Empty page: no progress possible — stop instead of looping.
            return
        for item in page:
            if yielded >= cap:
                return
            yielded += 1
            yield item
        if not resp.get("IsTruncated"):
            return
        next_token = resp.get("NextContinuationToken")
        if not next_token or next_token == token:
            # Token did not advance — avoid an infinite pagination loop.
            return
        token = next_token


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
        new_name = data.get("newName")
        if new_name is None or not str(new_name).strip():
            return error("New name is required", "INVALID_NAME")
        overwrite = truthy(data.get("overwrite"))
        new_name = name_segment(new_name)
    except ValueError as exc:
        return error(str(exc), "INVALID_NAME")

    is_folder = path_raw.endswith("/")

    try:
        if is_folder:
            folder = folder_path(path_raw)
            if not folder:
                return error("Folder path is invalid", "INVALID_PATH")
            parent_parts = folder.rstrip("/").split("/")[:-1]
            parent = "/".join(parent_parts) + ("/" if parent_parts else "")
            src_prefix = STUDIO_NS + folder
            if not prefix_has_objects(client, bucket, src_prefix):
                return error("Folder not found", "NOT_FOUND")
            dest_prefix = STUDIO_NS + parent + new_name + "/"
            if dest_prefix == src_prefix:
                return error("The folder already has this name", "SAME_PATH")
            if prefix_has_objects(client, bucket, dest_prefix):
                return error("An object or folder with this name already exists", "EXISTS")

            items = list(iter_objects(client, bucket, src_prefix, FOLDER_RENAME_CAP))
            if len(items) >= FOLDER_RENAME_CAP:
                return error("Folder contains too many objects to rename", "TOO_LARGE")

            # CopyObject cannot reliably copy zero-byte folder markers on
            # every S3-compatible store, so markers are recreated with
            # PutObject and regular objects use verified CopyObject calls.
            file_items = [it for it in items if not it.get("Key", "").endswith("/")]
            marker_keys = [it.get("Key", "") for it in items if it.get("Key", "").endswith("/")]

            copied_pairs = []
            created_markers = []
            try:
                for item in file_items:
                    src_key = item.get("Key", "")
                    dest_key = dest_prefix + src_key[len(src_prefix):]
                    client.copy_object(
                        Bucket=bucket,
                        Key=dest_key,
                        CopySource={"Bucket": bucket, "Key": src_key},
                    )
                    head = client.head_object(Bucket=bucket, Key=dest_key)
                    if int(head.get("ContentLength", -1) or -1) != int(item.get("Size", -2) or -2):
                        raise RuntimeError("verification failed for '%s'" % src_key)
                    copied_pairs.append((src_key, dest_key))
                for marker in marker_keys:
                    dest_key = dest_prefix + marker[len(src_prefix):]
                    client.put_object(
                        Bucket=bucket,
                        Key=dest_key,
                        Body=b"",
                        ContentType="application/x-directory",
                    )
                    created_markers.append(dest_key)
                if not object_exists(client, bucket, dest_prefix):
                    client.put_object(
                        Bucket=bucket,
                        Key=dest_prefix,
                        Body=b"",
                        ContentType="application/x-directory",
                    )
                    created_markers.append(dest_prefix)
            except Exception:  # noqa: BLE001
                for _, copied_key in copied_pairs:
                    try:
                        client.delete_object(Bucket=bucket, Key=copied_key)
                    except Exception:  # noqa: BLE001
                        pass
                for marker_key in created_markers:
                    try:
                        client.delete_object(Bucket=bucket, Key=marker_key)
                    except Exception:  # noqa: BLE001
                        pass
                return error("Rename failed during copy verification; all changes were rolled back", "RENAME_FAILED")

            for src_key, _ in copied_pairs:
                client.delete_object(Bucket=bucket, Key=src_key)
            for marker in marker_keys:
                client.delete_object(Bucket=bucket, Key=marker)

            return {
                "ok": True,
                "type": "folder",
                "renamed": len(copied_pairs),
                "folder": {
                    "type": "folder",
                    "name": new_name,
                    "path": parent + new_name + "/",
                    "key": dest_prefix,
                },
            }

        src = file_path(path_raw)
        parent_parts = src.split("/")[:-1]
        parent = "/".join(parent_parts) + ("/" if parent_parts else "")
        src_key = STUDIO_NS + src
        src_head = None
        try:
            src_head = client.head_object(Bucket=bucket, Key=src_key)
        except ClientError as exc:
            try:
                code = exc.response.get("Error", {}).get("Code", "")
            except Exception:  # noqa: BLE001
                code = ""
            if code in ("404", "NoSuchKey", "NotFound", "ResourceNotFound"):
                return error("Object not found", "NOT_FOUND")
            raise

        dest_key = STUDIO_NS + parent + new_name
        if dest_key == src_key:
            return error("The object already has this name", "SAME_PATH")
        if not overwrite and object_exists(client, bucket, dest_key):
            return error("An object with this name already exists", "EXISTS")

        client.copy_object(
            Bucket=bucket,
            Key=dest_key,
            CopySource={"Bucket": bucket, "Key": src_key},
        )
        head = client.head_object(Bucket=bucket, Key=dest_key)
        src_size = int(src_head.get("ContentLength", -1) or -1)
        if int(head.get("ContentLength", -2) or -2) != src_size:
            client.delete_object(Bucket=bucket, Key=dest_key)
            return error("Rename failed during copy verification; changes were rolled back", "RENAME_FAILED")
        client.delete_object(Bucket=bucket, Key=src_key)
    except ValueError as exc:
        return error(str(exc), "INVALID_PATH")
    except ClientError as exc:
        return error("Rename failed: %s" % (exc,), "STORAGE_ERROR")
    except Exception as exc:  # noqa: BLE001
        return error("Rename failed: %s" % (exc,), "STORAGE_ERROR")

    return {
        "ok": True,
        "type": "file",
        "renamed": 1,
        "object": {
            "type": "file",
            "name": new_name,
            "path": parent + new_name,
            "key": dest_key,
            "size": int(head.get("ContentLength", 0) or 0),
            "contentType": head.get("ContentType") or "application/octet-stream",
            "lastModified": head.get("LastModified").isoformat() if head.get("LastModified") else None,
            "etag": (head.get("ETag") or "").strip('"'),
        },
    }