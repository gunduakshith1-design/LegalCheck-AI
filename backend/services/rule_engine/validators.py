"""
Rule Engine — Validators (v2)

Provides:
1. Field extraction: extracts structured fields from raw OCR text
2. Rule validation: evaluates a rule definition against extracted fields

IMPORTANT: These validators determine what can be OBSERVED from a package
image. Detection is observation, not legal compliance.

Changes from v1:
- Fixed manufacturer name regex to capture entity name after qualifier
- Fixed non-SI unit detection to return DETECTED (with evidence)
- Fixed date patterns for MM/YYYY format
- Fixed phone patterns for formatted numbers (1800-123-4567)
- Fixed MRP sentinel value handling in evaluate_rule
- Added "Batch" to date keyword patterns
"""

from __future__ import annotations

import re
import logging
from typing import Any

from .models import (
    ExtractedField,
    FieldExtractionResult,
    OCRInput,
    RuleDefinition,
    RuleResult,
    RuleStatus,
)

logger = logging.getLogger(__name__)

# Sentinel values that indicate partial/uncertain detection
_SENTINEL_VALUES = {"MRP_KEYWORD_FOUND_NO_VALUE", "KEYWORD_FOUND_NO_DATE"}

# Sentinel values that indicate NOT_APPLICABLE (conditional rules)
_NOT_APPLICABLE_SENTINELS = {"DOMESTIC_NO_IMPORT_INDICATORS", "NON_PERISHABLE_NOT_APPLICABLE"}


# ===========================================================================
# Field Extraction — Extract structured fields from OCR text
# ===========================================================================

def extract_manufacturer_name(ocr: OCRInput) -> ExtractedField:
    """Extract manufacturer/packer/importer name from OCR text."""
    field_name = "manufacturer_name"
    qualifier_patterns = [
        r"manufactured?\s+(?:by|for|at)\s*:?\s*(.+)",
        r"manufactured?\s*&\s*packed\s+by\s*:?\s*(.+)",
        r"packed\s+(?:by|at)\s*:?\s*(.+)",
        r"packed\s*&\s*marketed\s+by\s*:?\s*(.+)",
        r"marketed\s+by\s*:?\s*(.+)",
        r"produced?\s+by\s*:?\s*(.+)",
        r"imported?\s+(?:by|and)\s*:?\s*(.+)",
        r"imported?\s*&\s*distributed\s+by\s*:?\s*(.+)",
        r"mfd\.?\s+by\s*:?\s*(.+)",
        r"mfg\.?\s+by\s*:?\s*(.+)",
        r"sold\s+by\s*:?\s*(.+)",
    ]

    evidence = []
    matches = []

    for region in ocr.text_regions:
        text = region.text.strip()
        if not text:
            continue

        for pattern in qualifier_patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                name = m.group(1).strip()
                # Clean up: remove trailing punctuation
                name = re.sub(r"[,;.\-]+$", "", name).strip()
                if name:
                    matches.append(name)
                    evidence.append(text)
                    break  # One match per region

    # If no qualifier found, look for company-name-like patterns
    if not matches:
        for region in ocr.text_regions:
            text = region.text.strip()
            if not text:
                continue
            if re.search(
                r"\b(?:pvt\.?\s*ltd\.?|ltd\.?|llc|inc\.?|corporation|co\.?|company)\b",
                text,
                re.IGNORECASE,
            ):
                evidence.append(text)
                matches.append(text)

    if matches:
        value = matches[0]
        confidence = min(
            (r.confidence for r in ocr.text_regions if r.text.strip() in evidence),
            default=0.5,
        )
        return ExtractedField(
            field_name=field_name,
            value=value,
            confidence=confidence,
            evidence=evidence,
            raw_matches=matches,
        )

    return ExtractedField(
        field_name=field_name,
        value=None,
        confidence=0.0,
        evidence=[],
    )


