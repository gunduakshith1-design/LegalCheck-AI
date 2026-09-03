# STEP 3B — MVP Rule Scope Review

**Status:** Classification only. No rules implemented.
**Source basis:** GSR 202(E), 7 March 2011 — the original Legal Metrology (Packaged Commodities) Rules, 2011 (verified digital text, pages 1-43).
**Amendment note:** The 2012-2026 amendments have NOT been text-verified. Any check whose applicability depends on an amendment is placed in Group B.
**Date:** 2026-08-30

---

## CLASSIFICATION CRITERIA

| Group | Meaning |
|-------|---------|
| **A — SAFE FOR MVP** | Clearly supported by the verified source; realistically detectable from a package photograph; no product-category or amendment ambiguity. |
| **B — CONDITIONAL** | Rule exists in verified source, but applicability depends on product category, amendment status, package size, or wording interpretation that cannot be resolved from the source alone. |
| **C — NOT RELIABLY IMAGE-CHECKABLE** | A photograph/OCR system cannot reliably determine compliance by itself, regardless of rule clarity. |

---

## DETAILED ANALYSIS: ALL 16 PROPOSED MVP CHECKS

---

### MVP-01 — Manufacturer/Packer/Importer Name Present

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-01 |
| **Requirement** | The name of the manufacturer, packer, or importer must be declared on the package |
| **Rule reference** | Rule 6(1)(a): "the name and address of the manufacturer, or where the manufacturer is not the packer, the name and address of the manufacturer and packer and for any imported package the name and address of the importer shall be mentioned" |
| **Supporting rule** | Rule 10(1): "every package kept, offered or exposed for sale or sold shall bear conspicuously on it, the name and complete address of the manufacturer" |
| **Source pages** | PDF pp. 5, 10-11 |
| **Classification** | **A — SAFE FOR MVP** |
| **Rationale** | The rule is unambiguous and unconditional for retail packages. The name is a text string. No product-category exemption removes this requirement (food articles have a separate exemption for address, but name still applies under PFA). No amendment is known to alter this requirement. |
| **What OCR would observe** | Text blocks containing company names, potentially near qualifier words ("Manufactured by", "Marketed by", etc.) |
| **What software can safely conclude** | DETECTED: a text string is present in a region that appears to be a manufacturer/packer label. NOT DETECTED: no identifiable company name found on the principal display panel. |
| **What software CANNOT conclude** | Whether the named entity is actually the legal manufacturer/packer. Whether the address (not checked here) is complete. Whether this is the correct entity if multiple names appear (Rule 6(1)(a) Expl. II: "prosecution shall be launched against the manufacturer indicated on the label in the first place"). |
| **Key exceptions** | Food articles: Explanation III to Rule 6(1)(a) states PFA provisions apply for "name and address" — but PFA also requires manufacturer name, so this check still applies in spirit. Packages ≤5 cubic cm: reduced requirements (Rule 10(1) proviso). |
| **Amendment dependency** | None identified. |

---

### MVP-02 — Manufacturer/Packer/Importer Address Present

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-02 |
| **Requirement** | The address of the manufacturer, packer, or importer must be declared |
| **Rule reference** | Rule 6(1)(a): same as MVP-01 (name AND address together). Rule 10(1): "name and complete address". Rule 10(1) Explanation defines "complete address" as postal address including street, number, city, state, or PIN code. |
| **Source pages** | PDF pp. 5, 10-11 |
| **Classification** | **B — CONDITIONAL** |
| **Rationale** | While the rule is clear, what constitutes a "complete address" is defined in a sub-rule explanation. An OCR system can detect that an address-like string exists, but cannot verify completeness (missing PIN code, missing state, etc.). The rule also states that a "shorter address" may be registered with the Director (Rule 28) and used on labels — so what appears incomplete may be legally registered. Food articles have the PFA exemption. |
| **What OCR would observe** | Text near the manufacturer name, potentially containing street, city, state, PIN patterns |
| **What software can safely conclude** | DETECTED: address-like text is present near the manufacturer name. NOT DETECTED: no address-like text found. |
| **What software CANNOT conclude** | Whether the address is "complete" per Rule 10(1) Explanation. Whether a shorter address has been registered under Rule 28. Whether the food exemption applies. |
| **Key exceptions** | Rule 28: registered shorter address is lawful. Rule 10(1) proviso: packages ≤5 cubic cm need only a mark enabling identification. Food articles: PFA applies. |
| **Amendment dependency** | None identified for the core requirement. |

