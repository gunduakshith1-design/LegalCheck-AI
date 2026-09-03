"""
Image Preprocessing Service
Uses OpenCV to prepare images for optimal OCR.
"""

import logging
from enum import Enum

import cv2
import numpy as np

logger = logging.getLogger(__name__)


class PreprocessingLevel(str, Enum):
    NONE = "none"
    LIGHT = "light"
    STANDARD = "standard"
    AGGRESSIVE = "aggressive"


def load_image_from_bytes(image_bytes: bytes) -> np.ndarray:
    """Load an OpenCV image from raw bytes."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image from bytes")
    return img


def resize_if_needed(img: np.ndarray, max_dimension: int = 4000) -> np.ndarray:
    """
    Resize image if either dimension exceeds max_dimension.
    Preserves aspect ratio. Upscales small images for better OCR.
    """
    h, w = img.shape[:2]
    min_dimension = 800

    # Upscale very small images
    if max(h, w) < min_dimension:
        scale = min_dimension / max(h, w)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        logger.info(f"Upscaled image from {w}x{h} to {img.shape[1]}x{img.shape[0]}")
        return img

    # Downscale very large images
    if max(h, w) > max_dimension:
        scale = max_dimension / max(h, w)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        logger.info(f"Downscaled image from {w}x{h} to {img.shape[1]}x{img.shape[0]}")

    return img


def convert_to_grayscale(img: np.ndarray) -> np.ndarray:
    """Convert BGR image to grayscale."""
    if len(img.shape) == 3:
        return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return img


def enhance_contrast(gray: np.ndarray) -> np.ndarray:
    """Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)."""
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(gray)


def denoise(gray: np.ndarray, strength: int = 10) -> np.ndarray:
    """Apply non-local means denoising."""
    return cv2.fastNlMeansDenoising(gray, None, strength, 7, 21)


def sharpen(gray: np.ndarray) -> np.ndarray:
    """Apply unsharp masking to sharpen text edges."""
    blurred = cv2.GaussianBlur(gray, (0, 0), 3)
    return cv2.addWeighted(gray, 1.5, blurred, -0.5, 0)


def adaptive_threshold(gray: np.ndarray) -> np.ndarray:
    """Apply adaptive thresholding for binarization."""
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )


def preprocess_image(
    image_bytes: bytes,
    level: PreprocessingLevel = PreprocessingLevel.STANDARD,
) -> dict:
    """
    Run the full preprocessing pipeline.

    Returns dict with:
      - original: original image bytes (for comparison)
      - processed: processed image as numpy array
      - processed_bytes: processed image as PNG bytes
      - steps_applied: list of preprocessing steps applied
    """
    original = load_image_from_bytes(image_bytes)
    steps_applied = []

    if level == PreprocessingLevel.NONE:
        _, buf = cv2.imencode(".png", original)
        return {
            "original": original,
            "processed": original,
            "processed_bytes": buf.tobytes(),
            "steps_applied": [],
        }

    img = original.copy()

    # Step 1: Resize if needed
    img = resize_if_needed(img)
    steps_applied.append("resize")

    # Step 2: Convert to grayscale
    gray = convert_to_grayscale(img)
    steps_applied.append("grayscale")

    if level in (PreprocessingLevel.STANDARD, PreprocessingLevel.AGGRESSIVE):
        # Step 3: Contrast enhancement
        gray = enhance_contrast(gray)
        steps_applied.append("contrast_enhancement")

        # Step 4: Denoise
        gray = denoise(gray)
        steps_applied.append("denoise")

    if level == PreprocessingLevel.AGGRESSIVE:
        # Step 5: Sharpen
        gray = sharpen(gray)
        steps_applied.append("sharpen")

        # Step 6: Threshold
        gray = adaptive_threshold(gray)
        steps_applied.append("adaptive_threshold")

    # Convert back to 3-channel for encoding
    if len(gray.shape) == 2:
        processed = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    else:
        processed = gray

    _, buf = cv2.imencode(".png", processed)

    return {
        "original": original,
        "processed": processed,
        "processed_bytes": buf.tobytes(),
        "steps_applied": steps_applied,
    }


def get_image_dimensions(img: np.ndarray) -> dict:
    """Get dimensions of a numpy image array."""
    h, w = img.shape[:2]
    return {"width": w, "height": h}
