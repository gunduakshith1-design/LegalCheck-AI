import React, { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, CheckCircle, AlertTriangle, XCircle, HelpCircle, FileText, Info } from 'lucide-react'
import SpotlightCard from './SpotlightCard'

const THRESHOLD = 70

/**
 * Status configuration — maps each rule engine status to a user-facing display.
 *
 * Backend statuses: DETECTED, UNCERTAIN, NOT_DETECTED, NOT_APPLICABLE
 *
 * The key rule: NOT_DETECTED must NEVER imply non-compliance.
 * It means "OCR did not find this field in the submitted images."
 */
const STATUS_CONFIG = {
  DETECTED: {
    label: 'Pass',
    color: 'text-success-700 bg-success-50 border-success-200',
    icon: CheckCircle,
    dot: 'bg-success-500',
    description: 'The required information was detected and the declaration check passed.',
  },
  UNCERTAIN: {
    label: 'Needs Review',
    color: 'text-warning-700 bg-warning-50 border-warning-200',
    icon: AlertTriangle,
    dot: 'bg-warning-500',
    description: 'The information was detected but is ambiguous, incomplete, or uncertain. Manual review is recommended.',
  },
  NOT_DETECTED: {
    label: 'Not Detected',
    color: 'text-neutral-600 bg-neutral-50 border-neutral-200',
    icon: XCircle,
    dot: 'bg-neutral-400',
    description: 'The system could not find the expected information in the submitted images. This does NOT by itself confirm non-compliance.',
  },
  NOT_APPLICABLE: {
    label: 'Not Applicable',
    color: 'text-neutral-400 bg-neutral-50 border-neutral-100',
    icon: HelpCircle,
    dot: 'bg-neutral-300',
    description: 'This rule does not apply to this product or category according to the rule engine configuration.',
  },
}

const RULE_TITLES = {
  manufacturer_name: 'Manufacturer / Packer / Importer Name',
  net_quantity: 'Net Quantity with SI Unit',
  mrp: 'MRP / Retail Sale Price',
  date_of_manufacture: 'Month & Year of Manufacture',
  consumer_care_phone: 'Consumer Care Telephone',
  manufacturer_address: 'Manufacturer / Packer Address',
  common_name: 'Common / Generic Name of Commodity',
  country_of_origin: 'Country of Origin (Imported Products)',
  best_before_date: 'Best Before / Use By Date',
  consumer_care_email: 'Consumer Care Email (optional)',
}

/**
 * Find which source image provided the evidence by cross-referencing
 * evidence strings with OCR text regions that carry a `source` field.
 */
function findEvidenceSource(evidence, textRegions) {
  if (!evidence || evidence.length === 0 || !textRegions || textRegions.length === 0) return null

  for (const ev of evidence) {
    const evLower = ev.toLowerCase().trim()
    if (!evLower) continue
    for (const region of textRegions) {
      if (region.source && region.text && region.text.toLowerCase().includes(evLower)) {
        return region.source
      }
    }
  }
  // Partial match: check if any evidence substring appears in a region
  for (const ev of evidence) {
    const evLower = ev.toLowerCase().trim()
    if (!evLower || evLower.length < 4) continue
    for (const region of textRegions) {
      if (region.source && region.text) {
        const regionLower = region.text.toLowerCase()
        if (evLower.length > 10 && regionLower.includes(evLower.slice(0, 10))) {
          return region.source
        }
        if (regionLower.includes(evLower) || evLower.includes(regionLower)) {
          return region.source
        }
      }
    }
  }
  return null
}

/**
 * Status-specific helper text shown in the expanded rule detail.
 * This is the key UX element that prevents NOT_DETECTED from being
 * presented as confirmed non-compliance.
 */
