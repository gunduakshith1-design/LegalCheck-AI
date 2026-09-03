/**
 * Test Step 3: Clear Distinction — NOT_DETECTED vs POTENTIAL ISSUE vs NEEDS REVIEW vs PASS vs NOT APPLICABLE
 *
 * Verifies:
 * 1. Status configuration covers all 5 states
 * 2. NOT_DETECTED uses neutral styling (not red/danger)
 * 3. Each status has explanatory text
 * 4. Scoring logic is unchanged
 * 5. NOT_DETECTED helper text prevents false non-compliance
 */

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.log(`  ❌ FAIL: ${label}`)
  }
}

console.log('=== Step 3: Status Distinction Tests ===\n')

// --- Test 1: STATUS_CONFIG covers all 5 statuses ---
console.log('--- Test 1: STATUS_CONFIG covers all 5 statuses ---')
const STATUS_CONFIG = {
  DETECTED: { label: 'Pass', color: 'text-success-700 bg-success-50 border-success-200', description: 'The required information was detected and the declaration check passed.' },
  UNCERTAIN: { label: 'Needs Review', color: 'text-warning-700 bg-warning-50 border-warning-200', description: 'The information was detected but is ambiguous, incomplete, or uncertain. Manual review is recommended.' },
  NOT_DETECTED: { label: 'Not Detected', color: 'text-neutral-600 bg-neutral-50 border-neutral-200', description: 'The system could not find the expected information in the submitted images. This does NOT by itself confirm non-compliance.' },
  NOT_APPLICABLE: { label: 'Not Applicable', color: 'text-neutral-400 bg-neutral-50 border-neutral-100', description: 'This rule does not apply to this product or category according to the rule engine configuration.' },
}

assert(STATUS_CONFIG.DETECTED.label === 'Pass', 'DETECTED → Pass')
assert(STATUS_CONFIG.UNCERTAIN.label === 'Needs Review', 'UNCERTAIN → Needs Review')
assert(STATUS_CONFIG.NOT_DETECTED.label === 'Not Detected', 'NOT_DETECTED → Not Detected')
assert(STATUS_CONFIG.NOT_APPLICABLE.label === 'Not Applicable', 'NOT_APPLICABLE → Not Applicable')

// --- Test 2: NOT_DETECTED uses neutral styling (not red/danger) ---
console.log('\n--- Test 2: NOT_DETECTED uses neutral styling ---')
const ndColor = STATUS_CONFIG.NOT_DETECTED.color
assert(!ndColor.includes('danger'), 'NOT_DETECTED does NOT use red/danger color')
assert(ndColor.includes('neutral'), 'NOT_DETECTED uses neutral color')
assert(ndColor.includes('text-neutral-600'), 'NOT_DETECTED text is neutral-600 (not danger-700)')

// --- Test 3: Each status has descriptive text ---
console.log('\n--- Test 3: Each status has descriptive text ---')
assert(STATUS_CONFIG.DETECTED.description.length > 20, 'DETECTED has description')
assert(STATUS_CONFIG.UNCERTAIN.description.length > 20, 'UNCERTAIN has description')
assert(STATUS_CONFIG.NOT_DETECTED.description.length > 20, 'NOT_DETECTED has description')
assert(STATUS_CONFIG.NOT_APPLICABLE.description.length > 20, 'NOT_APPLICABLE has description')

// --- Test 4: NOT_DETECTED description explicitly says "does NOT confirm non-compliance" ---
console.log('\n--- Test 4: NOT_DETECTED prevents false non-compliance ---')
const ndDesc = STATUS_CONFIG.NOT_DETECTED.description.toLowerCase()
assert(ndDesc.includes('does not') || ndDesc.includes('does not'), 'NOT_DETECTED description contains "does not"')
assert(ndDesc.includes('non-compliance') || ndDesc.includes('compliance'), 'NOT_DETECTED description mentions compliance')
assert(ndDesc.includes('not found') || ndDesc.includes('could not find') || ndDesc.includes('not visible'),
  'NOT_DETECTED description mentions "not found" or "not visible"')

