"""
Rule Engine — Orchestrator

The main entry point for rule evaluation. Accepts OCR input, extracts
fields, evaluates all loaded rules, and produces a screening report.

Usage:
    from backend.services.rule_engine import RuleEngine

    engine = RuleEngine()
    report = engine.evaluate(ocr_input)
    print(report.to_dict())

IMPORTANT: This engine produces OBSERVATIONS, not legal conclusions.
"NO_ISSUES_DETECTED" means the configured checks did not find a problem.
It does NOT mean the product is legally compliant.
"""

from __future__ import annotations

import logging
from pathlib import Path

from .loader import load_all_rules, get_rule_set_version
from .models import (
    AggregateStatus,
    FieldExtractionResult,
    OCRInput,
    RuleDefinition,
    RuleResult,
    RuleStatus,
    ScreeningReport,
)
from .validators import evaluate_rule, extract_fields

logger = logging.getLogger(__name__)


class RuleEngine:
    """
    Deterministic, explainable rule engine for Legal Metrology screening.

    Loads rule definitions from JSON files in rules/, extracts structured
    fields from OCR input, and evaluates each rule independently.
    """

    def __init__(self, rules_dir: Path | None = None):
        """
        Initialize the engine by loading all rules from the rules/ directory.

        Args:
            rules_dir: Path to rules/ directory. Defaults to project root/rules/.
        """
        self.rules: list[RuleDefinition] = load_all_rules(rules_dir)
        self.rules_by_id: dict[str, RuleDefinition] = {
            r.rule_id: r for r in self.rules
        }
        self.rule_set_version = get_rule_set_version(rules_dir)
        logger.info(f"Rule engine initialized with {len(self.rules)} rules (rule set {self.rule_set_version})")

    def evaluate(self, ocr_input: OCRInput) -> ScreeningReport:
        """
        Evaluate all rules against the OCR input.

        This is the main entry point. It:
        1. Extracts structured fields from the OCR text
        2. Evaluates each rule against the extracted fields
        3. Computes an aggregate screening status
        4. Returns a complete screening report

        Args:
            ocr_input: Raw OCR output from a package image.

        Returns:
            A ScreeningReport with per-rule results and aggregate status.
        """
        # Step 1: Extract fields
        fields = extract_fields(ocr_input)

        # Step 2: Evaluate each rule
        rule_results = []
        for rule in self.rules:
            result = evaluate_rule(rule, fields)
            rule_results.append(result)

        # Step 3: Compute aggregate status
        aggregate_status = self._compute_aggregate_status(rule_results)

        # Step 4: Build report
        counts = self._count_statuses(rule_results)

        notes = self._build_notes(rule_results)

        return ScreeningReport(
            aggregate_status=aggregate_status,
            rule_results=rule_results,
            total_rules=len(rule_results),
            detected_count=counts["DETECTED"],
            not_detected_count=counts["NOT_DETECTED"],
            uncertain_count=counts["UNCERTAIN"],
            not_applicable_count=counts["NOT_APPLICABLE"],
            rule_set_version=self.rule_set_version,
            notes=notes,
        )

    def evaluate_single(self, rule_id: str, ocr_input: OCRInput) -> RuleResult:
        """
        Evaluate a single rule against the OCR input.

        Args:
            rule_id: The rule ID to evaluate (e.g., "MVP-A1").
            ocr_input: Raw OCR output.

        Returns:
            A RuleResult for the specified rule.

        Raises:
            ValueError: If the rule_id is not loaded.
        """
        if rule_id not in self.rules_by_id:
            raise ValueError(
                f"Rule '{rule_id}' not loaded. "
                f"Available: {list(self.rules_by_id.keys())}"
            )

        fields = extract_fields(ocr_input)
        rule = self.rules_by_id[rule_id]
        return evaluate_rule(rule, fields)

    def _compute_aggregate_status(self, results: list[RuleResult]) -> AggregateStatus:
        """
        Compute the aggregate screening status from individual rule results.

        Logic:
        - Any NOT_DETECTED mandatory rule → POTENTIAL_NON_COMPLIANCE
        - Any UNCERTAIN required rule → REVIEW_REQUIRED
        - All DETECTED → NO_ISSUES_DETECTED
        - All NOT_APPLICABLE → INSUFFICIENT_EVIDENCE
        - Mixed → REVIEW_REQUIRED

        IMPORTANT: "NO_ISSUES_DETECTED" means the configured checks did
        not find a problem. It does NOT mean legal compliance.
        """
        statuses = [r.status for r in results]
        informational_fields = {"consumer_care_email"}

        # Filter out informational rules from scoring consideration
        scoring_statuses = [
            r.status for r in results
            if r.field not in informational_fields
        ]

        # Check for NOT_DETECTED (potential non-compliance)
        if RuleStatus.NOT_DETECTED in scoring_statuses:
            return AggregateStatus.POTENTIAL_NON_COMPLIANCE

        # Check for UNCERTAIN (needs review)
        if RuleStatus.UNCERTAIN in statuses:
            return AggregateStatus.REVIEW_REQUIRED

        # All DETECTED
        if all(s == RuleStatus.DETECTED for s in statuses):
            return AggregateStatus.NO_ISSUES_DETECTED

        # All NOT_APPLICABLE
        if all(s == RuleStatus.NOT_APPLICABLE for s in statuses):
            return AggregateStatus.INSUFFICIENT_EVIDENCE

        # Mixed (e.g., some DETECTED, some NOT_APPLICABLE)
        # If remaining non-NOT_APPLICABLE results are all DETECTED, it's NO_ISSUES_DETECTED
        non_na_scoring = [s for s in scoring_statuses if s != RuleStatus.NOT_APPLICABLE]
        if non_na_scoring and all(s == RuleStatus.DETECTED for s in non_na_scoring):
            return AggregateStatus.NO_ISSUES_DETECTED
        return AggregateStatus.REVIEW_REQUIRED

    def _count_statuses(self, results: list[RuleResult]) -> dict[str, int]:
        """Count occurrences of each status."""
        counts = {
            "DETECTED": 0,
            "NOT_DETECTED": 0,
            "UNCERTAIN": 0,
            "NOT_APPLICABLE": 0,
        }
        for r in results:
            counts[r.status.value] = counts.get(r.status.value, 0) + 1
        return counts

    def _build_notes(self, results: list[RuleResult]) -> list[str]:
        """Build explanatory notes for the screening report."""
        notes = [
            f"Rule Set: {self.rule_set_version} — Legal Metrology (Packaged Commodities) Rules, 2011.",
            "This screening report is based on observations from OCR text extraction.",
            "Detection of a field is an observation, not a declaration of legal compliance.",
            "Product-category exemptions (food, cosmetics, drugs, alcohol) are NOT automatically applied.",
            "Conditional rules (country of origin, best before) return NOT_APPLICABLE when applicability cannot be established.",
        ]

        # Add specific notes for uncertain results
        for r in results:
            if r.status == RuleStatus.UNCERTAIN:
                notes.append(
                    f"{r.rule_id}: {r.field.replace('_', ' ')} — "
                    f"partial evidence found but could not be clearly identified."
                )

        return notes
