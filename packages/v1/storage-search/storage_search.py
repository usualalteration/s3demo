"""S3 Object Studio — search objects within the application namespace.

Scans the dedicated prefix (bounded) and returns objects and folder markers
whose path or name matches the query, case-insensitively. Never enumerates
objects outside the application namespace.
"""

import json

STUDIO_NS = "s3-studio/"
SCAN_CAP = 2000
MAX_RESULTS = 200


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

    data = request_data(args)
    query = str(data.get("q") or data.get("query") or "").strip()
    try:
        max_results = int(data.get("maxResults") or 100)
    except (TypeError, ValueError):
        max_results = 100
    max_results = max(1, min(MAX_RESULTS, max_results))

    if not query:
        return {
            "ok": True,
            "query": query,
            "objects": [],
            "folders": [],
            "scanned": 0,
            "truncated": False,
        }

    qlower = query.lower()
    objects = []
    folders = {}
    scanned = 0
    truncated = False

    try:
        paginator = client.get_paginator("list_objects_v2")
        pages = paginator.paginate(
            Bucket=bucket,
            Prefix=STUDIO_NS,
            PaginationConfig={"MaxItems": SCAN_CAP, "PageSize": 1000},
        )
        for page in pages:
            for item in page.get("Contents") or []:
                scanned += 1
                key = item.get("Key", "")
                rel = key[len(STUDIO_NS):]
                if key.endswith("/"):
                    folder_name = rel.rstrip("/").rsplit("/", 1)[-1]
                    if folder_name and qlower in folder_name.lower():
                        folders[rel] = True
                    continue
                if qlower in rel.lower():
                    if len(objects) < max_results:
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
                    else:
                        truncated = True
            if scanned >= SCAN_CAP:
                truncated = truncated or scanned >= SCAN_CAP
                break
    except Exception as exc:  # noqa: BLE001
        return error("Search failed: %s" % (exc,), "STORAGE_ERROR")

    folder_list = sorted(folders.keys())[:max_results]
    if len(folders) > max_results:
        truncated = True

    return {
        "ok": True,
        "query": query,
        "objects": objects,
        "folders": [
            {
                "type": "folder",
                "name": f.rstrip("/").rsplit("/", 1)[-1],
                "path": f,
                "key": STUDIO_NS + f,
            }
            for f in folder_list
        ],
        "scanned": scanned,
        "truncated": truncated,
    }