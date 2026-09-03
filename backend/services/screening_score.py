"""
Screening Score — Label Compliance Screening Score calculator.

Computes a 0–100 score based on how many of the 6 MVP label-declaration
checks were satisfactorily detected from the package image.

IMPORTANT: This is a screening indicator, NOT a legal compliance score.
It answers: "How many of our configured label-declaration checks were
satisfactorily detected?" — not whether the product is legally compliant.

Scoring model:
  DETECTED       = 100 points
  UNCERTAIN      = 50 points
  NOT_DETECTED   = 0 points
  NOT_APPLICABLE = excluded from denominator

Score = sum(rule_points) / number_of_applicable_rules

Threshold: 70% (our prototype screening threshold, NOT a government threshold)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCREENING_THRESHOLD = 70

STATUS_POINTS = {
    "DETECTED": 100,
    "UNCERTAIN": 50,
    "NOT_DETECTED": 0,
    # NOT_APPLICABLE is excluded from the denominator
}


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class ScreeningScoreResult:
    """Result of a screening score calculation."""
    score: float | None           # 0–100, or None if not evaluable
    threshold: int                # 70
    threshold_status: str         # MET | BELOW_THRESHOLD | NOT_EVALUABLE
    applicable_rules: int         # rules that contribute to the score
    detected_rules: int
    uncertain_rules: int
    not_detected_rules: int
    not_applicable_rules: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "screening_score": round(self.score, 2) if self.score is not None else None,
            "threshold": self.threshold,
            "threshold_status": self.threshold_status,
            "applicable_rules": self.applicable_rules,
            "detected_rules": self.detected_rules,
            "uncertain_rules": self.uncertain_rules,
            "not_detected_rules": self.not_detected_rules,
            "not_applicable_rules": self.not_applicable_rules,
        }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def calculate_screening_score(rule_results: list[dict[str, Any]]) -> ScreeningScoreResult:
    """
    Calculate the Label Compliance Screening Score from rule results.

    Args:
        rule_results: List of rule result dicts, each containing at minimum
                      a 'status' field with values like 'DETECTED', 'NOT_DETECTED',
                      'UNCERTAIN', or 'NOT_APPLICABLE'.

    Returns:
        ScreeningScoreResult with score, threshold status, and breakdown.

    Examples:
        6 DETECTED → score=100.0, threshold_status='MET'
        5 DETECTED + 1 UNCERTAIN → score≈91.67, threshold_status='MET'
        5 DETECTED + 1 NOT_DETECTED → score≈83.33, threshold_status='MET'
        4 DETECTED + 2 NOT_DETECTED → score≈66.67, threshold_status='BELOW_THRESHOLD'
        All NOT_APPLICABLE → score=None, threshold_status='NOT_EVALUABLE'
    """
    if not rule_results:
        return ScreeningScoreResult(
            score=None,
            threshold=SCREENING_THRESHOLD,
            threshold_status="NOT_EVALUABLE",
            applicable_rules=0,
            detected_rules=0,
            uncertain_rules=0,
            not_detected_rules=0,
            not_applicable_rules=0,
        )

    detected = 0
    uncertain = 0
    not_detected = 0
    not_applicable = 0
    total_points = 0

    for rule in rule_results:
        status = rule.get("status", "NOT_DETECTED") if isinstance(rule, dict) else getattr(rule, "status", "NOT_DETECTED")
        # Handle enum values
        if hasattr(status, "value"):
            status = status.value

        if status == "NOT_APPLICABLE":
            not_applicable += 1
        elif status == "DETECTED":
            detected += 1
            total_points += STATUS_POINTS["DETECTED"]
        elif status == "UNCERTAIN":
            uncertain += 1
            total_points += STATUS_POINTS["UNCERTAIN"]
        elif status == "NOT_DETECTED":
            not_detected += 1
            total_points += STATUS_POINTS["NOT_DETECTED"]
        else:
            # Unknown status treated as NOT_DETECTED
            not_detected += 1
            total_points += STATUS_POINTS["NOT_DETECTED"]

    applicable = detected + uncertain + not_detected

    if applicable == 0:
        return ScreeningScoreResult(
            score=None,
            threshold=SCREENING_THRESHOLD,
            threshold_status="NOT_EVALUABLE",
            applicable_rules=0,
            detected_rules=detected,
            uncertain_rules=uncertain,
            not_detected_rules=not_detected,
            not_applicable_rules=not_applicable,
        )

    score = total_points / applicable

    if score >= SCREENING_THRESHOLD:
        threshold_status = "MET"
    else:
        threshold_status = "BELOW_THRESHOLD"

    return ScreeningScoreResult(
        score=score,
        threshold=SCREENING_THRESHOLD,
        threshold_status=threshold_status,
        applicable_rules=applicable,
        detected_rules=detected,
        uncertain_rules=uncertain,
        not_detected_rules=not_detected,
        not_applicable_rules=not_applicable,
    )