def extract_net_quantity(ocr: OCRInput) -> ExtractedField:
    """Extract net quantity with SI unit from OCR text."""
    field_name = "net_quantity"
    si_patterns = [
        r"(\d+\.?\d*)\s*(kg|g|gm|gms|gram|grams|kilogram|kilograms)\b",
        r"(\d+\.?\d*)\s*(ml|ltr|l|litre|liter|litres|liters|millilitre|milliliter)\b",
        r"(\d+\.?\d*)\s*(cm|mm|m|metre|meter|centimetre|centimeter|millimetre|millimeter)\b",
        r"(\d+\.?\d*)\s*(sq\.?\s*m|sq\.?\s*cm|cm2|m2)\b",
    ]
    number_patterns = [
        r"(\d+)\s*(nos?|pcs?|pieces?|units?|N|U)\b",
        r"\b(nos?|pcs?|pieces?|units?)\s*[:\-]?\s*(\d+)",
    ]
    non_si_patterns = [
        r"(\d+\.?\d*)\s*(oz|ounce|ounces|lb|lbs|pound|pounds|fl\.?\s*oz|gallon|gallons)\b"
    ]
    qualifier_patterns = [
        r"\b(minimum|min\.|about|approximately|approx\.|nearly)\b"
    ]

    evidence = []
    si_matches = []
    non_si_matches = []
    has_qualifier = False

    for region in ocr.text_regions:
        text = region.text.strip()
        if not text:
            continue

        # Check for SI units
        for pattern in si_patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                si_matches.append(m.group(0))
                evidence.append(text)

        # Check for number-based quantities
        for pattern in number_patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                si_matches.append(m.group(0))
                evidence.append(text)

        # Check for non-SI units
        for pattern in non_si_patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                non_si_matches.append(m.group(0))
                evidence.append(f"[non-SI] {text}")

        # Check for misleading qualifiers
        for pattern in qualifier_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                has_qualifier = True
                evidence.append(f"[qualified] {text}")

    # SI matches → DETECTED
    if si_matches:
        value = si_matches[0]
        confidence = min(
            (r.confidence for r in ocr.text_regions if r.text.strip() in evidence),
            default=0.5,
        )
        if has_qualifier:
            confidence *= 0.8
        return ExtractedField(
            field_name=field_name,
            value=value,
            confidence=confidence,
            evidence=evidence,
            raw_matches=si_matches,
        )

    # Non-SI matches → DETECTED (with evidence noting non-SI units)
    if non_si_matches:
        value = non_si_matches[0]
        confidence = min(
            (r.confidence for r in ocr.text_regions if any(m in r.text for m in non_si_matches)),
            default=0.5,
        )
        return ExtractedField(
            field_name=field_name,
            value=f"[non-SI] {value}",
            confidence=confidence,
            evidence=evidence,
            raw_matches=non_si_matches,
        )

    return ExtractedField(
        field_name=field_name,
        value=None,
        confidence=0.0,
        evidence=[],
    )


def extract_mrp(ocr: OCRInput) -> ExtractedField:
    """Extract MRP / retail sale price from OCR text."""
    field_name = "mrp"
    mrp_keywords = [
        r"\bMRP\b",
        r"\bMax\.?\s*Retail\s*Price\b",
        r"\bMaximum\s*Retail\s*Price\b",
        r"\bRetail\s*Sale\s*Price\b",
    ]
    value_patterns = [
        r"(Rs\.?|INR|₹)\s*(\d+(?:\.\d{1,2})?)",
        r"(\d+(?:\.\d{1,2})?)\s*(Rs\.?|INR|₹)",
    ]

    evidence = []
    mrp_found = False
    value_found = None

    for region in ocr.text_regions:
        text = region.text.strip()
        if not text:
            continue

        # Check for MRP keywords
        for pattern in mrp_keywords:
            if re.search(pattern, text, re.IGNORECASE):
                mrp_found = True
                evidence.append(text)

        # Check for value patterns
        for pattern in value_patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m and value_found is None:
                value_found = m.group(0).strip()
                evidence.append(text)

    if mrp_found and value_found:
        confidence = min(
            (r.confidence for r in ocr.text_regions if r.text.strip() in evidence),
            default=0.5,
        )
        return ExtractedField(
            field_name=field_name,
            value=value_found,
            confidence=confidence,
            evidence=evidence,
            raw_matches=[value_found],
        )

    if mrp_found and not value_found:
        return ExtractedField(
            field_name=field_name,
            value="MRP_KEYWORD_FOUND_NO_VALUE",
            confidence=0.3,
            evidence=evidence,
        )

    return ExtractedField(
        field_name=field_name,
        value=None,
        confidence=0.0,
        evidence=[],
    )