---

### MVP-03 — Qualifier Words Present ("Manufactured by" / "Packed by")

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-03 |
| **Requirement** | Qualifying words such as "Manufactured by", "Packed by", or "Marketed by" should accompany the manufacturer/packer name |
| **Rule reference** | Rule 6(1)(a) Explanation I: "If any name and address of a company is mentioned on the label without any qualifying words 'manufactured by' or 'packed by', it shall be presumed that such name and address shall be that of the manufacturer" |
| **Source pages** | PDF p. 5 |
| **Classification** | **B — CONDITIONAL** |
| **Rationale** | The Explanation I states a *presumption*, not a *requirement to display qualifier words*. It says: if no qualifier is present, the name is *presumed* to be the manufacturer. This means the absence of qualifier words is not itself a violation — it changes the legal presumption about who is responsible. Additionally, Explanation II says brand owners listed as "marketers" are also held responsible. A check for qualifier words would be detecting a *labeling practice*, not a *legal requirement*. |
| **What OCR would observe** | Presence/absence of "Manufactured by", "Packed by", "Marketed by", "Produced by", etc. |
| **What software can safely conclude** | DETECTED: qualifier words are present. NOT DETECTED: qualifier words are absent (but this is not a violation — it triggers a legal presumption). |
| **What software CANNOT conclude** | That missing qualifier words constitute non-compliance. They do not. They change the legal attribution. |
| **Key exceptions** | The absence of qualifiers creates a presumption, not a penalty. Multiple names may appear (Expl. II). |
| **Amendment dependency** | None identified. |
| **Recommendation** | **Reclassify as informational observation, not a compliance check.** The system could note "No qualifier words found — name assumed to be manufacturer per Explanation I" but should not flag this as POTENTIAL NON-COMPLIANCE. |

---

### MVP-04 — Common/Generic Product Name Present

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-04 |
| **Requirement** | The common or generic name of the commodity must be declared on the package |
| **Rule reference** | Rule 6(1)(b): "The common or generic names of the commodity contained in the package and in case of packages with more than one product, the name and number or quantity of each product shall be mentioned on the package" |
| **Source pages** | PDF p. 5 |
| **Classification** | **B — CONDITIONAL** |
| **Rationale** | The rule is clear and mandatory. However, determining whether a *brand name* vs. a *generic name* is present requires semantic understanding of what the product actually is. "Close-Up" is a brand name; "Toothpaste" is the generic name. An OCR system can extract all text but cannot reliably distinguish brand names from generic names without product knowledge. Additionally, some products legitimately use only their brand name (well-known products), and enforcement实践中 vary. |
| **What OCR would observe** | All text on the label, including brand names, product descriptors, etc. |
| **What software can safely conclude** | DETECTED: a text string that could be a product name is present. UNCERTAIN: whether the text is a brand name only, or includes a generic descriptor. |
| **What software CANNOT conclude** | Whether the generic name is present and adequate. Whether a brand name without a generic descriptor constitutes a violation. |
| **Key exceptions** | For packages with multiple products, each product's name and quantity must be listed. |
| **Amendment dependency** | None identified. |
| **Recommendation** | **Classify as informational only in MVP.** The system should extract and display the product name text but cannot reliably judge generic-name compliance. Future versions with product classification ML could evaluate this. |

---

