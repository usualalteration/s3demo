def main(args, ctx=None):
    """S3 Object Studio does not use accounts or sessions."""
    return {
        "ok": True,
        "message": "Nothing to sign out of: this app has no accounts.",
    }