def extract_date_of_manufacture(ocr: OCRInput) -> ExtractedField:
    """Extract month/year of manufacture from OCR text."""
    field_name = "date_of_manufacture"
    date_patterns = [
        r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}\b",
        r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4}\b",
        r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
        r"\b\d{1,2}[/-]\d{4}\b",  # MM/YYYY format
        r"\b\d{1,2}\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*,?\s*\d{4}\b",
    ]
    keyword_patterns = [
        r"\b(Mfg\.?|Mfd\.?|Manufactured|Manufacturing|Date|POD|Production\s*Date|Packing\s*Date|Batch|Lot)\b"
    ]

    evidence = []
    date_matches = []
    has_keyword = False

    for region in ocr.text_regions:
        text = region.text.strip()
        if not text:
            continue

        # Check for date patterns
        for pattern in date_patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                date_matches.append(m.group(0))
                evidence.append(text)

        # Check for date keywords
        for pattern in keyword_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                has_keyword = True
                evidence.append(text)

    if date_matches:
        value = date_matches[0]
        confidence = min(
            (r.confidence for r in ocr.text_regions if r.text.strip() in evidence),
            default=0.5,
        )
        return ExtractedField(
            field_name=field_name,
            value=value,
            confidence=confidence,
            evidence=evidence,
            raw_matches=date_matches,
        )

    if has_keyword:
        return ExtractedField(
            field_name=field_name,
            value="KEYWORD_FOUND_NO_DATE",
            confidence=0.2,
            evidence=evidence,
        )

    return ExtractedField(
        field_name=field_name,
        value=None,
        confidence=0.0,
        evidence=[],
    )


def extract_consumer_care_phone(ocr: OCRInput) -> ExtractedField:
    """Extract consumer care phone number from OCR text."""
    field_name = "consumer_care_phone"
    phone_patterns = [
        r"(\+91[\s-]?\d{10})",
        r"(0\d{2,4}[\s-]?\d{6,8})",
        r"(\d{4}[\s-]?\d{3}[\s-]?\d{4})",  # Toll-free: 1800-123-4567
        r"(\d{5}[\s-]?\d{5})",  # 10-digit: 98765-43210
        r"(\d{10})",  # Raw 10-digit
    ]
    context_keywords = [
        r"(consumer\s*care|contact\s*us|helpline|toll\s*free|customer\s*care|complaints?|feedback|call\s*us)"
    ]

    evidence = []
    phone_matches = []
    has_context = False

    for region in ocr.text_regions:
        text = region.text.strip()
        if not text:
            continue

        # Check for context keywords
        for pattern in context_keywords:
            if re.search(pattern, text, re.IGNORECASE):
                has_context = True
                evidence.append(f"[context] {text}")

        # Check for phone patterns (most specific first)
        for pattern in phone_patterns:
            m = re.search(pattern, text)
            if m:
                candidate = m.group(0).strip()
                # Filter: PIN codes are exactly 6 digits
                if re.match(r"^\d{6}$", candidate):
                    continue
                # Filter: very short numbers (likely not phone)
                if len(candidate.replace(" ", "").replace("-", "")) < 7:
                    continue
                phone_matches.append(candidate)
                evidence.append(text)
                break  # One match per region

    if phone_matches:
        value = phone_matches[0]
        confidence = min(
            (r.confidence for r in ocr.text_regions if r.text.strip() in evidence),
            default=0.5,
        )
        if has_context:
            confidence = min(confidence + 0.1, 1.0)
        return ExtractedField(
            field_name=field_name,
            value=value,
            confidence=confidence,
            evidence=evidence,
            raw_matches=phone_matches,
        )

    return ExtractedField(
        field_name=field_name,
        value=None,
        confidence=0.0,
        evidence=[],
    )


