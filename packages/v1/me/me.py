def main(args, ctx=None):
    """S3 Object Studio does not use accounts or sessions."""
    return {
        "ok": False,
        "error": "This app has no accounts. Storage connects automatically through the OpenServerless S3 binding.",
        "code": "auth_disabled",
    }
