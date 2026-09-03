# MVP Rule Specification — Legal Metrology (Packaged Commodities) Rules, 2011

## Purpose

Machine-readable rule definitions for the SIH screening prototype. Each file defines one compliance check that can be evaluated from a package photograph using OCR/field extraction.

## Source Basis

All rules are derived from:

- **Document:** The Legal Metrology (Packaged Commodities) Rules, 2011
- **Notification:** GSR 202(E), dated 7th March 2011
- **Authority:** Central Government, Department of Consumer Affairs, DPIIT
- **Enabling Act:** Legal Metrology Act, 2009 (1 of 2010), Section 52(1)(j)/(q)
- **English text pages:** 1–43 of the verified digital copy

### Amendment Limitation

The 2012–2026 amendments have **not** been text-verified against authoritative digital copies. Every rule file contains `source_verification_status` and `limitations` fields making this explicit. These rules represent the **original 2011 text only** and may not reflect the current consolidated law.

## Rule Files

| File | Rule ID | Check |
|------|---------|-------|
| `mvp-a1-manufacturer-name.json` | MVP-A1 | Manufacturer/packer/importer name present |
| `mvp-a2-net-quantity.json` | MVP-A2 | Net quantity declared with SI unit |
| `mvp-a3-mrp.json` | MVP-A3 | MRP / retail sale price present with value |
| `mvp-a4-date-of-manufacture.json` | MVP-A4 | Month and year of manufacture/packing present |
| `mvp-a5-consumer-care-phone.json` | MVP-A5 | Consumer care telephone number present |
| `mvp-a6-manufacturer-address.json` | MVP-A6 | Manufacturer/packer/importer address present |
| `index.json` | — | Manifest linking all rules |

## Status Values

Each rule evaluation produces one of:

| Status | Meaning |
|--------|---------|
| `DETECTED` | The required field was found in the OCR text |
| `NOT_DETECTED` | The field was searched for but not found |
| `UNCERTAIN` | Partial match or ambiguous result |
| `NOT_APPLICABLE` | Rule does not apply (e.g., product exempt under Rule 26) |

**There is no `LEGALLY_COMPLIANT` status.** Detection is observation, not compliance.

## How Rules Will Be Evaluated

1. OCR extracts text from the package image
2. Field extraction attempts to locate the target field using patterns defined in `detection_method`
3. The extracted text is compared against `validation_logic`
4. A status is assigned based on the outcome
5. The result is returned with the `observable_evidence` and `cannot_conclude` notes

## Versioning

- `rule_spec_version`: Version of this rule specification format
- `source_version`: Version of the source document the rule is based on
- `last_verified`: Date the rule was last verified against the source

Changes to rules should increment `rule_spec_version` and update `last_verified`.