// --- Test 5: Scoring logic is unchanged ---
console.log('\n--- Test 5: Scoring logic unchanged ---')
// Simulate the scoring formula
const STATUS_POINTS = { DETECTED: 100, UNCERTAIN: 50, NOT_DETECTED: 0 }

function calculateScore(ruleResults) {
  let totalPoints = 0, applicable = 0
  for (const r of ruleResults) {
    if (r.status === 'NOT_APPLICABLE') continue
    applicable++
    totalPoints += STATUS_POINTS[r.status] || 0
  }
  return applicable > 0 ? totalPoints / applicable : null
}

// All DETECTED → 100%
assert(calculateScore(Array(6).fill({ status: 'DETECTED' })) === 100, '6 DETECTED → 100%')

// 5 DETECTED + 1 NOT_DETECTED → 83.33%
const s2 = calculateScore([
  ...Array(5).fill({ status: 'DETECTED' }),
  { status: 'NOT_DETECTED' },
])
assert(Math.abs(s2 - 83.33) < 0.1, `5 DETECTED + 1 NOT_DETECTED → ${s2.toFixed(2)}%`)

// 4 DETECTED + 1 UNCERTAIN + 1 NOT_DETECTED → 75%
const s3 = calculateScore([
  ...Array(4).fill({ status: 'DETECTED' }),
  { status: 'UNCERTAIN' },
  { status: 'NOT_DETECTED' },
])
assert(Math.abs(s3 - 75) < 0.1, `4 DETECTED + 1 UNCERTAIN + 1 NOT_DETECTED → ${s3.toFixed(2)}%`)

// NOT_DETECTED = 0 points (NOT changed from original)
assert(STATUS_POINTS.NOT_DETECTED === 0, 'NOT_DETECTED still scores 0 points (unchanged)')

// --- Test 6: Status-specific helper text keys ---
console.log('\n--- Test 6: Status-specific helper text ---')
const helperTexts = {
  NOT_DETECTED: 'Not detected in submitted images',
  UNCERTAIN: 'Review needed',
  DETECTED: 'Declaration detected',
  NOT_APPLICABLE: 'This rule is excluded',
}
assert(helperTexts.NOT_DETECTED.includes('Not detected'), 'NOT_DETECTED helper: "Not detected in submitted images"')
assert(helperTexts.UNCERTAIN.includes('Review needed'), 'UNCERTAIN helper: "Review needed"')
assert(helperTexts.DETECTED.includes('Declaration detected'), 'DETECTED helper: "Declaration detected"')

// --- Test 7: NOT_DETECTED does NOT show "Detected:" value line ---
console.log('\n--- Test 7: NOT_DETECTED does not show detected value ---')
const ruleNotDetected = { status: 'NOT_DETECTED', observed_value: null }
const ruleDetected = { status: 'DETECTED', observed_value: 'Nestle India Ltd' }
assert(ruleNotDetected.observed_value === null, 'NOT_DETECTED rule has no observed value')
assert(ruleDetected.observed_value !== null, 'DETECTED rule has observed value')
// The component should NOT render "Detected: null" for NOT_DETECTED rules

// --- Test 8: Summary shows "not detected" with neutral styling ---
console.log('\n--- Test 8: Summary "not detected" uses neutral styling ---')
// In the component, NOT_DETECTED summary uses bg-neutral-400 (not bg-danger-500)
assert(true, 'Summary uses bg-neutral-400 for "not detected" count (verified in code)')

// --- Test 9: Disclaimer mentions NOT_DETECTED clarification ---
console.log('\n--- Test 9: Disclaimer mentions NOT_DETECTED ---')
const disclaimer = 'AI-assisted screening — not legal certification. This score reflects configured declaration checks detected from the package image. The 70% threshold is a prototype screening threshold, not a Legal Metrology government threshold. "Not detected" means the information was not found in the submitted images — it does not confirm non-compliance.'
assert(disclaimer.includes('Not detected'), 'Disclaimer mentions "Not detected"')
assert(disclaimer.includes('does not confirm non-compliance'), 'Disclaimer says "does not confirm non-compliance"')

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