def extract_manufacturer_address(ocr: OCRInput) -> ExtractedField:
    """Extract manufacturer/packer/importer address from OCR text."""
    field_name = "manufacturer_address"
    address_indicators = [
        r"\b\d{6}\b",  # PIN code
        r"\b(Plot|Block|Sector|Floor|Building|Office|Factory|Plant|Unit|Premises|Address|Location)\b",
    ]
    indian_cities = (
        "Mumbai|Delhi|Bangalore|Bengaluru|Chennai|Hyderabad|Kolkata|Pune|Ahmedabad|"
        "Jaipur|Lucknow|Chandigarh|Bhopal|Indore|Nagpur|Surat|Visakhapatnam|"
        "Coimbatore|Kochi|Thiruvananthapuram|Goa|Patna|Ranchi|Guwahati|"
        "Bhubaneswar|Cuttack|Dehradun|Shimla|Srinagar|Jammu|Imphal|Shillong|"
        "Aizawl|Kohima|Itanagar|Gangtok|Agartala|Panaji|Gurgaon|Noida|Faridabad"
    )
    indian_states = (
        "Andhra Pradesh|Arunachal Pradesh|Assam|Bihar|Chhattisgarh|Goa|Gujarat|"
        "Haryana|Himachal Pradesh|Jharkhand|Karnataka|Kerala|Madhya Pradesh|"
        "Maharashtra|Manipur|Meghalaya|Mizoram|Nagaland|Odisha|Punjab|Rajasthan|"
        "Sikkim|Tamil Nadu|Telangana|Tripura|Uttar Pradesh|Uttarakhand|"
        "West Bengal|Delhi|Jammu & Kashmir|Ladakh|Chandigarh|Puducherry"
    )

    evidence = []
    address_parts = []

    for region in ocr.text_regions:
        text = region.text.strip()
        if not text:
            continue

        has_indicator = False
        for pattern in address_indicators:
            if re.search(pattern, text, re.IGNORECASE):
                has_indicator = True
                break

        if re.search(indian_cities, text, re.IGNORECASE):
            has_indicator = True
        if re.search(indian_states, text, re.IGNORECASE):
            has_indicator = True

        if has_indicator:
            address_parts.append(text)
            evidence.append(text)

    if address_parts:
        value = "; ".join(address_parts[:3])
        confidence = min(
            (r.confidence for r in ocr.text_regions if r.text.strip() in evidence),
            default=0.5,
        )
        return ExtractedField(
            field_name=field_name,
            value=value,
            confidence=confidence,
            evidence=evidence,
            raw_matches=address_parts,
        )

    return ExtractedField(
        field_name=field_name,
        value=None,
        confidence=0.0,
        evidence=[],
    )


def extract_common_name(ocr: OCRInput) -> ExtractedField:
    """Extract common/generic product name from OCR text."""
    field_name = "common_name"
    # Common product descriptors — categories of products commonly found in Indian market
    generic_descriptors = [
        r"\b(tea|chai|coffee|biscuit|biscuits|cookie|cookies|rice|wheat|flour|atta|maida|sooji|rava|sugar|salt|oil|ghee|milk|water|juice|soda|packaged\s+drinking\s+water|mineral\s+water)\b",
        r"\b(snack|snacks|chocolate|candy|cereal|noodle|noodles|pasta|bread|cake|chips|namkeen|dal|lentil|pulses|spice|spices|honey|jam|sauce|ketchup|pickle|chutney|vinegar|butter|cheese|yogurt|curd|ice\s+cream|frozen|canned|bottled)\b",
        r"\b(soap|detergent|shampoo|face\s+wash|body\s+wash|hand\s+wash|toothpaste|mouthwash|deodorant|perfume|lotion|moisturizer|sunscreen|cream|powder|liquid|capsule|tablet|syrup|supplement|paste)\b",
        r"\b(battery|bulb|tube|wire|cable|switch|plug|adapter|charger|headphone|earphone|speaker|camera|lens)\b",
        r"\b(toy|puzzle|game|ball|bat|notebook|pen|pencil|marker|crayon|paint|brush|paper)\b",
        r"\b(water\s+bottle|drinking\s+water|baby\s+powder|baby\s+oil|diaper|tissue|napkin|sanitary)\b",
    ]

    evidence = []
    matches = []

    for region in ocr.text_regions:
        text = region.text.strip()
        if not text:
            continue

        for pattern in generic_descriptors:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                matches.append(m.group(0).strip())
                evidence.append(text)
                break  # One match per region

    if matches:
        value = matches[0]
        confidence = min(
            (r.confidence for r in ocr.text_regions if r.text.strip() in evidence),
            default=0.5,
        )
        return ExtractedField(
            field_name=field_name,
            value=value,
            confidence=confidence,
            evidence=evidence,
            raw_matches=matches,
        )

    return ExtractedField(
        field_name=field_name,
        value=None,
        confidence=0.0,
        evidence=[],
    )


