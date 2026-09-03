"""
Upload Handler Service
Manages temporary image storage on disk.
"""

import logging
import os
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def save_upload(image_bytes: bytes, filename: str) -> dict:
    """
    Save an uploaded image to the uploads directory.
    Returns dict with file path and metadata.
    """
    # Generate unique filename
    ext = Path(filename).suffix.lower() or ".png"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOADS_DIR / unique_name

    # Write to disk
    file_path.write_bytes(image_bytes)

    logger.info(f"Saved upload: {file_path.name} ({len(image_bytes)} bytes)")

    return {
        "path": str(file_path),
        "filename": unique_name,
        "original_filename": filename,
        "size_bytes": len(image_bytes),
    }


def get_upload_path(filename: str) -> Path:
    """Get the full path for an uploaded file.

    Safety: resolves the path and verifies it stays within UPLOADS_DIR.
    This prevents path traversal attacks (e.g., '../../etc/passwd').
    """
    # Strip any directory components — only accept bare filenames
    safe_name = Path(filename).name
    if not safe_name or safe_name.startswith('.'):
        return UPLOADS_DIR / "__invalid__"

    resolved = (UPLOADS_DIR / safe_name).resolve()

    # Verify the resolved path is within UPLOADS_DIR
    if not str(resolved).startswith(str(UPLOADS_DIR.resolve())):
        logger.warning(f"Path traversal attempt blocked: {filename}")
        return UPLOADS_DIR / "__invalid__"

    return resolved


def cleanup_old_uploads(max_age_hours: int = 24) -> int:
    """Remove uploads older than max_age_hours. Returns count removed."""
    import time

    now = time.time()
    max_age_seconds = max_age_hours * 3600
    removed = 0

    for file_path in UPLOADS_DIR.iterdir():
        if file_path.is_file():
            file_age = now - file_path.stat().st_mtime
            if file_age > max_age_seconds:
                file_path.unlink()
                removed += 1

    return removed
