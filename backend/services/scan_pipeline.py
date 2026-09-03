"""
Scan Pipeline — End-to-end analysis

Connects: Image → OCR → Field Extraction → Rule Engine → Screening Report

This is the main entry point for analyzing a packaged product image.
"""

from __future__ import annotations

import logging
import time
import uuid
from pathlib import Path
from typing import Any

from .ocr_service import ocr_from_bytes
from .rule_engine import RuleEngine, OCRInput, TextRegion
from .screening_score import calculate_screening_score

logger = logging.getLogger(__name__)

# Lazy-loaded rule engine
_rule_engine: RuleEngine | None = None


def _get_rule_engine() -> RuleEngine:
    """Get or initialize the rule engine."""
    global _rule_engine
    if _rule_engine is None:
        rules_dir = Path(__file__).resolve().parent.parent.parent / "rules"
        _rule_engine = RuleEngine(rules_dir)
    return _rule_engine


def analyze_image(
    image_bytes: bytes,
    filename: str = "upload.png",
    preprocessing: str = "standard",
) -> dict[str, Any]:
    """
    Full analysis pipeline: image bytes → screening report.

    Args:
        image_bytes: Raw image file bytes.
        filename: Original filename (for metadata).
        preprocessing: Preprocessing level for OCR.

    Returns:
        Complete analysis result with OCR, fields, rule results, and aggregate status.
    """
    scan_id = str(uuid.uuid4())[:8]
    start_time = time.time()

    result = {
        "scan_id": scan_id,
        "filename": filename,
        "status": "processing",
        "ocr": None,
        "fields": None,
        "rule_results": None,
        "overall_status": None,
        "limitations": [],
        "timing": {},
        "errors": [],
    }

    try:
        # Step 1: Run OCR
        logger.info(f"[{scan_id}] Step 1: Running OCR on {filename} ({len(image_bytes)} bytes)")
        ocr_start = time.time()
        ocr_result = ocr_from_bytes(image_bytes, preprocessing=preprocessing)
        ocr_time = time.time() - ocr_start
        result["timing"]["ocr_seconds"] = round(ocr_time, 3)
        logger.info(f"[{scan_id}] OCR completed: engine={ocr_result.get('engine')}, lines={ocr_result.get('line_count')}, confidence={ocr_result.get('average_confidence'):.3f}, time={ocr_time:.2f}s")

        # Store raw OCR output
        result["ocr"] = {
            "engine": ocr_result["engine"],
            "line_count": ocr_result["line_count"],
            "average_confidence": ocr_result["average_confidence"],
            "raw_text": ocr_result["raw_text"],
            "text_regions": ocr_result["text_regions"],
        }

        if ocr_result["line_count"] == 0:
            result["status"] = "no_text_detected"
            result["overall_status"] = "INSUFFICIENT_EVIDENCE"
            result["rule_set_version"] = _get_rule_engine().rule_set_version
            result["limitations"].append(
                "No text was detected in the image. The image may be too low quality, "
                "the package may not have visible text, or OCR could not process the image."
            )
            result["timing"]["total_seconds"] = round(time.time() - start_time, 3)
            return result

        # Step 2: Convert OCR output to rule engine input
        logger.info(f"[{scan_id}] Converting OCR output to rule engine input")
        ocr_input = _convert_ocr_to_input(ocr_result)

        # Step 3: Run rule engine
        logger.info(f"[{scan_id}] Running rule engine ({len(_get_rule_engine().rules)} rules)")
        engine_start = time.time()
        engine = _get_rule_engine()
        report = engine.evaluate(ocr_input)
        engine_time = time.time() - engine_start
        result["timing"]["rule_engine_seconds"] = round(engine_time, 3)

        # Step 4: Build result
        result["status"] = "completed"
        result["rule_results"] = [r.to_dict() for r in report.rule_results]
        result["overall_status"] = report.aggregate_status.value
        result["rule_set_version"] = report.rule_set_version
        result["limitations"] = report.notes

        # Add field extraction summary
        result["fields"] = _build_fields_summary(report.rule_results)

        # Step 5: Calculate screening score
        score_result = calculate_screening_score(result["rule_results"])
        result["screening_score"] = score_result.to_dict()
        logger.info(f"[{scan_id}] Screening score: {score_result.score} ({score_result.threshold_status})")

        # Add warnings for low confidence
        low_conf_regions = [
            r for r in ocr_result["text_regions"]
            if r["confidence"] < 0.6
        ]
        if low_conf_regions:
            result["limitations"].append(
                f"Warning: {len(low_conf_regions)} text region(s) had low OCR confidence "
                f"(below 60%). Results may be less reliable."
            )

    except Exception as e:
        logger.error(f"[{scan_id}] Pipeline error: {e}", exc_info=True)
        result["status"] = "error"
        result["overall_status"] = "REVIEW_REQUIRED"
        result["errors"].append(str(e))
        result["limitations"].append(
            f"An error occurred during analysis: {str(e)}"
        )

    result["timing"]["total_seconds"] = round(time.time() - start_time, 3)
    return result


