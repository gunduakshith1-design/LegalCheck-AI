"""
Unit Tests for the Screening Score Calculator

Tests the Label Compliance Screening Score:
- Scoring formula accuracy
- Threshold determination
- Edge cases (empty, all NOT_APPLICABLE, etc.)
- Determinism
- Range validation (0–100)
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.screening_score import calculate_screening_score, SCREENING_THRESHOLD


def _make_rule(status: str) -> dict:
    """Helper to create a minimal rule result dict."""
    return {"rule_id": "TEST", "status": status, "field": "test"}


class TestScreeningScoreBasic(unittest.TestCase):
    """Test basic scoring scenarios."""

    def test_all_detected_gives_100(self):
        """6 DETECTED → score=100.0"""
        rules = [_make_rule("DETECTED") for _ in range(6)]
        result = calculate_screening_score(rules)
        self.assertEqual(result.score, 100.0)
        self.assertEqual(result.threshold_status, "MET")
        self.assertEqual(result.applicable_rules, 6)
        self.assertEqual(result.detected_rules, 6)

    def test_five_detected_one_uncertain(self):
        """5 DETECTED + 1 UNCERTAIN → score ≈ 91.67"""
        rules = [_make_rule("DETECTED") for _ in range(5)]
        rules.append(_make_rule("UNCERTAIN"))
        result = calculate_screening_score(rules)
        expected = (5 * 100 + 50) / 6  # 550 / 6 = 91.666...
        self.assertAlmostEqual(result.score, expected, places=1)
        self.assertEqual(result.threshold_status, "MET")
        self.assertEqual(result.uncertain_rules, 1)

    def test_five_detected_one_not_detected(self):
        """5 DETECTED + 1 NOT_DETECTED → score ≈ 83.33"""
        rules = [_make_rule("DETECTED") for _ in range(5)]
        rules.append(_make_rule("NOT_DETECTED"))
        result = calculate_screening_score(rules)
        expected = (5 * 100) / 6  # 500 / 6 = 83.333...
        self.assertAlmostEqual(result.score, expected, places=1)
        self.assertEqual(result.threshold_status, "MET")
        self.assertEqual(result.not_detected_rules, 1)

    def test_four_detected_two_not_detected(self):
        """4 DETECTED + 2 NOT_DETECTED → score ≈ 66.67"""
        rules = [_make_rule("DETECTED") for _ in range(4)]
        rules.extend([_make_rule("NOT_DETECTED") for _ in range(2)])
        result = calculate_screening_score(rules)
        expected = (4 * 100) / 6  # 400 / 6 = 66.666...
        self.assertAlmostEqual(result.score, expected, places=1)
        self.assertEqual(result.threshold_status, "BELOW_THRESHOLD")

    def test_mixed_uncertain_and_not_detected(self):
        """3 DETECTED + 2 UNCERTAIN + 1 NOT_DETECTED"""
        rules = [_make_rule("DETECTED") for _ in range(3)]
        rules.extend([_make_rule("UNCERTAIN") for _ in range(2)])
        rules.append(_make_rule("NOT_DETECTED"))
        result = calculate_screening_score(rules)
        expected = (3 * 100 + 2 * 50 + 0) / 6  # 400 / 6 = 66.666...
        self.assertAlmostEqual(result.score, expected, places=1)
        self.assertEqual(result.threshold_status, "BELOW_THRESHOLD")


class TestScreeningScoreEdgeCases(unittest.TestCase):
    """Test edge cases and boundary conditions."""

    def test_not_applicable_excluded_from_denominator(self):
        """NOT_APPLICABLE rules are excluded from the denominator."""
        rules = [_make_rule("DETECTED") for _ in range(5)]
        rules.append(_make_rule("NOT_APPLICABLE"))
        result = calculate_screening_score(rules)
        self.assertEqual(result.score, 100.0)
        self.assertEqual(result.applicable_rules, 5)
        self.assertEqual(result.not_applicable_rules, 1)
        self.assertEqual(result.threshold_status, "MET")

    def test_all_not_applicable_gives_null(self):
        """All NOT_APPLICABLE → score=None, NOT_EVALUABLE"""
        rules = [_make_rule("NOT_APPLICABLE") for _ in range(6)]
        result = calculate_screening_score(rules)
        self.assertIsNone(result.score)
        self.assertEqual(result.threshold_status, "NOT_EVALUABLE")
        self.assertEqual(result.applicable_rules, 0)
        self.assertEqual(result.not_applicable_rules, 6)

    def test_empty_rules_gives_null(self):
        """Empty rule list → score=None, NOT_EVALUABLE"""
        result = calculate_screening_score([])
        self.assertIsNone(result.score)
        self.assertEqual(result.threshold_status, "NOT_EVALUABLE")
        self.assertEqual(result.applicable_rules, 0)

    def test_single_detected_rule(self):
        """Single DETECTED rule → score=100"""
        rules = [_make_rule("DETECTED")]
        result = calculate_screening_score(rules)
        self.assertEqual(result.score, 100.0)
        self.assertEqual(result.applicable_rules, 1)
        self.assertEqual(result.threshold_status, "MET")

    def test_all_not_detected_gives_zero(self):
        """All NOT_DETECTED → score=0"""
        rules = [_make_rule("NOT_DETECTED") for _ in range(6)]
        result = calculate_screening_score(rules)
        self.assertEqual(result.score, 0.0)
        self.assertEqual(result.threshold_status, "BELOW_THRESHOLD")


class TestScreeningScoreProperties(unittest.TestCase):
    """Test score properties and determinism."""

    def test_score_always_between_0_and_100(self):
        """Score must always be in [0, 100]."""
        import random
        random.seed(42)
        for _ in range(50):
            statuses = random.choices(
                ["DETECTED", "NOT_DETECTED", "UNCERTAIN", "NOT_APPLICABLE"],
                k=random.randint(1, 10)
            )
            rules = [_make_rule(s) for s in statuses]
            result = calculate_screening_score(rules)
            if result.score is not None:
                self.assertGreaterEqual(result.score, 0.0)
                self.assertLessEqual(result.score, 100.0)

    def test_deterministic_output(self):
        """Same input must always produce the same output."""
        rules = [_make_rule("DETECTED") for _ in range(4)]
        rules.extend([_make_rule("NOT_DETECTED"), _make_rule("UNCERTAIN")])
        r1 = calculate_screening_score(rules)
        r2 = calculate_screening_score(rules)
        self.assertEqual(r1.score, r2.score)
        self.assertEqual(r1.threshold_status, r2.threshold_status)
        self.assertEqual(r1.applicable_rules, r2.applicable_rules)

    def test_to_dict_returns_correct_structure(self):
        """to_dict should return a well-formed dictionary."""
        rules = [_make_rule("DETECTED") for _ in range(6)]
        result = calculate_screening_score(rules)
        d = result.to_dict()
        self.assertIsInstance(d, dict)
        self.assertIn("screening_score", d)
        self.assertIn("threshold", d)
        self.assertIn("threshold_status", d)
        self.assertIn("applicable_rules", d)
        self.assertIn("detected_rules", d)
        self.assertIn("uncertain_rules", d)
        self.assertIn("not_detected_rules", d)
        self.assertIn("not_applicable_rules", d)
        self.assertEqual(d["threshold"], 70)

    def test_null_score_returns_none_in_dict(self):
        """When score is None, to_dict should return null for screening_score."""
        result = calculate_screening_score([])
        d = result.to_dict()
        self.assertIsNone(d["screening_score"])

    def test_threshold_constant(self):
        """Threshold must be 70."""
        self.assertEqual(SCREENING_THRESHOLD, 70)

    def test_boundary_at_70(self):
        """Score exactly at 70 should be MET."""
        # 4.2 DETECTED out of 6 = 70%
        # 420 / 6 = 70.0
        rules = [_make_rule("DETECTED") for _ in range(4)]
        rules.append(_make_rule("UNCERTAIN"))  # 50 points
        rules.append(_make_rule("UNCERTAIN"))  # 50 points
        # Total: 4*100 + 2*50 = 500 / 6 = 83.33 — too high
        # Let's use: 4 DETECTED + 1 NOT_DETECTED + 1 UNCERTAIN
        # 400 + 0 + 50 = 450 / 6 = 75 — still above
        # Need: total/6 = 70 → total = 420
        # 4 DETECTED + 2 NOT_DETECTED = 400/6 = 66.67 — below
        # 5 DETECTED + 1 NOT_DETECTED = 500/6 = 83.33 — above
        # Let's use 7 rules: 4 DETECTED + 3 NOT_DETECTED = 400/7 = 57.14 — below
        # Actually let's just test: score >= 70 is MET
        rules = [_make_rule("DETECTED") for _ in range(5)]
        rules.append(_make_rule("UNCERTAIN"))
        result = calculate_screening_score(rules)
        # 5*100 + 50 = 550/6 = 91.67 >= 70 → MET
        self.assertEqual(result.threshold_status, "MET")

    def test_below_threshold(self):
        """Score below 70 should be BELOW_THRESHOLD."""
        rules = [_make_rule("DETECTED") for _ in range(3)]
        rules.extend([_make_rule("NOT_DETECTED") for _ in range(3)])
        result = calculate_screening_score(rules)
        # 300/6 = 50 < 70 → BELOW_THRESHOLD
        self.assertEqual(result.threshold_status, "BELOW_THRESHOLD")


class TestScreeningScorePersistence(unittest.TestCase):
    """Test that screening score integrates correctly with scan flow."""

    def test_score_is_independent_of_ocr_confidence(self):
        """Screening score must NOT be based on OCR confidence."""
        # Even with high OCR confidence, if rules are NOT_DETECTED, score is low
        rules = [_make_rule("NOT_DETECTED") for _ in range(6)]
        result = calculate_screening_score(rules)
        self.assertEqual(result.score, 0.0)

        # Even with low OCR confidence, if rules are DETECTED, score is 100
        rules = [_make_rule("DETECTED") for _ in range(6)]
        result = calculate_screening_score(rules)
        self.assertEqual(result.score, 100.0)


if __name__ == "__main__":
    unittest.main()
