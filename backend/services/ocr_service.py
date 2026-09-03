"""
OCR Service — RapidOCR-based text extraction

Provides a structured OCR output compatible with the rule engine.
Uses RapidOCR (ONNX-based) as the primary engine.

Output format:
{
    "raw_text": "all extracted text",
    "text_regions": [
        {"text": "...", "confidence": 0.95, "bbox": [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]}
    ],
    "average_confidence": 0.92,
    "line_count": 15,
    "engine": "rapidocr"
}
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Lazy-loaded OCR instance
_ocr_engine = None


def _get_ocr_engine():
    """Get or initialize the RapidOCR engine."""
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            _ocr_engine = RapidOCR()
            logger.info("RapidOCR engine initialized successfully")
        except ImportError as e:
            logger.error(f"RapidOCR not available: {e}")
            raise RuntimeError(f"No OCR engine available: {e}")
    return _ocr_engine


def preprocess_image(image_bytes: bytes, level: str = "standard") -> np.ndarray:
    """
    Preprocess an image for OCR.

    Args:
        image_bytes: Raw image bytes.
        level: Preprocessing level — "none", "light", "standard", "aggressive".

    Returns:
        Preprocessed image as numpy array.
    """
    logger.info(f"[preprocess] Input: {len(image_bytes)} bytes, level={level}")
    logger.info(f"[preprocess] First 16 bytes (hex): {image_bytes[:16].hex() if image_bytes else 'EMPTY'}")

    # Decode image
    nparr = np.frombuffer(image_bytes, np.uint8)
    logger.info(f"[preprocess] nparr shape: {nparr.shape}")

    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        logger.error(f"[preprocess] cv2.imdecode returned None! bytes length={len(image_bytes)}, first 4 bytes={image_bytes[:4]}")
        raise ValueError(f"Could not decode image from bytes ({len(image_bytes)} bytes, first 4: {image_bytes[:4]})")

    logger.info(f"[preprocess] Decoded image: {img.shape}")

    if level == "none":
        return img

    # Convert to grayscale for processing
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    if level in ("light", "standard", "aggressive"):
        # Denoise
        denoise_strength = {"light": 3, "standard": 5, "aggressive": 9}[level]
        gray = cv2.fastNlMeansDenoising(gray, None, denoise_strength, 7, 21)

    if level in ("standard", "aggressive"):
        # Enhance contrast with CLAHE
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)

    if level == "aggressive":
        # Additional sharpening
        kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
        gray = cv2.filter2D(gray, -1, kernel)

    # Convert back to BGR for OCR engine
    img = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    return img


def run_ocr(image: np.ndarray) -> dict[str, Any]:
    """
    Run OCR on a preprocessed image.

    Args:
        image: Image as numpy array (BGR).

    Returns:
        Structured OCR output with text, regions, confidence, and bounding boxes.
    """
    logger.info(f"[run_ocr] Getting OCR engine...")
    engine = _get_ocr_engine()
    logger.info(f"[run_ocr] Engine ready. Running inference on {image.shape} image...")

    start_time = time.time()
    try:
        result, elapse = engine(image)
    except Exception as e:
        logger.error(f"[run_ocr] OCR inference FAILED: {e}", exc_info=True)
        raise
    ocr_time = time.time() - start_time
    logger.info(f"[run_ocr] Inference complete: {len(result) if result else 0} regions in {ocr_time:.2f}s")

    text_regions = []
    full_text_parts = []

    if result:
        for item in result:
            # RapidOCR returns: [bbox, text, confidence]
            bbox_raw = item[0]
            text = item[1]
            confidence = float(item[2])

            # Convert bbox from [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
            bbox = [[float(p[0]), float(p[1])] for p in bbox_raw]

            text_regions.append({
                "text": text.strip(),
                "confidence": round(confidence, 4),
                "bbox": bbox,
            })
            if text.strip():
                full_text_parts.append(text.strip())

    full_text = "\n".join(full_text_parts)
    avg_confidence = (
        sum(r["confidence"] for r in text_regions) / len(text_regions)
        if text_regions
        else 0.0
    )

    return {
        "raw_text": full_text,
        "text_regions": text_regions,
        "average_confidence": round(avg_confidence, 4),
        "line_count": len(text_regions),
        "engine": "rapidocr",
        "timing_seconds": round(ocr_time, 3),
    }


def ocr_from_bytes(
    image_bytes: bytes,
    preprocessing: str = "standard",
) -> dict[str, Any]:
    """
    Full OCR pipeline: bytes → preprocess → OCR → structured output.

    Args:
        image_bytes: Raw image file bytes.
        preprocessing: Preprocessing level.

    Returns:
        Structured OCR output.
    """
    start_time = time.time()

    # Preprocess
    img = preprocess_image(image_bytes, level=preprocessing)

    # OCR
    ocr_result = run_ocr(img)

    total_time = time.time() - start_time
    ocr_result["total_seconds"] = round(total_time, 3)

    return ocr_result