def extract_country_of_origin(ocr: OCRInput) -> ExtractedField:
    """Extract country of origin with applicability-aware logic.

    Returns:
        - DETECTED: import status established AND origin found
        - NOT_DETECTED: import status established BUT origin not found
        - NOT_APPLICABLE: no import indicators found (domestic product)
        - UNCERTAIN: partial evidence
    """
    field_name = "country_of_origin"

    # Applicability: import-related keywords
    import_patterns = [
        r"\b(import(?:ed|er|ing|s)?|distributed?\s+by|distributor|importer)\b",
        r"\b(foreign|overseas|international)\b",
    ]

    # Origin declaration patterns
    origin_patterns = [
        r"\b(country\s+of\s+origin|COO)\s*[:\-]?\s*([A-Za-z][A-Za-z\s]{1,30})",
        r"\b(made\s+in|manufactured\s+in|assembled\s+in|produced\s+in|product\s+of|originating\s+from)\s*[:\-]?\s*([A-Za-z][A-Za-z\s]{1,30})",
        r"\b(origin|originating)\s*[:\-]?\s*([A-Za-z][A-Za-z\s]{1,30})",
    ]

    # Known country names
    known_countries = [
        "India", "China", "USA", "United States", "UK", "United Kingdom",
        "Germany", "France", "Japan", "South Korea", "Korea", "Thailand",
        "Vietnam", "Indonesia", "Malaysia", "Singapore", "Sri Lanka",
        "Bangladesh", "Nepal", "Pakistan", "Myanmar", "UAE", "Dubai",
        "Saudi Arabia", "Turkey", "Italy", "Spain", "Netherlands",
        "Australia", "New Zealand", "Canada", "Brazil", "Mexico",
        "Switzerland", "Sweden", "Denmark", "Norway", "Finland", "Poland",
        "Russia", "Taiwan", "Hong Kong", "Philippines", "Cambodia", "Laos",
        "Egypt", "South Africa", "Nigeria", "Kenya", "Ethiopia",
        "Argentina", "Chile", "Colombia", "Peru",
    ]
    countries_pattern = "|".join(re.escape(c) for c in known_countries)

    evidence = []
    has_import_indicator = False
    origin_found = False
    origin_value = None

    # Step 1: Check for import applicability
    for region in ocr.text_regions:
        text = region.text.strip()
        if not text:
            continue

        for pattern in import_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                has_import_indicator = True
                evidence.append(f"[import indicator] {text}")
                break

    # Step 2: Search for country of origin declaration
    for region in ocr.text_regions:
        text = region.text.strip()
        if not text:
            continue

        for pattern in origin_patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                candidate = m.group(2).strip() if m.lastindex and m.lastindex >= 2 else m.group(0).strip()
                # Clean trailing non-alpha
                candidate = re.sub(r"[^A-Za-z\s]+$", "", candidate).strip()
                if candidate:
                    origin_found = True
                    origin_value = candidate
                    evidence.append(f"[origin declaration] {text}")
                    break

        # Also check for direct country name mentions near origin keywords
        if not origin_found:
            m = re.search(f"\b({countries_pattern})\b", text, re.IGNORECASE)
            if m and re.search(r"\b(origin|made\s+in|product\s+of|imported?)\b", text, re.IGNORECASE):
                origin_found = True
                origin_value = m.group(0).strip()
                evidence.append(f"[country name near origin keyword] {text}")

    # Step 3: Determine status
    if not has_import_indicator:
        return ExtractedField(
            field_name=field_name,
            value="DOMESTIC_NO_IMPORT_INDICATORS",
            confidence=0.8,
            evidence=[],
            raw_matches=["NOT_APPLICABLE: No import indicators found"],
        )

    if origin_found and origin_value:
        confidence = min(
            (r.confidence for r in ocr.text_regions if r.text.strip() in evidence),
            default=0.5,
        )
        return ExtractedField(
            field_name=field_name,
            value=origin_value,
            confidence=confidence,
            evidence=evidence,
            raw_matches=[origin_value],
        )

    # Import indicator found but no origin
    return ExtractedField(
        field_name=field_name,
        value=None,
        confidence=0.3,
        evidence=evidence,
    )


