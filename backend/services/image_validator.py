"""
Image Validation Service
Validates uploaded images: format, size, and corruption.
"""

import io
from pathlib import Path

from fastapi import UploadFile
from PIL import Image


SUPPORTED_FORMATS = {"image/jpeg", "image/png", "image/jpg", "image/webp", "image/bmp"}
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


class ImageValidationError(Exception):
    """Raised when image validation fails."""

    def __init__(self, message: str, code: str = "VALIDATION_ERROR"):
        self.message = message
        self.code = code
        super().__init__(self.message)


async def validate_image(file: UploadFile) -> None:
    """
    Validate an uploaded image file.
    Raises ImageValidationError if the file is invalid.
    """
    # Check content type
    if file.content_type and file.content_type not in SUPPORTED_FORMATS:
        raise ImageValidationError(
            f"Unsupported file type: {file.content_type}. "
            f"Supported formats: {', '.join(sorted(SUPPORTED_FORMATS))}",
            code="UNSUPPORTED_FORMAT",
        )

    # Check file extension
    if file.filename:
        ext = Path(file.filename).suffix.lower()
        if ext not in SUPPORTED_EXTENSIONS:
            raise ImageValidationError(
                f"Unsupported file extension: {ext}. "
                f"Supported extensions: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
                code="UNSUPPORTED_EXTENSION",
            )

    # Read file content
    content = await file.read()
    file_size = len(content)

    # Check file size
    if file_size > MAX_FILE_SIZE_BYTES:
        raise ImageValidationError(
            f"File too large: {file_size / (1024 * 1024):.1f} MB. "
            f"Maximum allowed: {MAX_FILE_SIZE_BYTES / (1024 * 1024):.0f} MB",
            code="FILE_TOO_LARGE",
        )

    # Check minimum size (likely empty/corrupt)
    if file_size < 100:
        raise ImageValidationError(
            "File too small to be a valid image.",
            code="FILE_TOO_SMALL",
        )

    # Validate image is not corrupted by attempting to open it
    try:
        img = Image.open(io.BytesIO(content))
        img.verify()
    except Exception as e:
        raise ImageValidationError(
            f"Corrupted or unreadable image file: {str(e)}",
            code="CORRUPTED_IMAGE",
        )

    # Re-read after verify (verify invalidates the image object)
    try:
        img = Image.open(io.BytesIO(content))
        img.load()
    except Exception as e:
        raise ImageValidationError(
            f"Image file could not be loaded: {str(e)}",
            code="UNREADABLE_IMAGE",
        )


def get_image_info(content: bytes) -> dict:
    """Get basic info about an image from its bytes."""
    try:
        img = Image.open(io.BytesIO(content))
        return {
            "width": img.width,
            "height": img.height,
            "format": img.format,
            "mode": img.mode,
        }
    except Exception:
        return {"width": 0, "height": 0, "format": "unknown", "mode": "unknown"}
