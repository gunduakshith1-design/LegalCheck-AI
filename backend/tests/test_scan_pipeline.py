"""
Tests for the Scan Pipeline — OCR → Field Extraction → Rule Engine

Tests the end-to-end pipeline with real images and mock OCR data.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.scan_pipeline import analyze_image, _convert_ocr_to_input, _build_fields_summary
from services.ocr_service import preprocess_image
from services.rule_engine import OCRInput, TextRegion, RuleStatus, AggregateStatus


# ---------------------------------------------------------------------------
# Test: OCR Service
# ---------------------------------------------------------------------------

class TestOCRService(unittest.TestCase):
    """Tests for the OCR service layer."""

    def test_preprocess_image_none(self):
        """Preprocessing with 'none' should return original image."""
        from PIL import Image
        import io
        img = Image.new('RGB', (100, 100), 'black')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        result = preprocess_image(buf.getvalue(), level="none")
        self.assertEqual(result.shape, (100, 100, 3))

    def test_preprocess_image_standard(self):
        """Standard preprocessing should not crash."""
        from PIL import Image
        import io
        img = Image.new('RGB', (100, 100), 'white')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        result = preprocess_image(buf.getvalue(), level="standard")
        self.assertIsNotNone(result)

    def test_preprocess_invalid_bytes(self):
        """Invalid image bytes should raise ValueError."""
        with self.assertRaises(ValueError):
            preprocess_image(b"not an image", level="standard")


# ---------------------------------------------------------------------------
# Test: Pipeline Conversion
# ---------------------------------------------------------------------------

class TestPipelineConversion(unittest.TestCase):
    """Tests for OCR output → rule engine input conversion."""

    def test_convert_ocr_to_input(self):
        """Should convert OCR dict to OCRInput."""
        ocr_result = {
            "raw_text": "Hello World",
            "text_regions": [
                {"text": "Hello", "confidence": 0.95, "bbox": [[0,0],[50,0],[50,20],[0,20]]},
                {"text": "World", "confidence": 0.90, "bbox": [[0,25],[50,25],[50,45],[0,45]]},
            ],
            "average_confidence": 0.925,
        }
        ocr_input = _convert_ocr_to_input(ocr_result)
        self.assertIsInstance(ocr_input, OCRInput)
        self.assertEqual(len(ocr_input.text_regions), 2)
        self.assertEqual(ocr_input.text_regions[0].text, "Hello")

    def test_build_fields_summary(self):
        """Should build fields summary from rule results."""
        from services.rule_engine.models import RuleResult, RuleStatus

        results = [
            RuleResult(
                rule_id="MVP-A1",
                field="manufacturer_name",
                status=RuleStatus.DETECTED,
                observed_value="Test Corp",
                confidence=0.9,
                evidence=["Manufactured by Test Corp"],
                rule_reference="Rule 6(1)(a)",
                source_document="LM Rules 2011",
                source_version="2011",
                explanation="Detected",
                cannot_conclude=[],
                limitations=[],
            ),
        ]
        summary = _build_fields_summary(results)
        self.assertIn("manufacturer_name", summary)
        self.assertEqual(summary["manufacturer_name"]["value"], "Test Corp")
        self.assertEqual(summary["manufacturer_name"]["status"], "DETECTED")


# ---------------------------------------------------------------------------
# Test: Full Pipeline with Mock Image
# ---------------------------------------------------------------------------

class TestFullPipeline(unittest.TestCase):
    """Tests for the full scan pipeline."""

    def _create_test_image_bytes(self) -> bytes:
        """Create a synthetic test image."""
        from PIL import Image, ImageDraw, ImageFont
        import io

        img = Image.new('RGB', (800, 600), 'white')
        draw = ImageDraw.Draw(img)

        try:
            font = ImageFont.truetype('arial.ttf', 20)
        except OSError:
            font = ImageFont.load_default()

        y = 50
        draw.text((50, y), 'Manufactured by Test Corp Ltd.', fill='black', font=font)
        y += 40
        draw.text((50, y), 'Mumbai 400001', fill='black', font=font)
        y += 40
        draw.text((50, y), 'Net Wt. 500g', fill='black', font=font)
        y += 40
        draw.text((50, y), 'MRP Rs. 299 incl. of all taxes', fill='black', font=font)
        y += 40
        draw.text((50, y), 'Mfg Date: March 2024', fill='black', font=font)
        y += 40
        draw.text((50, y), 'Consumer Care: 1800-123-4567', fill='black', font=font)

        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return buf.getvalue()

    def test_pipeline_produces_result(self):
        """Pipeline should produce a valid result dict."""
        image_bytes = self._create_test_image_bytes()
        result = analyze_image(image_bytes, filename="test.png")

        self.assertEqual(result["status"], "completed")
        self.assertIn(result["overall_status"], [
            "NO_ISSUES_DETECTED",
            "POTENTIAL_NON_COMPLIANCE",
            "REVIEW_REQUIRED",
            "INSUFFICIENT_EVIDENCE",
        ])
        self.assertIsNotNone(result["ocr"])
        self.assertIsNotNone(result["rule_results"])
        self.assertEqual(len(result["rule_results"]), 10)

    def test_pipeline_has_all_rule_ids(self):
        """Result should contain all 6 rule IDs."""
        image_bytes = self._create_test_image_bytes()
        result = analyze_image(image_bytes, filename="test.png")

        rule_ids = {r["rule_id"] for r in result["rule_results"]}
        self.assertEqual(rule_ids, {"MVP-A1", "MVP-A2", "MVP-A3", "MVP-A4", "MVP-A5", "MVP-A6", "MVP-A7", "MVP-A8", "MVP-A9", "MVP-A10"})

    def test_pipeline_has_timing(self):
        """Result should include timing information."""
        image_bytes = self._create_test_image_bytes()
        result = analyze_image(image_bytes, filename="test.png")

        self.assertIn("timing", result)
        self.assertIn("total_seconds", result["timing"])
        self.assertGreater(result["timing"]["total_seconds"], 0)

    def test_pipeline_has_limitations(self):
        """Result should include limitations/notes."""
        image_bytes = self._create_test_image_bytes()
        result = analyze_image(image_bytes, filename="test.png")

        self.assertIn("limitations", result)
        self.assertGreater(len(result["limitations"]), 0)

    def test_pipeline_empty_image(self):
        """Pipeline should handle blank image gracefully."""
        from PIL import Image
        import io

        img = Image.new('RGB', (100, 100), 'white')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        image_bytes = buf.getvalue()

        result = analyze_image(image_bytes, filename="blank.png")
        # Should not crash
        self.assertIn(result["status"], ["completed", "no_text_detected"])

    def test_pipeline_invalid_bytes(self):
        """Pipeline should handle invalid image bytes."""
        result = analyze_image(b"not an image", filename="bad.png")
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["overall_status"], "REVIEW_REQUIRED")
        self.assertGreater(len(result["errors"]), 0)


# ---------------------------------------------------------------------------
# Test: No Compliance Claims
# ---------------------------------------------------------------------------

class TestNoComplianceClaims(unittest.TestCase):
    """Verify the pipeline never claims legal compliance."""

    def test_no_compliant_in_explanations(self):
        """No rule result should contain 'legally compliant'."""
        from PIL import Image, ImageDraw, ImageFont
        import io

        img = Image.new('RGB', (800, 600), 'white')
        draw = ImageDraw.Draw(img)
        try:
            font = ImageFont.truetype('arial.ttf', 20)
        except OSError:
            font = ImageFont.load_default()

        y = 50
        draw.text((50, y), 'Manufactured by Test Corp', fill='black', font=font)
        y += 40
        draw.text((50, y), 'Mumbai 400001', fill='black', font=font)
        y += 40
        draw.text((50, y), 'Net Wt. 500g', fill='black', font=font)
        y += 40
        draw.text((50, y), 'MRP Rs. 299', fill='black', font=font)
        y += 40
        draw.text((50, y), 'Mfg: Jan 2024', fill='black', font=font)
        y += 40
        draw.text((50, y), '18001234567', fill='black', font=font)

        buf = io.BytesIO()
        img.save(buf, format='PNG')

        result = analyze_image(buf.getvalue(), filename="test.png")

        for rule in result["rule_results"]:
            explanation = rule.get("explanation", "").lower()
            self.assertNotIn("legally compliant", explanation)
            # "legally registered" is acceptable — it says the system has NOT verified it
            self.assertNotIn("is legally compliant", explanation)


if __name__ == "__main__":
    unittest.main()
