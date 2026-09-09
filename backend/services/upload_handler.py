"""
Upload Handler Service
Manages image storage for uploaded scans.

Primary store: Supabase Storage (durable — survives Render restarts,
redeploys and idle spin-downs). Secondary write: local disk, retained
temporarily for backward compatibility and debugging. The URL returned
to the frontend/database is the durable Storage URL whenever Storage is
configured; otherwise the legacy local `/uploads/<filename>` path is
used (local development only).
"""

import logging
import os
import uuid
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Supabase Storage configuration — SERVER-SIDE ONLY.
# SUPABASE_SERVICE_ROLE_KEY must never be exposed to the frontend (no VITE_
# prefix, never logged). See docs/migrations/014_supabase_storage_bucket.sql
# for the one-time bucket setup.
# ---------------------------------------------------------------------------
SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
SUPABASE_STORAGE_BUCKET = os.environ.get("SUPABASE_STORAGE_BUCKET", "product-images")

_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
}


class StorageUploadError(Exception):
    """Raised when Supabase Storage is configured but the upload fails.

    Callers must convert this into an explicit HTTP error so a dead
    image URL is never persisted to the database.
    """


def _storage_configured() -> bool:
    """True when server-side Storage credentials are present."""
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET)


def _upload_to_storage(image_bytes: bytes, object_path: str, content_type: str):
    """
    Upload image bytes to Supabase Storage.

    Returns the durable public URL on success, or None when Storage is
    not configured (local development fallback). Raises StorageUploadError
    when Storage IS configured but the upload fails.
    """
    if not _storage_configured():
        logger.info("Supabase Storage not configured; using local disk only")
        return None

    endpoint = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{object_path}"
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                endpoint,
                content=image_bytes,
                headers={
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Content-Type": content_type,
                    "x-upsert": "true",
                },
            )
    except Exception as e:
        logger.error(f"Supabase Storage upload error for object {SUPABASE_STORAGE_BUCKET}/{object_path}: {e}")
        raise StorageUploadError(f"Storage upload failed: {e}") from e

    if response.status_code not in (200, 201):
        logger.error(
            f"Supabase Storage upload failed (HTTP {response.status_code}) "
            f"for object {SUPABASE_STORAGE_BUCKET}/{object_path}"
        )
        raise StorageUploadError(f"Storage upload failed (HTTP {response.status_code})")

    return f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{object_path}"


def save_upload(image_bytes: bytes, filename: str) -> dict:
    """
    Store an uploaded image and return path/metadata.

    The generated filename keeps the legacy UUID format
    (<uuid4-hex><ext>) so object paths are collision-free. When Storage
    is configured, the result includes "url" — the durable public Storage
    URL that must be persisted by the frontend/database. The local-disk
    write is retained as a secondary copy for backward compatibility.
    """
    # Generate unique filename (same scheme as before)
    ext = Path(filename).suffix.lower() or ".png"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    content_type = _MEDIA_TYPES.get(ext, "application/octet-stream")

    # Primary: durable Supabase Storage copy (raises on configured failure)
    durable_url = _upload_to_storage(image_bytes, unique_name, content_type)

    # Secondary: local write retained for rollback/debugging
    file_path = UPLOADS_DIR / unique_name
    file_path.write_bytes(image_bytes)

    logger.info(f"Saved upload: {file_path.name} ({len(image_bytes)} bytes)")

    result = {
        "path": str(file_path),
        "filename": unique_name,
        "original_filename": filename,
        "size_bytes": len(image_bytes),
    }
    if durable_url is not None:
        result["url"] = durable_url
    return result


def response_url(saved: dict) -> str:
    """
    The image URL to include in scan responses (files[].url / file.url).

    Prefers the durable Supabase Storage URL; falls back to the legacy
    backend-relative /uploads path when Storage is not configured.
    """
    return saved.get("url") or f"/uploads/{saved['filename']}"


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
    """Remove local uploads older than max_age_hours. Returns count removed."""
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