### MVP-05 — Net Quantity Declared with SI Unit

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-05 |
| **Requirement** | Net quantity of the commodity must be declared in standard SI units of weight, measure, or number |
| **Rule reference** | Rule 6(1)(c): "The net quantity, in terms of the standard unit of weight or measure, of the commodity contained in the package or where the commodity is packed or sold by number, the number of the commodity contained in the package shall be mentioned." Rule 13(5)(i): "No system of units other than the International System of Units shall be used in furnishing the net quantity of the packages." |
| **Source pages** | PDF pp. 5, 13-14 |
| **Classification** | **A — SAFE FOR MVP** |
| **Rationale** | This is one of the most straightforward checks. The requirement is unconditional: net quantity must be present, and must use SI units (g, kg, ml, L, cm, m, etc.). No product category exempts this check. The detection is pattern-based: look for numbers followed by recognized SI unit symbols. The Fourth Schedule lists exceptions to which unit type to use, but all listed units are still SI units — the exception is about *which* SI unit (weight vs. volume vs. number), not about allowing non-SI units. |
| **What OCR would observe** | Numeric values followed by unit symbols (g, kg, gm, ml, L, cm, m, N, U) |
| **What software can safely conclude** | DETECTED: a numeric quantity with a recognized unit symbol is present. NOT DETECTED: no quantity declaration found. POTENTIAL NON-COMPLIANCE: non-SI units detected (e.g., oz, lb, fl oz, gallon) — but note: some imports may legitimately show dual units. |
| **What software CANNOT conclude** | Whether the declared quantity is accurate (physical measurement required). Whether the *correct* SI unit for this commodity type was chosen (requires product classification). |
| **Key exceptions** | Food articles: PFA may have different quantity requirements (but still SI). Packages ≤10g/10ml: exempt from Rules entirely (Rule 26(a)). |
| **Amendment dependency** | None identified. |

---

### MVP-06 — SI Units Used (Not Imperial)

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-06 |
| **Requirement** | Only International System of Units (SI) shall be used for net quantity declarations |
| **Rule reference** | Rule 13(5)(i): "No system of units other than the International System of Units shall be used" |
| **Source pages** | PDF p. 14 |
| **Classification** | **A — SAFE FOR MVP** (but subsumed by MVP-05) |
| **Rationale** | Same logic as MVP-05. This is essentially the negative form of MVP-05: instead of checking "is SI present?", it checks "is non-SI present?". Both checks use the same detection logic. Keeping both is redundant. |
| **Recommendation** | **Merge into MVP-05.** A single check that verifies "net quantity present with SI unit; non-SI unit detected" covers both. |

---

### MVP-07 — Month and Year of Manufacture/Packing Present

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-07 |
| **Requirement** | The month and year of manufacture, pre-packing, or import must be declared |
| **Rule reference** | Rule 6(1)(d): "The month and year in which the commodity is manufactured or pre-packed or imported shall be mentioned in the package" |
| **Source pages** | PDF pp. 5-6 |
| **Classification** | **B — CONDITIONAL** |
| **Rationale** | The rule itself is clear and unconditional. However, Rule 6(1)(d) has multiple provisos and exceptions: (1) Food articles follow PFA, not LMPC; (2) Seeds follow Seeds Act; (3) Cosmetics follow Drugs & Cosmetics Rules; (4) Bidis and incense sticks are exempt; (5) LPG cylinders are exempt. For an MVP without product classification, the system cannot determine which exceptions apply. If the system flags a food product (whose date follows FSSAI format "Best before" / "Use by") as "missing LMPC date format", it would be a false positive. |
| **What OCR would observe** | Date-like patterns (month names/numbers, year, "Mfg", "MFD", "POD", "Date") |
| **What software can safely conclude** | DETECTED: a month+year pattern is present on the label. NOT DETECTED: no date pattern found. UNCERTAIN: a date-like string exists but format is ambiguous. |
| **What software CANNOT conclude** | Whether the date format satisfies the applicable law for this product category. Whether a food product's "Best before" date satisfies the LMPC requirement. |
| **Key exceptions** | Food (PFA/FSSAI), cosmetics (D&C Rules), drugs (exempt), seeds (Seeds Act), bidis, incense sticks, LPG cylinders. |
| **Amendment dependency** | None identified for the core requirement. |
| **Recommendation** | **Include in MVP with caveat.** The system should detect the *presence or absence* of a month+year pattern. It should NOT judge format compliance. It should note that food/cosmetic products may follow different regulations. |

