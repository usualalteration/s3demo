"""Compatibility shim for the retired `v1/copy` endpoint.

The action name `copy` collides with the Python standard library `copy`
module which the action runtime and its dependencies (boto3, redis) import.
Because the platform wrapper imports this file as module `copy`, it must keep
the standard library surface intact for those libraries to work.

This module therefore re-exports the real standard library `copy`
implementation and answers requests with a redirect notice pointing to the
replacement endpoint `v1/copy-object`.
"""

import importlib.util
import os


def _load_stdlib_copy():
    """Load the real standard library copy.py under a private alias."""
    stdlib_path = os.path.join(os.path.dirname(os.__file__), "copy.py")
    spec = importlib.util.spec_from_file_location("_s3studio_stdlib_copy", stdlib_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_stdlib_copy = _load_stdlib_copy()
for _name in dir(_stdlib_copy):
    if not _name.startswith("__"):
        globals()[_name] = getattr(_stdlib_copy, _name)


def main(args, ctx=None):
    """Report that the copy endpoint moved to v1/copy-object."""
    return {
        "ok": False,
        "error": "This endpoint has moved. Use /api/my/v1/copy-object instead.",
        "code": "endpoint_moved",
    }