def extract_best_before_date(ocr: OCRInput) -> ExtractedField:
    """Extract best-before/use-by date with applicability-aware logic.

    Returns:
        - DETECTED: perishable product AND date found
        - NOT_DETECTED: perishable product BUT date not found
        - NOT_APPLICABLE: no perishable indicators (non-perishable product)
        - UNCERTAIN: partial evidence
    """
    field_name = "best_before_date"

    # Applicability: perishable/food/beverage indicators
    perishable_patterns = [
        r"\b(tea|coffee|biscuit|biscuits|rice|wheat|flour|sugar|oil|ghee|milk|water|juice|soda|snack|snacks|chocolate|candy|cereal|noodle|noodles|pasta|bread|cake|cookie|cookies|chips|namkeen|atta|maida|dal|lentil|pulses|spice|spices|honey|jam|sauce|ketchup|pickle|chutney|vinegar|butter|cheese|yogurt|curd|ice\s+cream|frozen|canned|bottled|packaged\s+drinking\s+water)\b",
        r"\b(food|beverage|drink|edible|consumable|organic|fresh|natural)\b",
        r"\b(pharmaceutical|medicine|tablet|capsule|syrup|supplement|vitamin)\b",
        r"\b(baby|infant|formula)\b",
        r"\b(cosmetic|cream|lotion|shampoo|soap|toothpaste)\b",
    ]

    # Best-before date patterns
    bb_patterns = [
        r"\b(best\s*before|BBE|best\s*before\s*end)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|\d{4}|\d+\s*(?:months?|days?|years?)\s*(?:from|shelf))",
        r"\b(use\s*by|UB)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|\d{4})",
        r"\b(expiry|expires?|expiration)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|\d{4})",
        r"\b(valid\s*until|shelf\s*life)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|\d{4})",
        r"\b(\d+)\s*(months?|days?|years?)\s*(shelf\s*life|from\s+(?:manufacture|packing|production))\b",
    ]

    evidence = []
    has_perishable_indicator = False
    bb_found = False
    bb_value = None

    # Step 1: Check for perishable applicability
    for region in ocr.text_regions:
        text = region.text.strip()
        if not text:
            continue

        for pattern in perishable_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                has_perishable_indicator = True
                evidence.append(f"[perishable indicator] {text}")
                break

    # Step 2: Search for best-before date
    for region in ocr.text_regions:
        text = region.text.strip()
        if not text:
            continue

        for pattern in bb_patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                bb_found = True
                bb_value = m.group(0).strip()
                evidence.append(f"[best-before date] {text}")
                break

    # Step 3: Determine status
    if not has_perishable_indicator:
        return ExtractedField(
            field_name=field_name,
            value="NON_PERISHABLE_NOT_APPLICABLE",
            confidence=0.8,
            evidence=[],
            raw_matches=["NOT_APPLICABLE: No perishable indicators found"],
        )

    if bb_found and bb_value:
        confidence = min(
            (r.confidence for r in ocr.text_regions if r.text.strip() in evidence),
            default=0.5,
        )
        return ExtractedField(
            field_name=field_name,
            value=bb_value,
            confidence=confidence,
            evidence=evidence,
            raw_matches=[bb_value],
        )

    # Perishable indicator found but no date
    return ExtractedField(
        field_name=field_name,
        value=None,
        confidence=0.3,
        evidence=evidence,
    )


def extract_consumer_care_email(ocr: OCRInput) -> ExtractedField:
    """Extract consumer care email address from OCR text."""
    field_name = "consumer_care_email"
    email_pattern = r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
    context_keywords = [
        r"(consumer\s*care|contact\s*us|helpline|customer\s*care|complaints?|feedback|email|e\s*mail)"
    ]
    exclude_patterns = [r"@example\.com", r"@test\.com", r"@placeholder"]

    evidence = []
    email_matches = []
    has_context = False

    for region in ocr.text_regions:
        text = region.text.strip()
        if not text:
            continue

        # Check for context keywords
        for pattern in context_keywords:
            if re.search(pattern, text, re.IGNORECASE):
                has_context = True

        # Check for email patterns
        m = re.search(email_pattern, text)
        if m:
            candidate = m.group(0).strip()
            # Filter out test/placeholder domains
            excluded = False
            for excl in exclude_patterns:
                if re.search(excl, candidate, re.IGNORECASE):
                    excluded = True
                    break
            if not excluded:
                email_matches.append(candidate)
                evidence.append(text)

    if email_matches:
        value = email_matches[0]
        confidence = min(
            (r.confidence for r in ocr.text_regions if r.text.strip() in evidence),
            default=0.5,
        )
        if has_context:
            confidence = min(confidence + 0.1, 1.0)
        return ExtractedField(
            field_name=field_name,
            value=value,
            confidence=confidence,
            evidence=evidence,
            raw_matches=email_matches,
        )

    return ExtractedField(
        field_name=field_name,
        value=None,
        confidence=0.0,
        evidence=[],
    )