---

### MVP-08 — MRP / Retail Sale Price Present

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-08 |
| **Requirement** | The retail sale price (MRP) must be declared on the package |
| **Rule reference** | Rule 6(1)(e): "the retail sale price of the package." Rule 2(m) defines retail sale price and prescribes the format: "Maximum or Max. retail price Rs/ .......inclusive of all taxes" or "MRP Rs/ .........incl., of all taxes" |
| **Source pages** | PDF pp. 3, 7 |
| **Classification** | **A — SAFE FOR MVP** |
| **Rationale** | This is the most universally checked LMPC requirement. The rule is clear, unconditional (for retail packages), and the detection pattern is straightforward: look for "MRP", "Max. Retail Price", "Maximum Retail Price", "Rs.", "₹", or "INR" near a numeric value. The exceptions (bidis, LPG under APM, alcohol under state excise) are narrow and well-defined. Even if alcohol is exempt from MRP, detecting "MRP present" is still a valid observation. |
| **What OCR would observe** | "MRP", "Max. Retail Price", "₹", "Rs." followed by a numeric value |
| **What software can safely conclude** | DETECTED: MRP declaration found with value. NOT DETECTED: no MRP found. POTENTIAL NON-COMPLIANCE: non-exempt product lacks MRP declaration. |
| **What software CANNOT conclude** | Whether the MRP is accurate (physical verification). Whether the product is alcohol and thus exempt. Whether a sticker-reduced MRP is valid. |
| **Key exceptions** | Bidis (Rule 6(1)(C)(i)), LPG under APM (Rule 6(1)(C)(ii)), alcoholic beverages (Rule 6(1)(e) proviso — state excise laws). |
| **Amendment dependency** | None identified. |

---

### MVP-09 — MRP Stated as "Inclusive of All Taxes"

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-09 |
| **Requirement** | The MRP must be stated as inclusive of all taxes |
| **Rule reference** | Rule 2(m): "retail sale price means the maximum price at which the commodity in packaged form may be sold to the consumer and the price shall be printed on the package in the manner given below: 'Maximum or Max. retail price Rs/ .......inclusive of all taxes' or 'MRP Rs/ .........incl., of all taxes'" |
| **Source pages** | PDF p. 3 |
| **Classification** | **B — CONDITIONAL** |
| **Rationale** | The rule prescribes a specific format with "inclusive of all taxes". However, the exact wording is given as *examples* ("in the manner given below"), not as an exhaustive specification. Real-world packages use many variations: "incl. of all taxes", "MRP incl. tax", "MRP (incl. of all taxes)", "Maximum Retail Price (inclusive of GST)". The rule text shows "incl., of all taxes" (note the comma) as acceptable. Determining whether a particular variant satisfies the rule requires legal interpretation. For an MVP, the presence of "incl." or "inclusive" near the MRP could be checked, but the *absence* of this phrase on a package that clearly shows MRP may be a labeling style issue rather than a violation. Additionally, the 2021 amendment may have further clarified MRP format. |
| **What OCR would observe** | Text near MRP value — "incl.", "inclusive", "of all taxes", "including GST", etc. |
| **What software can safely conclude** | DETECTED: "inclusive of all taxes" or recognized variant present near MRP. NOT DETECTED: no such qualifier found near MRP value. |
| **What software CANNOT conclude** | That the absence of the exact phrase "inclusive of all taxes" constitutes a legal violation, given format flexibility in the rule text and common industry variations. |
| **Key exceptions** | Same as MVP-08 (bidis, LPG, alcohol). |
| **Amendment dependency** | The 2021 or 2023 amendments may have clarified format — not text-verified. |
| **Recommendation** | **Include in MVP as informational observation.** Report whether "inclusive of all taxes" or a variant is detected. Do NOT classify absence as POTENTIAL NON-COMPLIANCE without legal clarification. |