function StatusHelperText({ status, rule }) {
  if (status === 'NOT_DETECTED') {
    return (
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-neutral-100 border border-neutral-200">
        <Info className="h-4 w-4 text-neutral-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-neutral-600 leading-relaxed">
          <p className="font-medium text-neutral-700 mb-0.5">Not detected in submitted images</p>
          <p>
            This does not by itself confirm non-compliance. The information may be present on the package
            but was not visible in the submitted images. Check the package directly or add a clearer image
            of the relevant area.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'UNCERTAIN') {
    return (
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-warning-50 border border-warning-200">
        <AlertTriangle className="h-4 w-4 text-warning-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-warning-700 leading-relaxed">
          <p className="font-medium mb-0.5">Review needed</p>
          <p>
            The system found some evidence but could not make a clear determination.
            {rule.observed_value && rule.observed_value.includes('KEYWORD_FOUND_NO_DATE') && (
              <> A date-related keyword was found but the actual month/year could not be read.</>
            )}
            {rule.observed_value && rule.observed_value.includes('MRP_KEYWORD_FOUND_NO_VALUE') && (
              <> The MRP keyword was found but the numeric value could not be clearly identified.</>
            )}
            {' '}Please verify this information on the physical package.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'DETECTED') {
    return (
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-success-50 border border-success-200">
        <CheckCircle className="h-4 w-4 text-success-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-success-700 leading-relaxed">
          <p className="font-medium mb-0.5">Declaration detected</p>
          <p>
            The required information was found on the label and the basic declaration check passed.
            This is an observation from the image — it does not constitute legal certification.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'NOT_APPLICABLE') {
    return (
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-neutral-50 border border-neutral-100">
        <HelpCircle className="h-4 w-4 text-neutral-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-neutral-500 leading-relaxed">
          <p>
            This rule is excluded for this product type. It does not affect the screening score.
          </p>
        </div>
      </div>
    )
  }

  return null
}

/**
 * Single rule row in the expandable evidence list.
 */
function RuleDetailRow({ rule, textRegions }) {
  const [expanded, setExpanded] = useState(false)
  const config = STATUS_CONFIG[rule.status] || STATUS_CONFIG.NOT_DETECTED
  const Icon = config.icon
  const title = RULE_TITLES[rule.field] || rule.field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const sourceImage = findEvidenceSource(rule.evidence, textRegions)

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-neutral-50 transition-colors"
      >
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${config.color.split(' ').slice(1).join(' ')}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-900 truncate">{title}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.color.split(' ').slice(0, 2).join(' ')}`}>
              {config.label}
            </span>
          </div>
          {rule.observed_value && rule.observed_value !== 'None' && rule.status !== 'NOT_DETECTED' && (
            <p className="text-xs text-neutral-500 mt-0.5 truncate">
              Detected: <span className="font-medium text-neutral-700">{rule.observed_value}</span>
            </p>
          )}
          {rule.status === 'NOT_DETECTED' && (
            <p className="text-xs text-neutral-400 mt-0.5 italic">
              Not found in submitted images
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {sourceImage && (
            <span className="text-xs text-neutral-400 hidden sm:inline">{sourceImage}</span>
          )}
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-neutral-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-neutral-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-neutral-100 bg-neutral-50 space-y-2">
          {/* Status description */}
          <p className="text-sm text-neutral-600">{config.description}</p>

          {/* Rule explanation from backend */}
          <p className="text-sm text-neutral-600">{rule.explanation}</p>

          {/* Status-specific helper text */}
          <StatusHelperText status={rule.status} rule={rule} />

          {/* Extracted value — only show when detected */}
          {rule.observed_value && rule.observed_value !== 'None' && rule.status !== 'NOT_DETECTED' && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-neutral-500">Extracted value:</span>
              <span className="font-mono text-neutral-900 bg-white px-2 py-0.5 rounded border border-neutral-200">
                {rule.observed_value}
              </span>
              {rule.confidence > 0 && (
                <span className="text-neutral-400">
                  ({(rule.confidence * 100).toFixed(0)}% confidence)
                </span>
              )}
            </div>
          )}

          {/* Source image */}
          {sourceImage && (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-3.5 w-3.5 text-neutral-400" />
              <span className="text-neutral-500">Source image:</span>
              <span className="font-medium text-neutral-700">{sourceImage}</span>
            </div>
          )}

          {/* OCR evidence */}
          {rule.evidence && rule.evidence.length > 0 && (
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1">Evidence from OCR:</p>
              <div className="space-y-1">
                {rule.evidence.map((ev, i) => (
                  <div key={i} className="text-xs font-mono text-neutral-600 bg-white px-2 py-1 rounded border border-neutral-200 break-words overflow-hidden">
                    "{ev}"
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legal reference */}
          {rule.rule_reference && (
            <p className="text-xs text-neutral-400">
              Reference: {rule.source_document} — {rule.rule_reference}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * ScreeningScoreCard — Evidence-backed compliance screening score.
 *
 * Shows:
 * - Score (0–100) as the visual focus
 * - Summary: passed / needs review / not detected (with clear labels)
 * - Expandable "Why this score?" section with per-rule evidence
 * - Status-specific explanatory text preventing false non-compliance conclusions
 * - Source image identification for multi-image scans
 * - Disclaimer
 */
export default function ScreeningScoreCard({ scoreData, ruleResults = [], textRegions = [], compact = false, imageCount = 0, imageQuality = [], showIssues = false, ruleSetVersion = null }) {
  const [showDetails, setShowDetails] = useState(showIssues)

  // Auto-expand when showIssues prop changes to true
  React.useEffect(() => {
    if (showIssues) setShowDetails(true)
  }, [showIssues])

  // Sort rules: DETECTED first, then UNCERTAIN, then NOT_DETECTED, then NOT_APPLICABLE.
  // Computed unconditionally before any early return so all hooks run in the
  // same order on every render (Rules of Hooks). When scoreData is null the
  // result is simply unused. Depends only on the ruleResults prop.
  const sortedRules = useMemo(() => {
    if (!ruleResults || ruleResults.length === 0) return []
    const order = { DETECTED: 0, UNCERTAIN: 1, NOT_DETECTED: 2, NOT_APPLICABLE: 3 }
    return [...ruleResults].sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4))
  }, [ruleResults])

  if (!scoreData) return null

  const score = scoreData.screening_score
  const thresholdStatus = scoreData.threshold_status
  const isMet = thresholdStatus === 'MET'
  const isEvaluable = score !== null && thresholdStatus !== 'NOT_EVALUABLE'

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {isEvaluable ? (
          <>
            <div className={`text-2xl font-bold ${isMet ? 'text-success-700' : 'text-danger-700'}`}>
              {Math.round(score)}%
            </div>
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isMet ? 'bg-success-500' : 'bg-danger-500'}`} />
          </>
        ) : (
          <div className="text-lg font-medium text-neutral-400">N/A</div>
        )}
      </div>
    )
  }

  return (
    <SpotlightCard className="p-6" spotlightColor="rgba(0, 100, 255, 0.06)">
      {isEvaluable ? (
        <>
          {/* Score — Visual Focus */}
          <div className="flex flex-col items-center py-3">
            <p className="text-sm font-medium text-neutral-500 mb-2">Screening Score</p>
            <div className={`text-6xl font-bold mb-2 tracking-tight ${isMet ? 'text-success-700' : 'text-danger-700'}`}>
              {Math.round(score)}%
            </div>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
              isMet ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'
            }`}>
              <div className={`w-2 h-2 rounded-full ${isMet ? 'bg-success-500' : 'bg-danger-500'}`} />
              {isMet ? 'Screening threshold met (≥70%)' : 'Below screening threshold (<70%)'}
            </div>
          </div>

          {/* Summary — Clear status breakdown */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm mb-4">
            {scoreData.detected_rules > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-success-500" />
                <span className="text-neutral-700"><strong>{scoreData.detected_rules}</strong> passed</span>
              </span>
            )}
            {scoreData.uncertain_rules > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-warning-500" />
                <span className="text-neutral-700"><strong>{scoreData.uncertain_rules}</strong> needs review</span>
              </span>
            )}
            {scoreData.not_detected_rules > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-neutral-400" />
                <span className="text-neutral-500"><strong>{scoreData.not_detected_rules}</strong> not detected</span>
              </span>
            )}
          </div>

          {scoreData.not_applicable_rules > 0 && (
            <p className="text-xs text-neutral-400 mb-4 text-center">
              {scoreData.not_applicable_rules} rule(s) excluded as not applicable
            </p>
          )}

          {/* Image coverage summary */}
          {imageCount > 0 && (
            <div className="flex items-center justify-center gap-2 text-xs text-neutral-500 mb-4">
              <span className="font-medium text-neutral-700">{imageCount} image{imageCount !== 1 ? 's' : ''} analyzed</span>
              {imageQuality.length > 0 && (
                <span>— {imageQuality.map(iq => iq.label).join(' + ')}</span>
              )}
            </div>
          )}

          {/* NOT_DETECTED clarification — shown prominently when there are undetected rules */}
          {scoreData.not_detected_rules > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-neutral-50 border border-neutral-200">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-neutral-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-neutral-600 leading-relaxed">
                  <strong className="text-neutral-700">{scoreData.not_detected_rules} field(s) were not detected</strong> in the submitted images.
                  This does not confirm non-compliance — the information may be present on the package
                  but was not visible in the photos. Consider adding clearer images or checking the package directly.
                </p>
              </div>
            </div>
          )}

          {/* Expandable: Why this score? */}
          {sortedRules.length > 0 && (
            <div className="border-t border-neutral-200 pt-4">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                {showDetails ? (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    Hide details
                  </>
                ) : (
                  <>
                    <ChevronRight className="h-4 w-4" />
                    Why this score?
                  </>
                )}
              </button>

              {showDetails && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-neutral-500 mb-2">
                    Each Legal Metrology check and its result:
                  </p>
                  {sortedRules.map((rule) => (
                    <RuleDetailRow
                      key={rule.rule_id}
                      rule={rule}
                      textRegions={textRegions}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-6">
          <div className="text-lg font-medium text-neutral-400 mb-1">Not Evaluable</div>
          <p className="text-sm text-neutral-500">
            No applicable rules were evaluated for this scan.
          </p>
        </div>
      )}

      {/* Disclaimer */}
      <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
        <p className="text-xs text-blue-700">
          AI-assisted screening — not legal certification. This score reflects configured declaration checks
          detected from the package image. The {THRESHOLD}% threshold is a prototype screening threshold,
          not a Legal Metrology government threshold. "Not detected" means the information was not found
          in the submitted images — it does not confirm non-compliance.
        </p>
        {ruleSetVersion && (
          <p className="text-xs text-blue-600 mt-1.5">
            Rule Set: Packaged Commodities Rules — 2011 &middot; Engine Version: {ruleSetVersion}
          </p>
        )}
      </div>
    </SpotlightCard>
  )
}
