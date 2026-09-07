"""
Unit Tests for the Rule Engine

Tests all 6 MVP rules with:
- Positive cases (field present)
- Missing-field cases (field absent)
- UNCERTAIN/low-confidence cases
- Edge cases

All tests are deterministic: same input → same output.
Uses unittest (no pytest dependency).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.rule_engine import (
    RuleEngine,
    OCRInput,
    TextRegion,
    RuleStatus,
    AggregateStatus,
)
from services.rule_engine.loader import get_rule_ids
from services.rule_engine.validators import extract_fields


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ocr(text_lines: list[tuple[str, float]]) -> OCRInput:
    """Helper to create OCRInput from a list of (text, confidence) tuples."""
    regions = [
        TextRegion(text=text, confidence=conf, bbox=[[0, 0], [100, 0], [100, 20], [0, 20]])
        for text, conf in text_lines
    ]
    raw_text = "\n".join(text for text, _ in text_lines)
    avg_conf = sum(conf for _, conf in text_lines) / len(text_lines) if text_lines else 0.0
    return OCRInput(raw_text=raw_text, text_regions=regions, average_confidence=avg_conf)


def _make_sourced_ocr(items: list[tuple[str, float, list[list[float]], str | None]]) -> OCRInput:
    """OCRInput with per-region bbox and panel source, for cross-region
    pairing tests (regions: text, confidence, bbox, source)."""
    regions = [
        TextRegion(text=text, confidence=conf, bbox=bbox, source=src)
        for text, conf, bbox, src in items
    ]
    raw_text = "\n".join(t for t, *_ in items)
    avg_conf = sum(c for _, c, *_ in items) / len(items) if items else 0.0
    return OCRInput(raw_text=raw_text, text_regions=regions, average_confidence=avg_conf)


RULES_DIR = Path(__file__).resolve().parent.parent.parent / "rules"


# ---------------------------------------------------------------------------
# Test: Rule Discovery
# ---------------------------------------------------------------------------

class TestRuleDiscovery(unittest.TestCase):
    """Test that the engine discovers all 6 MVP rules."""

    def setUp(self):
        self.engine = RuleEngine(RULES_DIR)

    def test_all_ten_rules_loaded(self):
        self.assertEqual(len(self.engine.rules), 10)

    def test_rule_ids_match_index(self):
        ids = get_rule_ids(RULES_DIR)
        self.assertEqual(ids, ["MVP-A1", "MVP-A2", "MVP-A3", "MVP-A4", "MVP-A5", "MVP-A6", "MVP-A7", "MVP-A8", "MVP-A9", "MVP-A10"])

    def test_rules_by_id_lookup(self):
        for rule_id in ["MVP-A1", "MVP-A2", "MVP-A3", "MVP-A4", "MVP-A5", "MVP-A6", "MVP-A7", "MVP-A8", "MVP-A9", "MVP-A10"]:
            self.assertIn(rule_id, self.engine.rules_by_id)

    def test_rule_fields(self):
        expected = {
            "MVP-A1": "manufacturer_name",
            "MVP-A2": "net_quantity",
            "MVP-A3": "mrp",
            "MVP-A4": "date_of_manufacture",
            "MVP-A5": "consumer_care_phone",
            "MVP-A6": "manufacturer_address",
            "MVP-A7": "common_name",
            "MVP-A8": "country_of_origin",
            "MVP-A9": "best_before_date",
            "MVP-A10": "consumer_care_email",
        }
        for rule_id, field_name in expected.items():
            rule = self.engine.rules_by_id[rule_id]
            self.assertEqual(rule.field, field_name)

    def test_rule_set_version_is_v1_1(self):
        self.assertEqual(self.engine.rule_set_version, "v1.1")


# ---------------------------------------------------------------------------
# Test: MVP-A1 — Manufacturer Name
# ---------------------------------------------------------------------------

class TestMVP_A1(unittest.TestCase):
    """Tests for manufacturer/packer/importer name detection."""

    def setUp(self):
        self.engine = RuleEngine(RULES_DIR)

    def test_detected_with_qualifier(self):
        ocr = _make_ocr([
            ("Manufactured by Tata Consumer Products Ltd.", 0.95),
            ("Net Wt. 500g", 0.90),
        ])
        result = self.engine.evaluate_single("MVP-A1", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)
        self.assertIn("Tata Consumer Products", result.observed_value)

    def test_detected_packed_by(self):
        ocr = _make_ocr([
            ("Packed by: Hindustan Unilever Ltd.", 0.92),
        ])
        result = self.engine.evaluate_single("MVP-A1", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)

    def test_not_detected_no_qualifier(self):
        ocr = _make_ocr([
            ("Premium Green Tea", 0.90),
            ("100g net", 0.85),
        ])
        result = self.engine.evaluate_single("MVP-A1", ocr)
        self.assertEqual(result.status, RuleStatus.NOT_DETECTED)

    def test_detected_company_pattern(self):
        ocr = _make_ocr([
            ("ABC Foods Pvt. Ltd.", 0.88),
            ("Delhi 110001", 0.85),
        ])
        result = self.engine.evaluate_single("MVP-A1", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)

    def test_no_compliance_claim(self):
        ocr = _make_ocr([
            ("Manufactured by Some Company Pvt. Ltd.", 0.95),
        ])
        result = self.engine.evaluate_single("MVP-A1", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)
        self.assertNotIn("compliant", result.explanation.lower())


# ---------------------------------------------------------------------------
# Test: MVP-A2 — Net Quantity
# ---------------------------------------------------------------------------

class TestMVP_A2(unittest.TestCase):
    """Tests for net quantity detection."""

    def setUp(self):
        self.engine = RuleEngine(RULES_DIR)

    def test_detected_grams(self):
        ocr = _make_ocr([("Net Wt. 500g", 0.92)])
        result = self.engine.evaluate_single("MVP-A2", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)
        self.assertIn("500g", result.observed_value)

    def test_detected_millilitres(self):
        ocr = _make_ocr([("Net Quantity: 250 ml", 0.90)])
        result = self.engine.evaluate_single("MVP-A2", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)
        self.assertIn("250 ml", result.observed_value)

    def test_detected_kilograms(self):
        ocr = _make_ocr([("Net Weight 2 kg", 0.88)])
        result = self.engine.evaluate_single("MVP-A2", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)

    def test_not_detected(self):
        ocr = _make_ocr([
            ("Premium Green Tea", 0.90),
            ("Best Quality", 0.85),
        ])
        result = self.engine.evaluate_single("MVP-A2", ocr)
        self.assertEqual(result.status, RuleStatus.NOT_DETECTED)

    def test_non_si_detected(self):
        ocr = _make_ocr([("Net Wt. 16 oz", 0.90)])
        result = self.engine.evaluate_single("MVP-A2", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)


# ---------------------------------------------------------------------------
# Test: MVP-A3 — MRP
# ---------------------------------------------------------------------------

class TestMVP_A3(unittest.TestCase):
    """Tests for MRP detection."""

    def setUp(self):
        self.engine = RuleEngine(RULES_DIR)

    def test_detected_standard(self):
        ocr = _make_ocr([("MRP Rs. 299.00", 0.94)])
        result = self.engine.evaluate_single("MVP-A3", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)
        self.assertIn("299", result.observed_value)

    def test_detected_with_inclusive(self):
        ocr = _make_ocr([("MRP Rs. 450 incl. of all taxes", 0.92)])
        result = self.engine.evaluate_single("MVP-A3", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)

    def test_detected_max_retail_price(self):
        ocr = _make_ocr([("Maximum Retail Price Rs. 199", 0.90)])
        result = self.engine.evaluate_single("MVP-A3", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)

    def test_not_detected(self):
        ocr = _make_ocr([
            ("Premium Tea", 0.90),
            ("100g", 0.85),
        ])
        result = self.engine.evaluate_single("MVP-A3", ocr)
        self.assertEqual(result.status, RuleStatus.NOT_DETECTED)

    def test_uncertain_keyword_only(self):
        ocr = _make_ocr([
            ("MRP", 0.80),
            ("See price at store", 0.75),
        ])
        result = self.engine.evaluate_single("MVP-A3", ocr)
        self.assertEqual(result.status, RuleStatus.UNCERTAIN)

    def test_no_compliance_claim(self):
        ocr = _make_ocr([("MRP Rs. 299.00 incl. of all taxes", 0.95)])
        result = self.engine.evaluate_single("MVP-A3", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)
        # Explanation should mention "not verified" or "observation"
        self.assertTrue(
            "not verified" in result.explanation.lower()
            or "observation" in result.explanation.lower()
            or "has not verified" in result.explanation.lower()
        )


# ---------------------------------------------------------------------------
# Test: MVP-A4 — Date of Manufacture
# ---------------------------------------------------------------------------

class TestMVP_A4(unittest.TestCase):
    """Tests for date of manufacture detection."""

    def setUp(self):
        self.engine = RuleEngine(RULES_DIR)

    def test_detected_month_year(self):
        ocr = _make_ocr([("Mfg Date: March 2024", 0.88)])
        result = self.engine.evaluate_single("MVP-A4", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)
        self.assertIn("March 2024", result.observed_value)

    def test_detected_numeric_date(self):
        ocr = _make_ocr([("03/2024", 0.85)])
        result = self.engine.evaluate_single("MVP-A4", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)

    def test_detected_abbreviated(self):
        ocr = _make_ocr([("Mfd. Jan 2025", 0.90)])
        result = self.engine.evaluate_single("MVP-A4", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)

    def test_not_detected(self):
        ocr = _make_ocr([("Premium Tea", 0.90)])
        result = self.engine.evaluate_single("MVP-A4", ocr)
        self.assertEqual(result.status, RuleStatus.NOT_DETECTED)

    def test_uncertain_keyword_only(self):
        ocr = _make_ocr([("Batch: AB123", 0.80)])
        result = self.engine.evaluate_single("MVP-A4", ocr)
        self.assertEqual(result.status, RuleStatus.UNCERTAIN)


# ---------------------------------------------------------------------------
# Test: MVP-A5 — Consumer Care Phone
# ---------------------------------------------------------------------------

class TestMVP_A5(unittest.TestCase):
    """Tests for consumer care phone number detection."""

    def setUp(self):
        self.engine = RuleEngine(RULES_DIR)

    def test_detected_with_context(self):
        ocr = _make_ocr([("Consumer Care: 1800-123-4567", 0.91)])
        result = self.engine.evaluate_single("MVP-A5", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)

    def test_detected_mobile(self):
        ocr = _make_ocr([("Contact: +91 9876543210", 0.89)])
        result = self.engine.evaluate_single("MVP-A5", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)

    def test_detected_landline(self):
        ocr = _make_ocr([("Helpline: 011-23456789", 0.87)])
        result = self.engine.evaluate_single("MVP-A5", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)

    def test_not_detected(self):
        ocr = _make_ocr([
            ("Premium Tea", 0.90),
            ("100g", 0.85),
        ])
        result = self.engine.evaluate_single("MVP-A5", ocr)
        self.assertEqual(result.status, RuleStatus.NOT_DETECTED)


# ---------------------------------------------------------------------------
# Test: MVP-A6 — Manufacturer Address
# ---------------------------------------------------------------------------

class TestMVP_A6(unittest.TestCase):
    """Tests for manufacturer address detection."""

    def setUp(self):
        self.engine = RuleEngine(RULES_DIR)

    def test_detected_with_pin(self):
        ocr = _make_ocr([
            ("Manufactured by ABC Ltd.", 0.95),
            ("Mumbai 400001", 0.90),
        ])
        result = self.engine.evaluate_single("MVP-A6", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)
        self.assertIn("400001", result.observed_value)

    def test_detected_with_city_state(self):
        ocr = _make_ocr([
            ("Packed by: XYZ Foods", 0.92),
            ("Gurgaon, Haryana", 0.88),
        ])
        result = self.engine.evaluate_single("MVP-A6", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)

    def test_not_detected(self):
        ocr = _make_ocr([
            ("Premium Tea", 0.90),
            ("Net Wt. 100g", 0.85),
        ])
        result = self.engine.evaluate_single("MVP-A6", ocr)
        self.assertEqual(result.status, RuleStatus.NOT_DETECTED)


# ---------------------------------------------------------------------------
# Test: Full Engine Evaluation
# ---------------------------------------------------------------------------

class TestFullEvaluation(unittest.TestCase):
    """Tests for complete engine evaluation with aggregate status."""

    def setUp(self):
        self.engine = RuleEngine(RULES_DIR)

    def test_complete_product_no_issues(self):
        ocr = _make_ocr([
            ("Manufactured by Tata Consumer Products Ltd.", 0.95),
            ("Address: Kolkata 700001, West Bengal", 0.90),
            ("Net Wt. 500g", 0.92),
            ("MRP Rs. 299.00 incl. of all taxes", 0.94),
            ("Mfg Date: March 2024", 0.88),
            ("Consumer Care: 1800-123-4567", 0.91),
            ("Premium LED Bulb", 0.90),
        ])
        report = self.engine.evaluate(ocr)
        # With 10 rules: 6 detected + 1 common name detected + 2 NOT_APPLICABLE (domestic + non-perishable) + 1 NOT_DETECTED (email)
        self.assertEqual(report.aggregate_status, AggregateStatus.NO_ISSUES_DETECTED)
        self.assertEqual(report.detected_count, 7)
        self.assertEqual(report.not_detected_count, 1)  # email optional
        self.assertEqual(report.not_applicable_count, 2)  # country of origin + best before

    def test_domestic_product_country_origin_not_applicable(self):
        """Domestic product should return NOT_APPLICABLE for country of origin."""
        ocr = _make_ocr([
            ("Manufactured by Tata Consumer Products Ltd.", 0.95),
            ("Mumbai 400001", 0.90),
            ("Net Wt. 500g", 0.92),
            ("MRP Rs. 299.00", 0.94),
            ("Mfg Date: March 2024", 0.88),
            ("Consumer Care: 1800-123-4567", 0.91),
            ("Premium Biscuits", 0.90),
        ])
        report = self.engine.evaluate(ocr)
        coo_result = next(r for r in report.rule_results if r.rule_id == "MVP-A8")
        self.assertEqual(coo_result.status, RuleStatus.NOT_APPLICABLE)

    def test_imported_product_country_origin_detected(self):
        """Imported product with origin should return DETECTED."""
        ocr = _make_ocr([
            ("Manufactured by Global Corp", 0.95),
            ("Imported by: ABC Trading Co.", 0.90),
            ("Country of Origin: China", 0.88),
            ("Net Wt. 500g", 0.92),
            ("MRP Rs. 299.00", 0.94),
            ("Mfg Date: March 2024", 0.88),
            ("Consumer Care: 1800-123-4567", 0.91),
        ])
        report = self.engine.evaluate(ocr)
        coo_result = next(r for r in report.rule_results if r.rule_id == "MVP-A8")
        self.assertEqual(coo_result.status, RuleStatus.DETECTED)
        self.assertIn("China", coo_result.observed_value)

    def test_imported_product_without_origin_not_detected(self):
        """Imported product without origin should return NOT_DETECTED."""
        ocr = _make_ocr([
            ("Imported by: ABC Trading Co.", 0.90),
            ("Net Wt. 500g", 0.92),
            ("MRP Rs. 299.00", 0.94),
        ])
        report = self.engine.evaluate(ocr)
        coo_result = next(r for r in report.rule_results if r.rule_id == "MVP-A8")
        self.assertIn(coo_result.status, [RuleStatus.NOT_DETECTED, RuleStatus.UNCERTAIN])

    def test_perishable_product_best_before_detected(self):
        """Food product with best before should return DETECTED."""
        ocr = _make_ocr([
            ("Manufactured by Food Corp", 0.95),
            ("Tea Bags", 0.90),
            ("Net Wt. 250g", 0.92),
            ("MRP Rs. 150.00", 0.94),
            ("Best Before: 12 Months from Mfg", 0.88),
            ("Consumer Care: 1800-123-4567", 0.91),
        ])
        report = self.engine.evaluate(ocr)
        bb_result = next(r for r in report.rule_results if r.rule_id == "MVP-A9")
        self.assertEqual(bb_result.status, RuleStatus.DETECTED)

    def test_non_perishable_product_best_before_not_applicable(self):
        """Non-perishable product should return NOT_APPLICABLE for best before."""
        ocr = _make_ocr([
            ("Manufactured by Steel Corp", 0.95),
            ("Stainless Steel Utensil", 0.90),
            ("Net Wt. 800g", 0.92),
            ("MRP Rs. 599.00", 0.94),
        ])
        report = self.engine.evaluate(ocr)
        bb_result = next(r for r in report.rule_results if r.rule_id == "MVP-A9")
        self.assertEqual(bb_result.status, RuleStatus.NOT_APPLICABLE)

    def test_missing_fields_potential_non_compliance(self):
        ocr = _make_ocr([
            ("Premium Green Tea", 0.90),
            ("Net Wt. 100g", 0.85),
            ("MRP Rs. 150", 0.88),
            ("Best Before: Dec 2025", 0.80),
        ])
        report = self.engine.evaluate(ocr)
        self.assertEqual(report.aggregate_status, AggregateStatus.POTENTIAL_NON_COMPLIANCE)
        self.assertGreater(report.not_detected_count, 0)

    def test_minimal_product_non_compliance(self):
        ocr = _make_ocr([
            ("Colgate Total", 0.95),
            ("Advanced Clean", 0.90),
        ])
        report = self.engine.evaluate(ocr)
        self.assertEqual(report.aggregate_status, AggregateStatus.POTENTIAL_NON_COMPLIANCE)
        self.assertGreaterEqual(report.not_detected_count, 4)

    def test_report_contains_all_rule_results(self):
        ocr = _make_ocr([
            ("Manufactured by Test Corp", 0.90),
            ("Mumbai 400001", 0.85),
            ("Net Wt. 100g", 0.88),
            ("MRP Rs. 99", 0.90),
            ("Mfg: Jan 2024", 0.82),
            ("18001234567", 0.80),
        ])
        report = self.engine.evaluate(ocr)
        self.assertEqual(len(report.rule_results), 10)
        rule_ids = {r.rule_id for r in report.rule_results}
        self.assertEqual(rule_ids, {"MVP-A1", "MVP-A2", "MVP-A3", "MVP-A4", "MVP-A5", "MVP-A6", "MVP-A7", "MVP-A8", "MVP-A9", "MVP-A10"})

    def test_report_notes_present(self):
        ocr = _make_ocr([
            ("Manufactured by Test Corp", 0.90),
            ("Net Wt. 100g", 0.88),
            ("MRP Rs. 99", 0.90),
            ("Mfg: Jan 2024", 0.82),
            ("Mumbai 400001", 0.85),
            ("18001234567", 0.80),
        ])
        report = self.engine.evaluate(ocr)
        self.assertGreater(len(report.notes), 0)

    def test_report_to_dict(self):
        ocr = _make_ocr([
            ("Manufactured by Test Corp", 0.90),
            ("Net Wt. 100g", 0.88),
            ("MRP Rs. 99", 0.90),
            ("Mfg: Jan 2024", 0.82),
            ("Mumbai 400001", 0.85),
            ("18001234567", 0.80),
        ])
        report = self.engine.evaluate(ocr)
        d = report.to_dict()
        self.assertIsInstance(d, dict)
        self.assertIn("aggregate_status", d)
        self.assertIn("summary", d)
        self.assertIn("rule_results", d)
        self.assertEqual(d["summary"]["total_rules"], 10)
        self.assertEqual(d["rule_set_version"], "v1.1")

    def test_deterministic_output(self):
        ocr = _make_ocr([
            ("Manufactured by Test Corp", 0.90),
            ("Net Wt. 100g", 0.88),
            ("MRP Rs. 99", 0.90),
            ("Mfg: Jan 2024", 0.82),
            ("Mumbai 400001", 0.85),
            ("18001234567", 0.80),
        ])
        report1 = self.engine.evaluate(ocr)
        report2 = self.engine.evaluate(ocr)
        self.assertEqual(report1.aggregate_status, report2.aggregate_status)
        for r1, r2 in zip(report1.rule_results, report2.rule_results):
            self.assertEqual(r1.status, r2.status)
            self.assertEqual(r1.observed_value, r2.observed_value)


# ---------------------------------------------------------------------------
# Test: Edge Cases
# ---------------------------------------------------------------------------

class TestEdgeCases(unittest.TestCase):
    """Tests for edge cases and error handling."""

    def setUp(self):
        self.engine = RuleEngine(RULES_DIR)

    def test_empty_ocr_input(self):
        ocr = OCRInput(raw_text="", text_regions=[], average_confidence=0.0)
        report = self.engine.evaluate(ocr)
        self.assertEqual(report.aggregate_status, AggregateStatus.POTENTIAL_NON_COMPLIANCE)
        self.assertEqual(report.not_detected_count, 8)  # 6 mandatory + common_name + email
        self.assertEqual(report.not_applicable_count, 2)  # country of origin + best before

    def test_brand_only_label_common_name_uncertain(self):
        """A label with only brand names should return UNCERTAIN for common name."""
        ocr = _make_ocr([
            ("Colgate MaxFresh", 0.95),
            ("Advanced Clean", 0.90),
            ("Manufactured by Colgate-Palmolive", 0.88),
        ])
        result = self.engine.evaluate_single("MVP-A7", ocr)
        # Brand names without clear generic descriptor
        self.assertIn(result.status, [RuleStatus.NOT_DETECTED, RuleStatus.UNCERTAIN])

    def test_single_region(self):
        ocr = _make_ocr([("MRP Rs. 100", 0.80)])
        report = self.engine.evaluate(ocr)
        self.assertGreaterEqual(report.detected_count, 1)

    def test_nonexistent_rule_id(self):
        ocr = _make_ocr([("test", 0.9)])
        with self.assertRaises(ValueError):
            self.engine.evaluate_single("MVP-X99", ocr)

    def test_unicode_in_text(self):
        ocr = _make_ocr([
            ("Manufactured by ₹ Foods Pvt. Ltd.", 0.85),
            ("MRP ₹199", 0.88),
        ])
        report = self.engine.evaluate(ocr)
        self.assertIsNotNone(report.aggregate_status)

    def test_very_long_text(self):
        long_text = "A" * 10000
        ocr = _make_ocr([
            (long_text, 0.5),
            ("Manufactured by Test Corp", 0.9),
            ("Mumbai 400001", 0.85),
            ("Net Wt. 100g", 0.88),
            ("MRP Rs. 99", 0.90),
            ("Mfg: Jan 2024", 0.82),
            ("18001234567", 0.80),
        ])
        report = self.engine.evaluate(ocr)
        self.assertIsNotNone(report.aggregate_status)


# ---------------------------------------------------------------------------
# Test: Split-region pairing (golden cases from real deployed scan 60e6ef94)
# ---------------------------------------------------------------------------
# A real packaged-product back panel renders its declarations as a table:
# the keyword ("MRP/USP", "MFG/EXPDate") sits in a header region and the
# value ("180.00[R0.54/g]", "21.07.26/20.07.27") in the region below it.
# Before the pairing fix these produced UNCERTAIN for MVP-A3/A4/A9.

class TestSplitRegionPairing(unittest.TestCase):
    """Cross-region keyword/value pairing for MVP-A3, MVP-A4, MVP-A9."""

    def setUp(self):
        self.engine = RuleEngine(RULES_DIR)

    # Approximate geometry of the real back panel (three table columns with
    # values below each header).
    KW_BB = [[266, 150], [368, 150], [368, 170], [266, 170]]      # MFG/EXPDate header
    DATE_BB = [[258, 316], [388, 316], [388, 336], [258, 336]]    # dates below it
    MRP_BB = [[398, 150], [498, 150], [498, 170], [398, 170]]     # MRP/USP header
    VALUE_BB = [[390, 300], [512, 300], [512, 324], [390, 324]]   # 180.00 below it
    LOT_BB = [[530, 150], [610, 150], [610, 170], [530, 170]]     # Lot No. header
    LOT_VAL_BB = [[540, 316], [614, 316], [614, 336], [540, 336]] # lot code below it

    def _back_panel_ocr(self):
        return _make_sourced_ocr([
            ("MFG/EXPDate", 0.86, self.KW_BB, "Back"),
            ("21.07.26/20.07.27", 0.88, self.DATE_BB, "Back"),
            ("MRP/USP", 0.86, self.MRP_BB, "Back"),
            ("180.00[R0.54/g]", 0.85, self.VALUE_BB, "Back"),
            ("Lot No.", 0.80, self.LOT_BB, "Back"),
            ("GB221:30", 0.83, self.LOT_VAL_BB, "Back"),
        ])

    # --- MVP-A3: MRP keyword/value split across regions ---

    def test_a3_detected_split_regions_real_scan(self):
        result = self.engine.evaluate_single("MVP-A3", self._back_panel_ocr())
        self.assertEqual(result.status, RuleStatus.DETECTED)
        self.assertIn("180.00", result.observed_value)

    def test_a3_unit_price_not_mrp(self):
        ocr = _make_sourced_ocr([
            ("MRP/USP", 0.86, self.MRP_BB, "Back"),
            ("R0.54/g", 0.85, self.VALUE_BB, "Back"),
        ])
        result = self.engine.evaluate_single("MVP-A3", ocr)
        self.assertEqual(result.status, RuleStatus.UNCERTAIN)

    def test_a3_weight_not_mrp(self):
        ocr = _make_sourced_ocr([
            ("MRP/USP", 0.86, self.MRP_BB, "Back"),
            ("336g", 0.83, self.VALUE_BB, "Back"),
        ])
        result = self.engine.evaluate_single("MVP-A3", ocr)
        self.assertEqual(result.status, RuleStatus.UNCERTAIN)

    def test_a3_bare_integer_not_mrp(self):
        ocr = _make_sourced_ocr([
            ("MRP/USP", 0.86, self.MRP_BB, "Back"),
            ("21", 0.66, self.VALUE_BB, "Back"),
        ])
        result = self.engine.evaluate_single("MVP-A3", ocr)
        self.assertEqual(result.status, RuleStatus.UNCERTAIN)

    def test_a3_lot_code_not_mrp(self):
        result = self.engine.evaluate_single("MVP-A3", self._back_panel_ocr())
        self.assertIsNotNone(result.observed_value)
        self.assertNotIn("221", result.observed_value)
        self.assertNotIn("30", result.observed_value.split("."))

    def test_a3_no_keyword_no_pairing(self):
        ocr = _make_sourced_ocr([
            ("NET WEIGHT", 0.83, self.MRP_BB, "Back"),
            ("336g", 0.83, self.VALUE_BB, "Back"),
            ("180.00[R0.54/g]", 0.85, self.LOT_VAL_BB, "Back"),
        ])
        result = self.engine.evaluate_single("MVP-A3", ocr)
        self.assertEqual(result.status, RuleStatus.NOT_DETECTED)

    def test_a3_cross_panel_region_not_paired(self):
        ocr = _make_sourced_ocr([
            ("MRP/USP", 0.86, self.MRP_BB, "Back"),
            # Only acceptable via the cross-region pass (no in-region
            # currency marker), so this isolates the same-panel rule.
            ("180.00[R0.54/g]", 0.85, self.VALUE_BB, "Front"),
        ])
        result = self.engine.evaluate_single("MVP-A3", ocr)
        self.assertEqual(result.status, RuleStatus.UNCERTAIN)

    def test_a3_in_region_still_detected(self):
        ocr = _make_sourced_ocr([
            ("MRP Rs. 299.00", 0.94, self.MRP_BB, "Back"),
            ("180.00[R0.54/g]", 0.85, self.VALUE_BB, "Back"),
        ])
        result = self.engine.evaluate_single("MVP-A3", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)
        self.assertIn("299", result.observed_value)

    # --- MVP-A4: dot-separated DMY / MM.YYYY dates ---

    def test_a4_detected_dot_dmy_real_scan(self):
        result = self.engine.evaluate_single("MVP-A4", self._back_panel_ocr())
        self.assertEqual(result.status, RuleStatus.DETECTED)
        self.assertIn("21.07.26", result.observed_value)

    def test_a4_detected_mm_yyyy_dot(self):
        ocr = _make_ocr([("Batch: 07.2026", 0.85)])
        result = self.engine.evaluate_single("MVP-A4", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)
        self.assertIn("07.2026", result.observed_value)

    def test_a4_price_region_not_a_date(self):
        ocr = _make_ocr([("180.00[R0.54/g]", 0.85)])
        result = self.engine.evaluate_single("MVP-A4", ocr)
        self.assertEqual(result.status, RuleStatus.NOT_DETECTED)

    def test_a4_slash_format_still_detected(self):
        ocr = _make_ocr([("Mfg: 12/05/2026", 0.90)])
        result = self.engine.evaluate_single("MVP-A4", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)

    def test_a4_month_name_still_detected(self):
        ocr = _make_ocr([("Mfg Date: March 2024", 0.88)])
        result = self.engine.evaluate_single("MVP-A4", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)

    # --- MVP-A9: EXP header + split date regions (applicability unchanged) ---

    def test_a9_detected_exp_split_regions_real_scan(self):
        ocr = _make_sourced_ocr([
            ("Choco Pie", 0.90, [[40, 40], [200, 40], [200, 70], [40, 70]], "Back"),
            ("Sugar", 0.90, [[40, 80], [120, 80], [120, 100], [40, 100]], "Back"),
            ("MFG/EXPDate", 0.86, self.KW_BB, "Back"),
            ("21.07.26/20.07.27", 0.88, self.DATE_BB, "Back"),
        ])
        result = self.engine.evaluate_single("MVP-A9", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)
        self.assertIn("20.07.27", result.observed_value)

    def test_a9_detected_exp_inline(self):
        ocr = _make_ocr([
            ("Sugar", 0.90),
            ("EXP: 20.07.27", 0.88),
        ])
        result = self.engine.evaluate_single("MVP-A9", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)

    def test_a9_non_perishable_still_not_applicable(self):
        ocr = _make_ocr([
            ("Stainless Steel Utensil", 0.90),
            ("MFG/EXPDate", 0.86),
            ("21.07.26/20.07.27", 0.88),
        ])
        result = self.engine.evaluate_single("MVP-A9", ocr)
        self.assertEqual(result.status, RuleStatus.NOT_APPLICABLE)

    def test_a9_perishable_without_any_date_still_uncertain(self):
        ocr = _make_ocr([
            ("Sugar", 0.90),
            ("MFG/EXPDate", 0.86),
            ("See pack for details", 0.80),
        ])
        result = self.engine.evaluate_single("MVP-A9", ocr)
        self.assertEqual(result.status, RuleStatus.UNCERTAIN)

    def test_a9_best_before_combined_still_detected(self):
        ocr = _make_ocr([
            ("Tea Bags", 0.90),
            ("Best Before: 12 Months from Mfg", 0.88),
        ])
        result = self.engine.evaluate_single("MVP-A9", ocr)
        self.assertEqual(result.status, RuleStatus.DETECTED)

    # --- Full evaluation on the real back panel ---

    def test_full_evaluation_real_back_panel(self):
        report = self.engine.evaluate(self._back_panel_ocr())
        by_id = {r.rule_id: r for r in report.rule_results}
        self.assertEqual(by_id["MVP-A3"].status, RuleStatus.DETECTED)
        self.assertEqual(by_id["MVP-A4"].status, RuleStatus.DETECTED)
        # A9 needs a perishable indicator; the bare back panel has none
        self.assertEqual(by_id["MVP-A9"].status, RuleStatus.NOT_APPLICABLE)


if __name__ == "__main__":
    unittest.main()