---

### MVP-10 — Consumer Care Phone Number Present

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-10 |
| **Requirement** | A telephone number for consumer complaints must be declared on the package |
| **Rule reference** | Rule 6(2): "Every package shall bear the name, address, telephone number, e mail address, if available, of the person who can be or the office which can be, contacted, in case of consumer complaints" |
| **Source pages** | PDF p. 7 |
| **Classification** | **A — SAFE FOR MVP** |
| **Rationale** | The rule is unambiguous: telephone number is mandatory (email is conditional — "if available"). No product-category exemptions remove this requirement. Phone number detection via regex is reliable. The rule applies to "every package" with no exceptions noted. |
| **What OCR would observe** | Phone number patterns (Indian: 10-digit mobile, 0XXX-XXXXXXX landline, +91 prefix) |
| **What software can safely conclude** | DETECTED: a phone number pattern found on the label. NOT DETECTED: no phone number pattern found. |
| **What software CANNOT conclude** | Whether the phone number is active/valid. Whether it belongs to the manufacturer/packer vs. a third party. |
| **Key exceptions** | None identified in the verified source for retail packages. |
| **Amendment dependency** | None identified. |

---

### MVP-11 — Consumer Care Email Address Present

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-11 |
| **Requirement** | An email address for consumer complaints, if available |
| **Rule reference** | Rule 6(2): "e mail address, if available" |
| **Source pages** | PDF p. 7 |
| **Classification** | **C — NOT RELIABLY IMAGE-CHECKABLE** |
| **Rationale** | The email is explicitly conditional: "if available." The absence of an email address is NOT a violation — the rule recognizes that not all manufacturers have email. An OCR system detecting "no email" cannot conclude anything: it could mean the manufacturer has no email (legal), or the email is on another part of the package not visible in the photo (incomplete information), or it was intentionally omitted. |
| **What OCR would observe** | Email pattern (@ symbol, domain) or absence thereof |
| **What software can safely conclude** | DETECTED: an email address is present (positive observation). |
| **What software CANNOT conclude** | Non-compliance from absence. The "if available" qualifier makes absence a non-finding. |
| **Recommendation** | **Exclude from compliance checks.** Report as informational: "Email detected" or "Email not detected (not required if unavailable)." |

---

### MVP-12 — Consumer Care Name/Address Present

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-12 |
| **Requirement** | Name and address of the person/office to contact for consumer complaints |
| **Rule reference** | Rule 6(2): "name, address, telephone number, e mail address, if available, of the person who can be or the office which can be, contacted, in case of consumer complaints" |
| **Source pages** | PDF p. 7 |
| **Classification** | **B — CONDITIONAL** |
| **Rationale** | The rule requires consumer care contact details. However, in practice, many packages use the manufacturer's own name and address for consumer care (since they ARE the contact point). The rule does not specify that the consumer care contact must be a *different* entity from the manufacturer. An OCR system cannot distinguish between "manufacturer address" (Rule 6(1)(a)) and "consumer care address" (Rule 6(2)) — they may be the same physical text on the label. This creates ambiguity: is the check for a *separate* consumer care block, or can the manufacturer address serve double duty? Without legal clarification, this check would produce unreliable results. |
| **What OCR would observe** | Text near "Consumer Care", "Contact us", "For complaints", "Customer Service", etc. |
| **What software can safely conclude** | DETECTED: consumer care contact block found. NOT DETECTED: no consumer care block found (but manufacturer address may serve this purpose). |
| **What software CANNOT conclude** | Whether the manufacturer address alone satisfies Rule 6(2). Whether a separate consumer care block is required. |
| **Recommendation** | **Include in MVP as a composite check with MVP-01/MVP-02.** If manufacturer name+address+phone are all present, report that consumer care contact information appears to be available. If a separate "Consumer Care" block exists, note it. Do NOT flag absence of a separate consumer care block as non-compliance. |

