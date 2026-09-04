"""
Tests for the OCR performance optimization — 2000px max-dimension downscale.

Covered:
1. A large image is reduced to <= 2000px max dimension.
2. Aspect ratio is preserved approximately.
3. A small image (<= 2000px) is not resized.
4. The image remains valid for the existing OCR pipeline.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2
import numpy as np

from services.ocr_service import MAX_OCR_DIMENSION, preprocess_image, run_ocr, ocr_from_bytes

LARGE_W, LARGE_H = 4032, 3024  # phone-sized capture


def _make_image(width: int, height: int, with_text: bool = False) -> bytes:
    """Build a synthetic image as JPEG bytes."""
    img = np.full((height, width, 3), 255, dtype=np.uint8)
    if with_text:
        lines = [
            "NUTRIFRESH ORGANIC MIXED FRUIT JUICE",
            "Net Quantity: 1 Litre",
            "MRP Rs 240.00 (incl of all taxes)",
            "FSSAI Lic No 12415678901234",
            "Mfg by: NutriFresh Foods Pvt Ltd, Pune",
            "Best Before: 09 Months from manufacture",
        ]
        scale = min(width, height) / 800.0
        font_scale = max(0.8, scale)
        thickness = max(2, int(scale))
        y = int(height * 0.15)
        for line in lines:
            cv2.putText(
                img, line, (int(width * 0.08), y),
                cv2.FONT_HERSHEY_SIMPLEX, font_scale, (30, 30, 30), thickness,
            )
            y += int(height * 0.12)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        raise RuntimeError("failed to encode test image")
    return buf.tobytes()


class TestOCRDownscale(unittest.TestCase):
    """Tests for the 2000px max-dimension downscale in preprocess_image."""

    def test_large_image_reduced_to_max_2000(self):
        """A phone-sized image must be downscaled so max(h, w) <= 2000."""
        data = _make_image(LARGE_W, LARGE_H)
        processed = preprocess_image(data, level="none")
        h, w = processed.shape[:2]
        self.assertLessEqual(max(h, w), MAX_OCR_DIMENSION)
        # Longest edge should land exactly on the cap when scaling down.
        self.assertEqual(max(h, w), MAX_OCR_DIMENSION)

    def test_aspect_ratio_preserved(self):
        """Downscaling must preserve the original aspect ratio."""
        data = _make_image(LARGE_W, LARGE_H)
        processed = preprocess_image(data, level="none")
        h, w = processed.shape[:2]

        original_ratio = LARGE_W / LARGE_H
        new_ratio = w / h
        self.assertAlmostEqual(new_ratio, original_ratio, delta=0.02)

        # Exact expected rounded size for 4032x3024 -> 2000x1500.
        self.assertEqual((h, w), (1500, 2000))

    def test_small_image_not_resized(self):
        """An image already <= 2000px must pass through unchanged."""
        w, h = 800, 600
        data = _make_image(w, h)
        processed = preprocess_image(data, level="none")
        self.assertEqual(processed.shape[:2], (h, w))

    def test_large_image_valid_for_ocr_pipeline(self):
        """The downscaled image must still flow through the full OCR pipeline."""
        data = _make_image(LARGE_W, LARGE_H, with_text=True)
        result = ocr_from_bytes(data, preprocessing="standard")
        self.assertIn("engine", result)
        self.assertEqual(result["engine"], "rapidocr")
        self.assertIsInstance(result["line_count"], int)
        self.assertGreater(result["line_count"], 0, "OCR should detect text after downscale")
        self.assertIsInstance(result["raw_text"], str)
        self.assertGreater(len(result["raw_text"]), 0)

    def test_run_ocr_accepts_downscaled_image(self):
        """run_ocr should accept the preprocessed (downscaled) ndarray directly."""
        data = _make_image(LARGE_W, LARGE_H, with_text=True)
        processed = preprocess_image(data, level="standard")
        self.assertLessEqual(max(processed.shape[:2]), MAX_OCR_DIMENSION)
        result = run_ocr(processed)
        self.assertEqual(result["engine"], "rapidocr")


if __name__ == "__main__":
    unittest.main()