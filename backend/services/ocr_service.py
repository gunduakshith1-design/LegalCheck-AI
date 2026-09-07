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
import os
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import onnxruntime as ort

logger = logging.getLogger(__name__)

# Lazy-loaded OCR instance
_ocr_engine = None

# ── P1 experiment: pin ONNX Runtime thread pools ──────────────────────────
# Why this exists: rapidocr_onnxruntime 1.2.3 (the installed version) creates
# ORT SessionOptions() in OrtInferSession and never sets thread counts, and
# neither its config.yaml nor its constructor exposes intra/inter op thread
# parameters (verified in the installed package source). On cgroup-limited
# containers (e.g. Render free tier) ORT defaults to one intra-op thread per
# host core, which oversubscribes the CPU quota and thrashes.
#
# Mechanism: rapidocr lazily does `from onnxruntime import SessionOptions`
# at its import time, which happens inside _get_ocr_engine() below. Pinning
# ort.SessionOptions BEFORE that first import makes every session rapidocr
# constructs inherit intra_op=1 / inter_op=1 (documented, stable ORT API).
#
# Toggle: OCR_PIN_ORT_THREADS=0 disables pinning (used only for A/B
# benchmarking); default is enabled. No other OCR behavior is changed.
_ORT_PIN_INTRA_OP_THREADS = 1
_ORT_PIN_INTER_OP_THREADS = 1
_ort_pinning_applied = False


def _install_ort_thread_pinning() -> None:
    """Pin ORT SessionOptions thread defaults before rapidocr is imported."""
    global _ort_pinning_applied
    if _ort_pinning_applied:
        return
    if os.environ.get("OCR_PIN_ORT_THREADS", "1").strip().lower() in ("0", "false", "off"):
        logger.info("[P1] OCR_PIN_ORT_THREADS=0 — ORT thread pinning DISABLED (ORT defaults in effect)")
        _ort_pinning_applied = True
        return

    original_session_options = ort.SessionOptions

    def _pinned_session_options() -> ort.SessionOptions:
        options = original_session_options()
        options.intra_op_num_threads = _ORT_PIN_INTRA_OP_THREADS
        options.inter_op_num_threads = _ORT_PIN_INTER_OP_THREADS
        return options

    ort.SessionOptions = _pinned_session_options
    _ort_pinning_applied = True
    logger.info(
        "[P1] ORT SessionOptions pinned: intra_op_num_threads=%d, "
        "inter_op_num_threads=%d (rapidocr 1.2.x has no constructor param; "
        "pinning applied before rapidocr import)",
        _ORT_PIN_INTRA_OP_THREADS,
        _ORT_PIN_INTER_OP_THREADS,
    )


_install_ort_thread_pinning()

# Cap the longest edge of an input image before preprocessing/OCR.
# Very large phone photos (4032x3024 etc.) make denoise/CLAHE + ONNX
# inference unnecessarily slow with no measurable accuracy gain.
# Benchmark (2026-09-04) selected 2000px: ~64% faster per image with no
# legal-metrology field regressions vs full resolution; the first regressions
# appear at 1600px (date_of_manufacture) / 1280px (MRP).
MAX_OCR_DIMENSION = 2000


def _get_ocr_engine():
    """Get or initialize the RapidOCR engine."""
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            _ocr_engine = RapidOCR()
            pinned = os.environ.get("OCR_PIN_ORT_THREADS", "1").strip().lower() not in ("0", "false", "off")
            logger.info(
                "RapidOCR engine initialized successfully "
                "(intra_op_num_threads=%s, inter_op_num_threads=%s)",
                str(_ORT_PIN_INTRA_OP_THREADS) if pinned else "ort-default",
                str(_ORT_PIN_INTER_OP_THREADS) if pinned else "ort-default",
            )
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

    # Performance: downscale images larger than MAX_OCR_DIMENSION px on the
    # longest edge before the expensive denoise/CLAHE/OCR work.  Aspect ratio
    # is preserved; images already at or below the cap pass through unchanged.
    h, w = img.shape[:2]
    if max(h, w) > MAX_OCR_DIMENSION:
        scale = MAX_OCR_DIMENSION / max(h, w)
        new_size = (int(round(w * scale)), int(round(h * scale)))
        img = cv2.resize(img, new_size, interpolation=cv2.INTER_AREA)
        logger.info(
            f"[preprocess] Downscaled {w}x{h} -> {new_size[0]}x{new_size[1]} "
            f"(max {MAX_OCR_DIMENSION}px, INTER_AREA)"
        )

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
