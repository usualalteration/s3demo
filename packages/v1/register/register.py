def main(args, ctx=None):
    """S3 Object Studio does not use accounts.

    Storage connectivity is provided automatically by the OpenServerless
    S3 runtime binding (action_add_s3); no registration or sign-in exists.
    """
    return {
        "ok": False,
        "error": "This app has no accounts. Storage connects automatically through the OpenServerless S3 binding.",
        "code": "auth_disabled",
    }