---

### MVP-13 — Declarations in Hindi or English

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-13 |
| **Requirement** | All declarations must be in Hindi (Devanagari script) or English |
| **Rule reference** | Rule 9(4): "The particulars of the declarations required to be specified under this rule on a package shall either be in Hindi in Devnagri script or in English" |
| **Source pages** | PDF p. 10 |
| **Classification** | **B — CONDITIONAL** |
| **Rationale** | The rule is clear. However, many Indian packages use multiple languages (Hindi + English + regional language). The rule *permits* additional languages: "Provided that nothing contained in this sub-rule shall prevent the use of any other language in addition to Hindi or English language." An OCR system processing a single photograph may see only the English portion of a multilingual label. More importantly, script detection is not the same as compliance checking — the system would need to confirm that ALL mandatory declarations (not just some) are in Hindi or English. This is a per-declaration check, not a whole-label check. |
| **What OCR would observe** | Script type of detected text (Latin, Devanagari, etc.) |
| **What software can safely conclude** | DETECTED: English text found. DETECTED: Devanagari text found. UNCERTAIN: whether all mandatory declarations are in an acceptable script. |
| **What software CANNOT conclude** | That a regional-language-only label is non-compliant (the label might have English on another panel not visible in the photo). |
| **Recommendation** | **Defer from MVP.** Script detection across an entire label from a single photo is unreliable. This is better addressed as a secondary check once the primary declaration checks are established. |

---

### MVP-14 — MRP Follows Prescribed Format

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-14 |
| **Requirement** | MRP must be declared in the format specified by Rule 2(m) |
| **Rule reference** | Rule 2(m): "the price shall be printed on the package in the manner given below: 'Maximum or Max. retail price Rs/ .......inclusive of all taxes' or 'MRP Rs/ .........incl., of all taxes'" |
| **Source pages** | PDF p. 3 |
| **Classification** | **B — CONDITIONAL** |
| **Rationale** | As discussed in MVP-09, the rule prescribes format examples, not an exhaustive specification. The real issue is: what constitutes a format violation? Is "MRP ₹299" without "incl. of all taxes" a format violation or a separate issue (MVP-09)? Is "MRP: Rs. 299/-" a format violation? Industry practice varies enormously. Without amendment clarification, this check overlaps with MVP-08 (MRP present) and MVP-09 (inclusive of taxes). Splitting it as a separate check creates redundancy and ambiguity. |
| **Recommendation** | **Merge into MVP-08 and MVP-09.** A combined check that (a) detects MRP presence and (b) detects "inclusive of all taxes" variant covers the format requirement without creating a separate, ambiguous check. |

---

### MVP-15 — Declarations Are Legible and Prominent

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-15 |
| **Requirement** | Declarations must be legible and prominent |
| **Rule reference** | Rule 9(1)(a): "Every declaration which is required to be made on a package under these rules shall be — (a) legible and prominent" |
| **Source pages** | PDF p. 10 |
| **Classification** | **C — NOT RELIABLY IMAGE-CHECKABLE** |
| **Rationale** | "Legible and prominent" is a subjective quality judgment. What is legible in a high-resolution studio photo may be illegible in a consumer snapshot. What is "prominent" depends on the overall label design. An OCR system that successfully extracts text has, by definition, found it legible *to the OCR engine* — but OCR legibility ≠ human legibility. Furthermore, prominence (size, placement, contrast relative to other text) requires comparative analysis of the entire label design, which is beyond current capabilities for a reliable compliance check. Rule 7 defines minimum numeral heights based on package size — but measuring font size from a photograph without a scale reference is unreliable. |
| **Recommendation** | **Exclude from MVP entirely.** This is a qualitative judgment that cannot be reliably automated. In future versions, if OCR confidence is very low on certain text regions, the system could note "Low confidence — text may not be legible" as an informational flag. |