def _convert_ocr_to_input(ocr_result: dict) -> OCRInput:
    """Convert OCR service output to rule engine OCRInput."""
    regions = [
        TextRegion(
            text=r["text"],
            confidence=r["confidence"],
            bbox=r["bbox"],
        )
        for r in ocr_result["text_regions"]
    ]

    return OCRInput(
        raw_text=ocr_result["raw_text"],
        text_regions=regions,
        average_confidence=ocr_result["average_confidence"],
    )


def _build_fields_summary(rule_results) -> dict[str, Any]:
    """Build a field extraction summary from rule results."""
    fields = {}
    for r in rule_results:
        # Support both dict and RuleResult dataclass
        if isinstance(r, dict):
            field_name = r["field"]
            value = r.get("observed_value")
            confidence = r.get("confidence", 0.0)
            status = r.get("status", "UNKNOWN")
            evidence = r.get("evidence", [])
        else:
            field_name = r.field
            value = r.observed_value
            confidence = r.confidence
            status = r.status.value if hasattr(r.status, 'value') else str(r.status)
            evidence = r.evidence

        fields[field_name] = {
            "value": value,
            "confidence": confidence,
            "status": status,
            "evidence": evidence,
        }
    return fields


def analyze_images(
    image_list: list[dict[str, Any]],
    preprocessing: str = "standard",
) -> dict[str, Any]:
    """
    Multi-image analysis pipeline: multiple images → combined OCR → field extraction → rules → report.

    Each image is OCR'd independently.  All text regions are merged into a
    single OCRInput and passed through the rule engine.  Fields found on ANY
    side of the product count toward the final score.

    Args:
        image_list: List of dicts, each with 'bytes' and 'filename' keys.
        preprocessing: Preprocessing level for OCR.

    Returns:
        Combined analysis result identical in shape to analyze_image().
    """
    scan_id = str(uuid.uuid4())[:8]
    start_time = time.time()

    result = {
        "scan_id": scan_id,
        "filename": image_list[0]["filename"] if image_list else "multi",
        "status": "processing",
        "ocr": None,
        "fields": None,
        "rule_results": None,
        "overall_status": None,
        "limitations": [],
        "timing": {},
        "errors": [],
        "image_count": len(image_list),
    }

    try:
        # Step 1: Run OCR on each image and collect results
        all_text_regions = []
        all_raw_text_parts = []
        ocr_engines = set()
        total_ocr_time = 0
        total_confidence = 0
        total_regions = 0
        per_image_quality = []

        for idx, img in enumerate(image_list):
            label = img.get("label", f"image_{idx + 1}")
            logger.info(f"[{scan_id}] OCR on {label}: {img['filename']} ({len(img['bytes'])} bytes)")

            ocr_start = time.time()
            ocr_result = ocr_from_bytes(img["bytes"], preprocessing=preprocessing)
            ocr_time = time.time() - ocr_start
            total_ocr_time += ocr_time

            line_count = ocr_result.get('line_count', 0)
            img_confidence = ocr_result.get('average_confidence', 0)

            logger.info(f"[{scan_id}] {label} OCR done: {line_count} lines, "
                        f"{img_confidence:.1%} confidence, {ocr_time:.2f}s")

            # Per-image quality assessment (conservative — uses only existing OCR metrics)
            if line_count == 0:
                quality_status = "no_text"
                quality_label = "No text detected"
            elif img_confidence < 0.5:
                quality_status = "poor"
                quality_label = "Hard to read"
            elif img_confidence < 0.7:
                quality_status = "fair"
                quality_label = "Partially readable"
            else:
                quality_status = "clear"
                quality_label = "Clear"

            per_image_quality.append({
                "label": label,
                "line_count": line_count,
                "average_confidence": round(img_confidence, 4),
                "quality_status": quality_status,
                "quality_label": quality_label,
                "low_confidence_regions": sum(
                    1 for r in ocr_result["text_regions"] if r["confidence"] < 0.6
                ),
            })

            # Collect regions with source label
            for region in ocr_result["text_regions"]:
                all_text_regions.append({
                    **region,
                    "source": label,
                })

            if ocr_result["raw_text"]:
                all_raw_text_parts.append(f"--- {label} ---\n{ocr_result['raw_text']}")

            ocr_engines.add(ocr_result.get("engine", "unknown"))
            total_confidence += img_confidence * line_count
            total_regions += line_count

        result["timing"]["ocr_seconds"] = round(total_ocr_time, 3)

        # Build combined OCR output
        combined_raw_text = "\n".join(all_raw_text_parts)
        avg_confidence = total_confidence / total_regions if total_regions > 0 else 0.0

        result["ocr"] = {
            "engine": "+".join(sorted(ocr_engines)),
            "line_count": total_regions,
            "average_confidence": round(avg_confidence, 4),
            "raw_text": combined_raw_text,
            "text_regions": all_text_regions,
        }

        # Per-image quality data for frontend
        result["image_quality"] = per_image_quality

        if total_regions == 0:
            result["status"] = "no_text_detected"
            result["overall_status"] = "INSUFFICIENT_EVIDENCE"
            result["rule_set_version"] = _get_rule_engine().rule_set_version
            result["limitations"].append(
                "No text was detected in any of the uploaded images. "
                "Please ensure the product label text is clearly visible."
            )
            result["timing"]["total_seconds"] = round(time.time() - start_time, 3)
            return result

        # Step 2: Build combined OCRInput
        ocr_input = OCRInput(
            raw_text=combined_raw_text,
            text_regions=[
                TextRegion(text=r["text"], confidence=r["confidence"], bbox=r["bbox"])
                for r in all_text_regions
            ],
            average_confidence=avg_confidence,
        )

        # Step 3: Run rule engine on combined input
        logger.info(f"[{scan_id}] Running rule engine on combined OCR from {len(image_list)} images ({total_regions} regions)")
        engine_start = time.time()
        engine = _get_rule_engine()
        report = engine.evaluate(ocr_input)
        engine_time = time.time() - engine_start
        result["timing"]["rule_engine_seconds"] = round(engine_time, 3)

        # Step 4: Build result
        result["status"] = "completed"
        result["rule_results"] = [r.to_dict() for r in report.rule_results]
        result["overall_status"] = report.aggregate_status.value
        result["rule_set_version"] = report.rule_set_version
        result["limitations"] = report.notes
        result["fields"] = _build_fields_summary(report.rule_results)

        # Step 5: Calculate screening score
        score_result = calculate_screening_score(result["rule_results"])
        result["screening_score"] = score_result.to_dict()
        logger.info(f"[{scan_id}] Combined screening score: {score_result.score} ({score_result.threshold_status})")

        # Add multi-image note
        result["limitations"].insert(0,
            f"Scanned from {len(image_list)} image(s): {', '.join(img.get('label', f'Image {i+1}') for i, img in enumerate(image_list))}. "
            f"Fields found on any side are combined."
        )

        # Low confidence warnings
        low_conf = [r for r in all_text_regions if r["confidence"] < 0.6]
        if low_conf:
            result["limitations"].append(
                f"Warning: {len(low_conf)} text region(s) had low OCR confidence (below 60%)."
            )

    except Exception as e:
        logger.error(f"[{scan_id}] Multi-image pipeline error: {e}", exc_info=True)
        result["status"] = "error"
        result["overall_status"] = "REVIEW_REQUIRED"
        result["errors"].append(str(e))
        result["limitations"].append(f"An error occurred during analysis: {str(e)}")

    result["timing"]["total_seconds"] = round(time.time() - start_time, 3)
    return result
