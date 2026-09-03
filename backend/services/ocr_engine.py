"""
OCR Engine Service — RapidOCR (ONNX-based)

Primary: RapidOCR (rapidocr-onnxruntime)
Fallback: None (RapidOCR is the only supported engine)

Provides:
- Engine initialization with status tracking
- OCR inference on numpy images
- Truthful status reporting for diagnostics

IMPORTANT: This module tracks initialization state truthfully.
If RapidOCR fails to initialize, status reflects the failure.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class OCREngineStatus:
    """Truthful status of the OCR engine."""
    engine_name: str = "rapidocr"
    package_available: bool = False
    package_version: str = ""
    initialized: bool = False
    model_ready: bool = False
    error: str | None = None
    details: dict[str, Any] = field(default_factory=dict)


# Global state
_engine = None
_status = OCREngineStatus()


def get_engine_status() -> OCREngineStatus:
    """Get the current OCR engine status."""
    global _status
    if _status.engine_name == "rapidocr" and not _status.package_available and _status.error is None:
        # First call — check availability
        _check_availability()
    return _status


def _check_availability():
    """Check if RapidOCR package is available."""
    global _status
    try:
        import rapidocr_onnxruntime
        _status.package_available = True
        _status.package_version = getattr(rapidocr_onnxruntime, '__version__', 'unknown')
    except ImportError as e:
        _status.package_available = False
        _status.error = f"Package not installed: {e}"


def initialize_ocr() -> str:
    """
    Initialize the RapidOCR engine.

    Returns:
        Engine name on success, "none" on failure.
    """
    global _engine, _status

    # Already initialized
    if _engine is not None and _status.initialized:
        return _status.engine_name

    # Check package availability
    _check_availability()

    if not _status.package_available:
        _status.initialized = False
        _status.model_ready = False
        logger.error(f"OCR engine unavailable: {_status.error}")
        return "none"

    # Initialize RapidOCR
    try:
        from rapidocr_onnxruntime import RapidOCR

        logger.info("Initializing RapidOCR engine...")
        _engine = RapidOCR()
        _status.initialized = True
        _status.model_ready = True
        _status.error = None
        logger.info(f"RapidOCR engine initialized successfully (v{_status.package_version})")
        return _status.engine_name

    except Exception as e:
        _engine = None
        _status.initialized = False
        _status.model_ready = False
        _status.error = f"Initialization failed: {e}"
        logger.error(f"RapidOCR initialization failed: {e}", exc_info=True)
        return "none"


def get_ocr_backend() -> str:
    """Get the name of the active OCR backend."""
    global _status
    if not _status.initialized:
        initialize_ocr()
    return _status.engine_name if _status.initialized else "none"


def run_ocr(image: np.ndarray) -> dict[str, Any]:
    """
    Run OCR on a numpy image array.

    Returns:
        Structured OCR output with text, regions, confidence, and bounding boxes.
    """
    global _engine, _status

    # Ensure initialized
    if _engine is None:
        initialize_ocr()

    if _engine is None or not _status.initialized:
        logger.error("OCR engine not initialized, cannot run inference")
        return {
            "backend": "none",
            "lines": [],
            "full_text": "",
            "line_count": 0,
            "avg_confidence": 0.0,
        }

    # Run inference
    try:
        import time
        start = time.time()
        result, elapse = _engine(image)
        elapsed = time.time() - start
        logger.info(f"RapidOCR inference: {len(result) if result else 0} regions in {elapsed:.2f}s")
    except Exception as e:
        logger.error(f"OCR inference failed: {e}", exc_info=True)
        return {
            "backend": "rapidocr",
            "lines": [],
            "full_text": "",
            "line_count": 0,
            "avg_confidence": 0.0,
            "error": str(e),
        }

    # Parse results
    lines = []
    if result:
        for item in result:
            bbox_raw = item[0]
            text = str(item[1]).strip()
            confidence = float(item[2])

            bbox = [[float(p[0]), float(p[1])] for p in bbox_raw]

            lines.append({
                "text": text,
                "confidence": round(confidence, 4),
                "bbox": bbox,
            })

    full_text = "\n".join(line["text"] for line in lines if line["text"])
    avg_confidence = (
        sum(l["confidence"] for l in lines) / len(lines) if lines else 0.0
    )

    return {
        "backend": "rapidocr",
        "lines": lines,
        "full_text": full_text,
        "line_count": len(lines),
        "avg_confidence": round(avg_confidence, 4),
    }


def self_test(image_path: str | None = None) -> dict[str, Any]:
    """
    Run a self-test of the OCR engine.

    Args:
        image_path: Path to a test image. If None, uses a synthetic test.

    Returns:
        Test results with status, regions, confidence, and sample text.
    """
    import time
    from pathlib import Path

    result = {
        "engine": "rapidocr",
        "initialized": False,
        "test_image": None,
        "regions_found": 0,
        "avg_confidence": 0.0,
        "sample_text": [],
        "elapsed_seconds": 0.0,
        "success": False,
        "error": None,
    }

    # Ensure initialized
    if _engine is None:
        status = initialize_ocr()
        if status == "none":
            result["error"] = _status.error or "Failed to initialize OCR engine"
            return result

    result["initialized"] = True

    # Load test image
    if image_path is None:
        # Find test_label.png relative to this file
        test_path = Path(__file__).resolve().parent.parent / "uploads" / "test_label.png"
        if not test_path.exists():
            # Try frontend/backend/uploads
            test_path = Path(__file__).resolve().parent.parent.parent / "uploads" / "test_label.png"
        if test_path.exists():
            image_path = str(test_path)

    if image_path is None or not Path(image_path).exists():
        result["error"] = f"Test image not found: {image_path}"
        return result

    result["test_image"] = image_path

    # Load and run OCR
    try:
        import cv2
        img = cv2.imread(image_path)
        if img is None:
            result["error"] = f"Could not read image: {image_path}"
            return result

        start = time.time()
        ocr_result = run_ocr(img)
        result["elapsed_seconds"] = round(time.time() - start, 3)
        result["regions_found"] = ocr_result["line_count"]
        result["avg_confidence"] = ocr_result["avg_confidence"]
        result["sample_text"] = [line["text"] for line in ocr_result["lines"][:5]]
        result["success"] = ocr_result["line_count"] > 0

    except Exception as e:
        result["error"] = f"Self-test failed: {e}"

    return result
