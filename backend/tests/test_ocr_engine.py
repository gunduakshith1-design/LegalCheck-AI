"""
Tests for the OCR Engine — initialization, status reporting, self-test
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.ocr_engine import (
    initialize_ocr,
    get_ocr_backend,
    get_engine_status,
    self_test,
    OCREngineStatus,
)


class TestOCRInitialization(unittest.TestCase):
    """Tests for OCR engine initialization."""

    def test_initialize_returns_rapidocr(self):
        """initialize_ocr should return 'rapidocr' on success."""
        result = initialize_ocr()
        self.assertEqual(result, "rapidocr")

    def test_status_initialized(self):
        """Engine status should report initialized=True after init."""
        initialize_ocr()
        status = get_engine_status()
        self.assertTrue(status.initialized)
        self.assertTrue(status.model_ready)
        self.assertIsNone(status.error)

    def test_status_package_available(self):
        """Status should report package_available=True."""
        status = get_engine_status()
        self.assertTrue(status.package_available)

    def test_get_ocr_backend_returns_rapidocr(self):
        """get_ocr_backend should return 'rapidocr'."""
        initialize_ocr()
        backend = get_ocr_backend()
        self.assertEqual(backend, "rapidocr")

    def test_initialization_idempotent(self):
        """Multiple calls to initialize_ocr should not fail."""
        result1 = initialize_ocr()
        result2 = initialize_ocr()
        self.assertEqual(result1, result2)


class TestOCRStatus(unittest.TestCase):
    """Tests for truthful status reporting."""

    def test_status_has_required_fields(self):
        """Status should have all required fields."""
        status = get_engine_status()
        self.assertIsInstance(status, OCREngineStatus)
        self.assertIsNotNone(status.engine_name)
        self.assertIsInstance(status.package_available, bool)
        self.assertIsInstance(status.initialized, bool)
        self.assertIsInstance(status.model_ready, bool)

    def test_status_no_false_positives(self):
        """Status should not report initialized=True if package is missing."""
        # This test verifies the status model is truthful
        status = OCREngineStatus()
        # A fresh status should not claim initialization
        self.assertFalse(status.initialized)
        self.assertFalse(status.model_ready)


class TestOCRSelfTest(unittest.TestCase):
    """Tests for the OCR self-test."""

    def test_self_test_with_real_image(self):
        """Self-test with test_label.png should find text regions."""
        result = self_test()
        self.assertTrue(result["success"], f"Self-test failed: {result.get('error')}")
        self.assertGreater(result["regions_found"], 0)
        self.assertGreater(result["avg_confidence"], 0.5)
        self.assertGreater(len(result["sample_text"]), 0)

    def test_self_test_returns_all_fields(self):
        """Self-test should return all expected fields."""
        result = self_test()
        self.assertIn("engine", result)
        self.assertIn("initialized", result)
        self.assertIn("regions_found", result)
        self.assertIn("avg_confidence", result)
        self.assertIn("sample_text", result)
        self.assertIn("elapsed_seconds", result)
        self.assertIn("success", result)

    def test_self_test_engine_is_rapidocr(self):
        """Self-test should use RapidOCR."""
        result = self_test()
        self.assertEqual(result["engine"], "rapidocr")

    def test_self_test_with_nonexistent_image(self):
        """Self-test with missing image should report error."""
        result = self_test(image_path="/nonexistent/path.png")
        self.assertFalse(result["success"])
        self.assertIsNotNone(result["error"])


class TestOCRInference(unittest.TestCase):
    """Tests for OCR inference on images."""

    def test_run_ocr_on_test_image(self):
        """OCR should extract text from the test label image."""
        import cv2
        from services.ocr_engine import run_ocr

        test_path = Path(__file__).resolve().parent.parent / "uploads" / "test_label.png"
        if not test_path.exists():
            self.skipTest("test_label.png not found")

        img = cv2.imread(str(test_path))
        self.assertIsNotNone(img)

        result = run_ocr(img)
        self.assertEqual(result["backend"], "rapidocr")
        self.assertGreater(result["line_count"], 0)
        self.assertGreater(result["avg_confidence"], 0.5)
        self.assertIn("full_text", result)
        self.assertIn("lines", result)

    def test_run_ocr_returns_structured_output(self):
        """OCR output should have the expected structure."""
        import cv2
        from services.ocr_engine import run_ocr

        test_path = Path(__file__).resolve().parent.parent / "uploads" / "test_label.png"
        if not test_path.exists():
            self.skipTest("test_label.png not found")

        img = cv2.imread(str(test_path))
        result = run_ocr(img)

        self.assertIn("backend", result)
        self.assertIn("lines", result)
        self.assertIn("full_text", result)
        self.assertIn("line_count", result)
        self.assertIn("avg_confidence", result)

        # Check line structure
        if result["lines"]:
            line = result["lines"][0]
            self.assertIn("text", line)
            self.assertIn("confidence", line)
            self.assertIn("bbox", line)
            self.assertIsInstance(line["confidence"], float)
            self.assertIsInstance(line["bbox"], list)

    def test_run_ocr_without_initialization(self):
        """run_ocr should auto-initialize if not already done."""
        import cv2
        from services.ocr_engine import run_ocr

        # Reset engine state
        import services.ocr_engine as engine_module
        engine_module._engine = None
        engine_module._status = OCREngineStatus()

        test_path = Path(__file__).resolve().parent.parent / "uploads" / "test_label.png"
        if not test_path.exists():
            self.skipTest("test_label.png not found")

        img = cv2.imread(str(test_path))
        result = run_ocr(img)
        # Should auto-initialize and return results
        self.assertEqual(result["backend"], "rapidocr")


if __name__ == "__main__":
    unittest.main()
