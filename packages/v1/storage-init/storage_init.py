"""S3 Object Studio — storage initialization / connectivity verification.

Verifies the configured S3 connection with a real put/get/compare/delete
probe inside the dedicated application namespace. Creates nothing persistent.
"""

import uuid

# Dedicated application namespace (prefix) inside the configured data bucket.
# Every object managed by S3 Object Studio lives under this prefix; the app
# never enumerates the local filesystem and never touches unrelated objects.
STUDIO_NS = "s3-studio/"


def main(args, ctx=None):
    client = getattr(ctx, "S3_CLIENT", None) if ctx is not None else None
    bucket = getattr(ctx, "S3_DATA", None) if ctx is not None else None
    if client is None or not bucket:
        return {
            "ok": False,
            "error": "S3 storage is not configured for this application",
            "code": "NOT_CONFIGURED",
        }

    probe_key = STUDIO_NS + ".studio-probe-" + uuid.uuid4().hex + ".tmp"
    payload = b"s3-object-studio connectivity probe"
    error = None
    verified = False

    try:
        try:
            client.put_object(
                Bucket=bucket,
                Key=probe_key,
                Body=payload,
                ContentType="text/plain",
            )
            got = client.get_object(Bucket=bucket, Key=probe_key)["Body"].read()
            if got == payload:
                verified = True
            else:
                error = "Read/write verification failed: content mismatch"
        except Exception as exc:  # noqa: BLE001
            error = "S3 verification failed: %s" % (exc,)
    finally:
        try:
            client.delete_object(Bucket=bucket, Key=probe_key)
        except Exception:  # noqa: BLE001
            pass

    if not verified:
        return {
            "ok": False,
            "error": error or "S3 verification failed",
            "code": "STORAGE_ERROR",
        }

    return {
        "ok": True,
        "namespace": STUDIO_NS,
        "bucket": "configured",
        "readWrite": "OK",
    }