---

### MVP-16 — MRP and Net Quantity Use Contrasting Colour

| Field | Value |
|-------|-------|
| **MVP ID** | MVP-16 |
| **Requirement** | Numerals of retail sale price and net quantity must be in a colour that contrasts conspicuously with the background |
| **Rule reference** | Rule 9(1)(b): "numerals of the retail sale price and net quantity declaration shall be printed, painted or inscribed on the package in a colour that contrasts conspicuously with the background of the label" |
| **Source pages** | PDF p. 10 |
| **Classification** | **C — NOT RELIABLY IMAGE-CHECKABLE** |
| **Rationale** | "Contrasts conspicuously" is a subjective visual standard. While image analysis could theoretically measure colour contrast ratios, this requires: (a) accurate colour reproduction in the photograph, (b) identification of which pixels belong to MRP numerals vs. background, (c) a defined contrast threshold (which the rule does not specify). A photograph taken in poor lighting, with glare, or with colour cast would produce unreliable contrast measurements. The proviso to Rule 9(1)(b) also exempts blown/formed/molded information on glass or plastic from the contrasting colour requirement — meaning embossed text on a bottle legitimately may not have colour contrast. |
| **Recommendation** | **Exclude from MVP entirely.** Colour contrast analysis from arbitrary photographs is unreliable. The OCR engine already implicitly tests legibility (low confidence = potential contrast issue), which provides indirect coverage. |

---

## SUMMARY CLASSIFICATION TABLE

| MVP ID | Check | Group | Justification Summary |
|--------|-------|-------|----------------------|
| MVP-01 | Manufacturer name present | **A** | Clear, unconditional, detectable |
| MVP-02 | Manufacturer address present | **B** | "Complete address" definition ambiguous; shorter address permitted |
| MVP-03 | Qualifier words present | **B** | Absence is not a violation — creates presumption, not penalty |
| MVP-04 | Generic product name present | **B** | Requires semantic brand-vs-generic distinction |
| MVP-05 | Net quantity with SI unit | **A** | Clear, unconditional, pattern-detectable |
| MVP-06 | SI units only | **A** | Subsumed by MVP-05 — merge |
| MVP-07 | Month/year of manufacture | **B** | Multiple product-category exceptions |
| MVP-08 | MRP present | **A** | Clear, universally applicable, pattern-detectable |
| MVP-09 | MRP "inclusive of all taxes" | **B** | Format flexibility; industry variations |
| MVP-10 | Consumer care phone number | **A** | Clear, unconditional, detectable |
| MVP-11 | Consumer care email | **C** | "If available" — absence is not a finding |
| MVP-12 | Consumer care name/address | **B** | May be same as manufacturer address |
| MVP-13 | Hindi or English script | **B** | Multi-language labels; per-declaration check unreliable |
| MVP-14 | MRP format compliance | **B** | Overlaps with MVP-08/MVP-09; format flexibility |
| MVP-15 | Legible and prominent | **C** | Subjective quality judgment |
| MVP-16 | Contrasting colour | **C** | Subjective; requires colour analysis from photos |

---

## PROPOSED SMALLEST REALISTIC MVP RULE SET

### Core Principle
**Only include checks where:**
1. The rule is clearly and unconditionally stated in the verified source
2. The detection is pattern-based and reliable from a photograph
3. The conclusion is limited to DETECTED / NOT DETECTED / UNCERTAIN
4. No product-category exemption can cause systematic false positives
5. No amendment dependency exists

### Recommended MVP: 6 Checks