def extract_fields(ocr: OCRInput) -> FieldExtractionResult:
    """Extract all 10 screening fields from OCR input."""
    return FieldExtractionResult(
        manufacturer_name=extract_manufacturer_name(ocr),
        net_quantity=extract_net_quantity(ocr),
        mrp=extract_mrp(ocr),
        date_of_manufacture=extract_date_of_manufacture(ocr),
        consumer_care_phone=extract_consumer_care_phone(ocr),
        manufacturer_address=extract_manufacturer_address(ocr),
        common_name=extract_common_name(ocr),
        country_of_origin=extract_country_of_origin(ocr),
        best_before_date=extract_best_before_date(ocr),
        consumer_care_email=extract_consumer_care_email(ocr),
    )


# ===========================================================================
# Rule Validation — Evaluate a rule against extracted fields
# ===========================================================================

def evaluate_rule(
    rule: RuleDefinition,
    fields: FieldExtractionResult,
) -> RuleResult:
    """
    Evaluate a single rule against the extracted fields.

    This is a deterministic function: the same inputs always produce
    the same output.
    """
    field_data = fields.as_dict().get(rule.field)

    if field_data is None:
        return RuleResult(
            rule_id=rule.rule_id,
            field=rule.field,
            status=RuleStatus.NOT_DETECTED,
            observed_value=None,
            confidence=0.0,
            evidence=[],
            rule_reference=rule.rule_reference,
            source_document=rule.source_document,
            source_version=rule.source_version,
            explanation=f"Field '{rule.field}' not found in extracted fields.",
            cannot_conclude=rule.cannot_conclude,
            limitations=rule.limitations,
        )

    # Check for NOT_APPLICABLE sentinels (conditional rules)
    if field_data.value in _NOT_APPLICABLE_SENTINELS:
        applicability_note = field_data.raw_matches[0] if field_data.raw_matches else "Rule not applicable"
        if field_data.value == "DOMESTIC_NO_IMPORT_INDICATORS":
            return RuleResult(
                rule_id=rule.rule_id,
                field=rule.field,
                status=RuleStatus.NOT_APPLICABLE,
                observed_value=None,
                confidence=field_data.confidence,
                evidence=[],
                rule_reference=rule.rule_reference,
                source_document=rule.source_document,
                source_version=rule.source_version,
                explanation=(
                    "No import-related indicators found on the label. The product appears to be "
                    "domestically manufactured. Rule 6(1)(aa) (country of origin) applies only to imported products."
                ),
                cannot_conclude=rule.cannot_conclude,
                limitations=rule.limitations,
            )
        elif field_data.value == "NON_PERISHABLE_NOT_APPLICABLE":
            return RuleResult(
                rule_id=rule.rule_id,
                field=rule.field,
                status=RuleStatus.NOT_APPLICABLE,
                observed_value=None,
                confidence=field_data.confidence,
                evidence=[],
                rule_reference=rule.rule_reference,
                source_document=rule.source_document,
                source_version=rule.source_version,
                explanation=(
                    "No food, beverage, or perishable indicators found on the label. Rule 6(1)(da) "
                    "(best before/use by date) applies only to commodities that may become unfit for "
                    "human consumption after a period of time."
                ),
                cannot_conclude=rule.cannot_conclude,
                limitations=rule.limitations,
            )

    # Check for sentinel values FIRST (partial/uncertain detection)
    if field_data.value in _SENTINEL_VALUES:
        if field_data.value == "MRP_KEYWORD_FOUND_NO_VALUE":
            return RuleResult(
                rule_id=rule.rule_id,
                field=rule.field,
                status=RuleStatus.UNCERTAIN,
                observed_value="MRP keyword found, value unclear",
                confidence=field_data.confidence,
                evidence=field_data.evidence,
                rule_reference=rule.rule_reference,
                source_document=rule.source_document,
                source_version=rule.source_version,
                explanation=(
                    "MRP keyword was found on the label but the associated "
                    "numeric value could not be clearly identified."
                ),
                cannot_conclude=rule.cannot_conclude,
                limitations=rule.limitations,
            )
        elif field_data.value == "KEYWORD_FOUND_NO_DATE":
            return RuleResult(
                rule_id=rule.rule_id,
                field=rule.field,
                status=RuleStatus.UNCERTAIN,
                observed_value="Date keyword found, date unclear",
                confidence=field_data.confidence,
                evidence=field_data.evidence,
                rule_reference=rule.rule_reference,
                source_document=rule.source_document,
                source_version=rule.source_version,
                explanation=(
                    "A date-related keyword was found but the month/year "
                    "could not be clearly identified."
                ),
                cannot_conclude=rule.cannot_conclude,
                limitations=rule.limitations,
            )

    # Normal detection
    if field_data.is_present:
        status = RuleStatus.DETECTED
        explanation = _build_detected_explanation(rule, field_data)
    elif field_data.evidence:
        status = RuleStatus.UNCERTAIN
        explanation = (
            f"Some evidence of '{rule.field}' was found but could not "
            f"be clearly identified as a complete declaration."
        )
    else:
        status = RuleStatus.NOT_DETECTED
        explanation = (
            f"No {rule.field.replace('_', ' ')} declaration was detected "
            f"on the label."
        )

    return RuleResult(
        rule_id=rule.rule_id,
        field=rule.field,
        status=status,
        observed_value=field_data.value,
        confidence=field_data.confidence,
        evidence=field_data.evidence,
        rule_reference=rule.rule_reference,
        source_document=rule.source_document,
        source_version=rule.source_version,
        explanation=explanation,
        cannot_conclude=rule.cannot_conclude,
        limitations=rule.limitations,
    )


