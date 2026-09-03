"""
Rule Engine — Data Models

Defines the input contract (OCR output), intermediate field extraction,
and per-rule result structures.

IMPORTANT: These models describe what the software can OBSERVE from a
package image. Detection is observation, not legal compliance.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ---------------------------------------------------------------------------
# Status enums
# ---------------------------------------------------------------------------

class RuleStatus(str, Enum):
    """Possible outcomes for a single rule evaluation."""
    DETECTED = "DETECTED"
    NOT_DETECTED = "NOT_DETECTED"
    UNCERTAIN = "UNCERTAIN"
    NOT_APPLICABLE = "NOT_APPLICABLE"


class AggregateStatus(str, Enum):
    """Overall screening result across all rules."""
    NO_ISSUES_DETECTED = "NO_ISSUES_DETECTED"
    POTENTIAL_NON_COMPLIANCE = "POTENTIAL_NON_COMPLIANCE"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"


# ---------------------------------------------------------------------------
# Input: OCR output (raw)
# ---------------------------------------------------------------------------

@dataclass
class TextRegion:
    """A single text region detected by OCR."""
    text: str
    confidence: float
    bbox: list[list[float]]  # [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]

    def __post_init__(self):
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError(f"confidence must be 0.0-1.0, got {self.confidence}")


@dataclass
class OCRInput:
    """
    Raw OCR output — the input contract for the rule engine.

    This represents what an OCR system would produce from a package image.
    """
    raw_text: str
    text_regions: list[TextRegion]
    average_confidence: float
    image_width: int | None = None
    image_height: int | None = None

    @property
    def all_text(self) -> str:
        """All detected text joined by newlines."""
        return "\n".join(r.text for r in self.text_regions if r.text.strip())

    @property
    def high_confidence_text(self) -> str:
        """Text from regions with confidence >= 0.7."""
        return "\n".join(
            r.text for r in self.text_regions
            if r.text.strip() and r.confidence >= 0.7
        )


# ---------------------------------------------------------------------------
# Intermediate: Extracted fields
# ---------------------------------------------------------------------------

@dataclass
class ExtractedField:
    """
    A field extracted from OCR output by a field extractor.

    This is the intermediate representation between raw OCR and rule evaluation.
    """
    field_name: str
    value: str | None  # The extracted value, or None if not found
    confidence: float  # 0.0-1.0
    evidence: list[str]  # The OCR text lines that support this extraction
    raw_matches: list[str] = field(default_factory=list)  # Regex matches

    @property
    def is_present(self) -> bool:
        return self.value is not None and len(self.value.strip()) > 0


@dataclass
class FieldExtractionResult:
    """
    Complete field extraction result for all screening fields.
    """
    manufacturer_name: ExtractedField
    net_quantity: ExtractedField
    mrp: ExtractedField
    date_of_manufacture: ExtractedField
    consumer_care_phone: ExtractedField
    manufacturer_address: ExtractedField
    common_name: ExtractedField
    country_of_origin: ExtractedField
    best_before_date: ExtractedField
    consumer_care_email: ExtractedField

    def as_dict(self) -> dict[str, ExtractedField]:
        return {
            "manufacturer_name": self.manufacturer_name,
            "net_quantity": self.net_quantity,
            "mrp": self.mrp,
            "date_of_manufacture": self.date_of_manufacture,
            "consumer_care_phone": self.consumer_care_phone,
            "manufacturer_address": self.manufacturer_address,
            "common_name": self.common_name,
            "country_of_origin": self.country_of_origin,
            "best_before_date": self.best_before_date,
            "consumer_care_email": self.consumer_care_email,
        }


# ---------------------------------------------------------------------------
# Rule definition (loaded from JSON)
# ---------------------------------------------------------------------------

@dataclass
class RuleDefinition:
    """
    A rule definition loaded from a JSON rule file.
    Only the fields needed for evaluation are stored here.
    """
    rule_id: str
    title: str
    field: str
    description: str
    rule_reference: str
    source_document: str
    source_version: str
    mandatory: bool
    detection_method: dict[str, Any]
    validation_logic: dict[str, Any]
    cannot_conclude: list[str]
    limitations: list[str]
    notes: list[str]


# ---------------------------------------------------------------------------
# Output: Rule evaluation result
# ---------------------------------------------------------------------------

@dataclass
class RuleResult:
    """
    The result of evaluating a single rule against extracted fields.
    """
    rule_id: str
    field: str
    status: RuleStatus
    observed_value: str | None
    confidence: float
    evidence: list[str]
    rule_reference: str
    source_document: str
    source_version: str
    explanation: str
    cannot_conclude: list[str]
    limitations: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "field": self.field,
            "status": self.status.value,
            "observed_value": self.observed_value,
            "confidence": self.confidence,
            "evidence": self.evidence,
            "rule_reference": self.rule_reference,
            "source_document": self.source_document,
            "source_version": self.source_version,
            "explanation": self.explanation,
            "cannot_conclude": self.cannot_conclude,
            "limitations": self.limitations,
        }


# ---------------------------------------------------------------------------
# Output: Screening report
# ---------------------------------------------------------------------------

@dataclass
class ScreeningReport:
    """
    Aggregate screening result across all evaluated rules.

    IMPORTANT: "NO_ISSUES_DETECTED" means the configured checks did not
    detect a problem. It does NOT mean legal compliance has been established.
    """
    aggregate_status: AggregateStatus
    rule_results: list[RuleResult]
    total_rules: int
    detected_count: int
    not_detected_count: int
    uncertain_count: int
    not_applicable_count: int
    rule_set_version: str = "v1.1"
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "aggregate_status": self.aggregate_status.value,
            "summary": {
                "total_rules": self.total_rules,
                "detected": self.detected_count,
                "not_detected": self.not_detected_count,
                "uncertain": self.uncertain_count,
                "not_applicable": self.not_applicable_count,
            },
            "rule_results": [r.to_dict() for r in self.rule_results],
            "rule_set_version": self.rule_set_version,
            "notes": self.notes,
        }