| # | ID | Check | Source | Why This Makes the MVP |
|---|-----|-------|--------|----------------------|
| 1 | **MVP-A1** | Manufacturer/Packer/Importer **name** present | Rule 6(1)(a), 10(1) | Foundation check — if the entity responsible isn't identified, nothing else matters |
| 2 | **MVP-A2** | **Net quantity** declared with recognized SI unit | Rule 6(1)(c), 13(5)(i) | Core consumer protection — quantity is what you're buying |
| 3 | **MVP-A3** | **MRP** present with numeric value | Rule 6(1)(e), 2(m) | Price transparency — the most commercially significant declaration |
| 4 | **MVP-A4** | **Month and year** of manufacture/packing present | Rule 6(1)(d) | Freshness/safety indicator — detectable pattern |
| 5 | **MVP-A5** | **Consumer care phone number** present | Rule 6(2) | Consumer recourse — mandatory, unconditional, detectable |
| 6 | **MVP-A6** | **Manufacturer/Packer/Importer address** present | Rule 6(1)(a), 10(1) | Entity traceability — detect address-like text near manufacturer name |

### What the MVP Reports (Per Scan)

For each of the 6 checks, the system outputs:

```
Check: MVP-A1 — Manufacturer Name
Status: DETECTED | NOT DETECTED | UNCERTAIN
Observed: [extracted text]
Rule: Rule 6(1)(a), GSR 202(E) dated 07.03.2011
Note: "DETECTED" means a name was found. It does not mean the entity is legally registered or the name is complete."
```

### What the MVP Does NOT Do

- Does NOT declare any product as "LEGALLY COMPLIANT"
- Does NOT judge whether quantities are accurate
- Does NOT judge whether MRP is correct
- Does NOT classify products into food/cosmetic/drug categories
- Does NOT evaluate address completeness
- Does NOT check format variations of MRP
- Does NOT check script/language
- Does NOT check colour contrast or legibility

### Excluded Checks and Rationale

| Excluded ID | Reason for Exclusion |
|-------------|---------------------|
| MVP-03 (qualifier words) | Absence is not a violation — informational only |
| MVP-04 (generic name) | Requires semantic understanding beyond pattern matching |
| MVP-06 (SI units) | Merged into MVP-A2 |
| MVP-09 (incl. of all taxes) | Format flexibility creates unreliable compliance judgment |
| MVP-11 (email) | "If available" — absence is non-finding |
| MVP-12 (consumer care name/addr) | May be same as manufacturer address; ambiguous |
| MVP-13 (script) | Multi-language labels make per-photo check unreliable |
| MVP-14 (MRP format) | Merged into MVP-A3 |
| MVP-15 (legible/prominent) | Subjective quality judgment |
| MVP-16 (contrasting colour) | Requires colour analysis from arbitrary photos |

---

## IMPORTANT CAVEATS

1. **This MVP is a screening tool, not a legal compliance tool.** It identifies the *presence or absence* of declarations. It does not assess whether the declarations satisfy the legal requirements in full.

2. **Product category exceptions remain unresolved.** The MVP does not attempt to classify products. A food product, cosmetic, drug, or alcoholic beverage will be checked against the same 6 rules. If a product is exempt (e.g., drugs under Rule 26(c)), the system will flag potentially non-existent issues. This is acceptable for an MVP demonstration but must be addressed before production use.

3. **Amendments are not text-verified.** The 2021, 2022, 2023, 2025, and 2026 amendments may have added, modified, or withdrawn requirements. The MVP is based solely on the original 2011 text. Digital copies of all amendments should be obtained before the system is used for actual compliance screening.

4. **OCR quality is a prerequisite.** The MVP assumes OCR can extract text from package photographs. If OCR quality is poor (curved surfaces, reflective packaging, poor lighting), all checks degrade. The system should report OCR confidence alongside check results.

---

*This classification is based solely on the verified source text of GSR 202(E), 7 March 2011. No legal conclusions are drawn. No code, JSON, or YAML files have been created.*