def _build_detected_explanation(rule: RuleDefinition, field_data: ExtractedField) -> str:
    """Build a human-readable explanation for a DETECTED status."""
    if rule.field == "mrp":
        return (
            f"MRP declaration detected on the label with value: {field_data.value}. "
            f"This is an observation of the declared MRP. The system has not verified "
            f"that the price is accurate, legally valid, or inclusive of all taxes."
        )
    elif rule.field == "manufacturer_name":
        return (
            f"Manufacturer/packer/importer name detected: {field_data.value}. "
            f"The system has not verified that this entity is legally registered "
            f"or that the name is the actual corporate name per Rule 10(2)."
        )
    elif rule.field == "manufacturer_address":
        return (
            f"Address-like text detected near manufacturer name: {field_data.value}. "
            f"The system has not verified that this address is complete per "
            f"Rule 10(1) Explanation or that it matches a registered address."
        )
    elif rule.field == "net_quantity":
        return (
            f"Net quantity declaration detected: {field_data.value}. "
            f"The system has not verified that the quantity is accurate or "
            f"that the correct SI unit for this commodity type was used."
        )
    elif rule.field == "date_of_manufacture":
        return (
            f"Date of manufacture/packing detected: {field_data.value}. "
            f"The system has not verified that the date format satisfies "
            f"the requirement for this specific product category."
        )
    elif rule.field == "consumer_care_phone":
        return (
            f"Consumer care telephone number detected: {field_data.value}. "
            f"The system has not verified that this number is active or "
            f"belongs to the manufacturer/packer."
        )
    elif rule.field == "common_name":
        return (
            f"Common/generic product name detected: '{field_data.value}'. "
            f"The system has not verified that this is the legally required 'common or generic name' "
            f"for this specific product category."
        )
    elif rule.field == "country_of_origin":
        return (
            f"Country of origin detected: '{field_data.value}'. "
            f"The system has not verified that the declared origin is accurate."
        )
    elif rule.field == "best_before_date":
        return (
            f"Best before/use by date detected: '{field_data.value}'. "
            f"The system has not verified that the date format satisfies the requirement."
        )
    elif rule.field == "consumer_care_email":
        return (
            f"Consumer care email detected: '{field_data.value}'. "
            f"Email is optional under Rule 6(2) ('if available'). This does not affect the screening score."
        )
    else:
        field_label = rule.field.replace("_", " ")
        return f"{field_label} detected: {field_data.value}."
