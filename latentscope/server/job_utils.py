"""Shared helpers for server blueprints: parameter validation utilities."""
import os

from flask import abort


def _safe_dataset(value, param="dataset"):
    """Validate an identifier (dataset id, job id, tag name, ...) that will be
    joined into a filesystem path.

    Rejects values that are empty/missing, contain path separators or "..",
    or are absolute paths.  Aborts the request with a 400 when invalid and
    returns the value unchanged when valid.
    """
    if not value or not isinstance(value, str):
        abort(400, description=f"Missing or invalid '{param}' parameter")
    if "/" in value or "\\" in value or ".." in value or os.path.isabs(value):
        abort(400, description=f"Invalid '{param}' parameter")
    return value
