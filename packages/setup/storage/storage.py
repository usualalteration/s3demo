from uuid import uuid4

WORKSPACE_PREFIX = "s3-object-studio/"


def object_exists(s3, bucket, key):
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except Exception:
        return False


def main(args, ctx=None):
    """Idempotent workspace initialization for the S3 Object Studio.

    Verifies real S3 read/write access with an isolated temporary object
    outside the workspace prefix, then ensures the workspace root marker
    exists. Never deletes or modifies existing workspace content.
    """
    if not ctx or not hasattr(ctx, "S3_CLIENT"):
        return {"ok": False, "error": "S3 storage not configured"}

    s3 = ctx.S3_CLIENT
    bucket = ctx.S3_DATA

    # 1. Verify read/write with a unique temporary key, cleaned up in finally.
    check_key = f"trustant-check/s3studio-{uuid4().hex}.bin"
    payload = b"s3-object-studio-read-write-verification-payload"
    try:
        try:
            s3.put_object(Bucket=bucket, Key=check_key, Body=payload)
            actual = s3.get_object(Bucket=bucket, Key=check_key)["Body"].read()
            if actual != payload:
                return {
                    "ok": False,
                    "error": "S3 read/write verification failed: stored content does not match",
                }
        finally:
            try:
                s3.delete_object(Bucket=bucket, Key=check_key)
            except Exception:
                pass
    except Exception as exc:
        return {"ok": False, "error": f"S3 storage unavailable: {exc}"}

    # 2. Ensure the workspace root marker exists (idempotent).
    try:
        if not object_exists(s3, bucket, WORKSPACE_PREFIX):
            s3.put_object(
                Bucket=bucket,
                Key=WORKSPACE_PREFIX,
                Body=b"",
                ContentType="application/x-directory",
            )
    except Exception as exc:
        return {"ok": False, "error": f"Workspace initialization failed: {exc}"}

    return {
        "ok": True,
        "read_write": "OK",
        "workspace": "s3-object-studio",
    }
