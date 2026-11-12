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
    """Copy or move a file or a whole folder inside the workspace prefix."""
    if not ctx or not hasattr(ctx, "S3_CLIENT"):
        return {"ok": False, "error": "Object storage not configured"}

    data = request_data(args)
    src = str(data.get("key", "") or "")
    dest_folder = str(data.get("destinationFolder", "") or "")
    new_name = str(data.get("newName", "") or "")
    move = is_truthy(data.get("move"))
    overwrite = is_truthy(data.get("overwrite"))
    item_type = str(data.get("type", "") or "").lower()

    try:
        src_segments = clean_segments(src)
        dest_segments = clean_segments(dest_folder)
        name_segments = clean_segments(new_name) if new_name else []
    except ValueError as exc:
        return {"ok": False, "error": str(exc), "code": "invalid_path"}
    if not src_segments:
        return {"ok": False, "error": "Source key is required", "code": "invalid_key"}
    if len(name_segments) > 1:
        return {"ok": False, "error": "New name cannot contain path separators", "code": "invalid_name"}

    s3 = ctx.S3_CLIENT
    bucket = ctx.S3_DATA
    src_rel = "/".join(src_segments)
    src_full = WORKSPACE_PREFIX + src_rel

    # Detect whether the source is a file or a folder.
    file_exists = object_exists(s3, bucket, src_full)
    marker_exists = object_exists(s3, bucket, src_full + "/")
    children_exist = has_children(s3, bucket, src_full + "/")

    if item_type == "folder":
        is_folder = True
    elif file_exists:
        is_folder = False
    elif marker_exists or children_exist:
        is_folder = True
    else:
        return {"ok": False, "error": "Source object not found", "code": "not_found", "key": src_rel}

    dest_parent = "/".join(dest_segments)
    target_name = name_segments[0] if name_segments else src_segments[-1]

    if not is_folder:
        dest_rel = f"{dest_parent}/{target_name}" if dest_parent else target_name
        dest_full = WORKSPACE_PREFIX + dest_rel
        if dest_rel == src_rel:
            return {"ok": False, "error": "Source and destination are the same", "code": "same_target"}
        if not overwrite and object_exists(s3, bucket, dest_full):
            return {
                "ok": False,
                "error": f"An object named '{target_name}' already exists in the destination",
                "code": "duplicate",
            }
        try:
            s3.copy_object(
                Bucket=bucket,
                CopySource={"Bucket": bucket, "Key": src_full},
                Key=dest_full,
            )
        except Exception as exc:
            return {"ok": False, "error": f"Copy failed: {exc}", "code": "storage_error"}
        try:
            src_size = int(s3.head_object(Bucket=bucket, Key=src_full).get("ContentLength", 0))
            dest_head = s3.head_object(Bucket=bucket, Key=dest_full)
        except Exception:
            return {"ok": False, "error": "Copy could not be verified", "code": "verify_failed"}
        if int(dest_head.get("ContentLength", 0)) != src_size:
            return {"ok": False, "error": "Copied object size mismatch", "code": "verify_failed"}
        if move:
            s3.delete_object(Bucket=bucket, Key=src_full)
        return {"ok": True, "key": dest_rel, "name": target_name, "moved": move, "type": "file"}

    # Folder copy/move: copy every child, verify, then delete originals.
    dest_rel_folder = f"{dest_parent}/{target_name}" if dest_parent else target_name
    if dest_rel_folder == src_rel or dest_rel_folder.startswith(src_rel + "/"):
        return {"ok": False, "error": "Cannot copy or move a folder into itself", "code": "invalid_target"}

    src_prefix = src_full + "/"
    dest_prefix = WORKSPACE_PREFIX + dest_rel_folder + "/"

    if not overwrite:
        if object_exists(s3, bucket, dest_prefix) or object_exists(s3, bucket, WORKSPACE_PREFIX + dest_rel_folder):
            return {
                "ok": False,
                "error": f"An item named '{target_name}' already exists in the destination",
                "code": "duplicate",
            }

    # Real child objects only; the trailing-slash marker cannot be copy_object'd
    # on this S3-compatible backend, so the destination marker is created below.
    all_children = list_prefix_keys(s3, bucket, src_prefix)
    copy_keys = [k for k in all_children if k != src_prefix]

    copied = 0
    try:
        for ck in copy_keys:
            suffix = ck[len(src_prefix):]
            new_key = dest_prefix + suffix
            s3.copy_object(Bucket=bucket, CopySource={"Bucket": bucket, "Key": ck}, Key=new_key)
            copied += 1
        if not object_exists(s3, bucket, dest_prefix):
            s3.put_object(
                Bucket=bucket,
                Key=dest_prefix,
                Body=b"",
                ContentType="application/x-directory",
            )
        # Verify every copied child before touching the originals.
        for ck in copy_keys:
            suffix = ck[len(src_prefix):]
            new_key = dest_prefix + suffix
            src_size = int(s3.head_object(Bucket=bucket, Key=ck).get("ContentLength", 0))
            dest_size = int(s3.head_object(Bucket=bucket, Key=new_key).get("ContentLength", 0))
            if src_size != dest_size:
                raise RuntimeError(f"Verification failed for '{suffix or '/'}'")
    except Exception as exc:
        return {"ok": False, "error": f"Folder copy failed: {exc}", "code": "storage_error"}

    if move:
        # Delete children before folder markers: the S3-compatible backend
        # rejects deleting a non-empty trailing-slash directory marker.
        try:
            for ck in sorted(all_children, reverse=True):
                s3.delete_object(Bucket=bucket, Key=ck)
        except Exception as exc:
            return {
                "ok": False,
                "error": f"Copied objects to '{dest_rel_folder}' but cleanup of the source failed: {exc}",
                "code": "cleanup_failed",
                "key": dest_rel_folder,
            }

    return {
        "ok": True,
        "key": dest_rel_folder,
        "name": target_name,
        "moved": move,
        "type": "folder",
        "objects": copied,
    }
