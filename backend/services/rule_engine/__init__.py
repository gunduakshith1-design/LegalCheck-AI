"""
Rule Engine — Public API

Provides the rule engine for evaluating Legal Metrology compliance
screening rules against OCR-extracted text from package images.

Usage:
    from backend.services.rule_engine import RuleEngine, OCRInput, TextRegion

    # Create OCR input (or receive from OCR system)
    ocr_input = OCRInput(
        raw_text="Manufactured by ABC Ltd. MRP Rs. 299...",
        text_regions=[TextRegion(text="...", confidence=0.95, bbox=[...])],
        average_confidence=0.92,
    )

    # Evaluate all rules
    engine = RuleEngine()
    report = engine.evaluate(ocr_input)
    print(report.to_dict())

    # Evaluate a single rule
    result = engine.evaluate_single("MVP-A3", ocr_input)
    print(result.to_dict())

IMPORTANT: This engine produces OBSERVATIONS, not legal conclusions.
"""

from .engine import RuleEngine
from .loader import load_all_rules, load_rule, get_rule_ids, get_rule_set_version
from .models import (
    AggregateStatus,
    ExtractedField,
    FieldExtractionResult,
    OCRInput,
    RuleDefinition,
    RuleResult,
    RuleStatus,
    ScreeningReport,
    TextRegion,
)
from .validators import extract_fields, evaluate_rule

__all__ = [
    # Engine
    "RuleEngine",
    # Loader
    "load_all_rules",
    "load_rule",
    "get_rule_ids",
    "get_rule_set_version",
    # Models
    "AggregateStatus",
    "ExtractedField",
    "FieldExtractionResult",
    "OCRInput",
    "RuleDefinition",
    "RuleResult",
    "RuleStatus",
    "ScreeningReport",
    "TextRegion",
    # Validators
    "extract_fields",
    "evaluate_rule",
]
