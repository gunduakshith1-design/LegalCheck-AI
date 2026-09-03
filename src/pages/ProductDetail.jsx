import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Package, Loader2, MapPin, Store as StoreIcon, ShoppingCart, AlertTriangle, Shield, FileText, ChevronDown } from 'lucide-react'
import ScreeningScoreCard from '../components/ScreeningScoreCard'
import { fetchPublicProduct, dbRowToPublicProduct } from '../lib/storeService'
import { fetchReportsByFingerprint } from '../lib/reportService'

/**
 * Product detail page for buyers.
 *
 * Shows:
 * - Product info + image
 * - LegalCheck Screening score card (reuses ScreeningScoreCard with ruleResults)
 * - Expandable rule-level evidence
 * - Disclaimer: AI-assisted screening, not legal certification
 * - Compliance concern notices (previous reports, if any)
 * - Buy Now / Unavailable action
 *
 * No private user data is exposed.
 */

/** Compute a product fingerprint from public rule_results observed values. */
function fingerprintFromRuleResults(ruleResults) {
  if (!ruleResults || ruleResults.length === 0) return null

  const fields = ['manufacturer_name', 'manufacturer_address', 'net_quantity', 'common_name', 'country_of_origin']
  const components = []
  for (const field of fields) {
    const rule = ruleResults.find(r => r.field === field)
    const val = normalise(rule?.observed_value || '')
    if (val && val !== 'domestic_no_import_indicators') {
      components.push(`${field}:${val}`)
    }
  }

  const manufacturer = components.find(c => c.startsWith('manufacturer_name:'))
  if (!manufacturer) return null

  // Determine confidence
  const hasAddress = components.some(c => c.startsWith('manufacturer_address:'))
  const hasQuantity = components.some(c => c.startsWith('net_quantity:'))
  const hasName = components.some(c => c.startsWith('common_name:'))

  let confidence
  if (hasAddress && hasName && hasQuantity) confidence = 'high'
  else if (hasAddress && hasQuantity) confidence = 'medium'
  else confidence = 'low'

  // DJB2 hash for deterministic identity
  const hashInput = components.sort().join('||')
  let hash = 5381
  for (let i = 0; i < hashInput.length; i++) {
    hash = ((hash << 5) + hash + hashInput.charCodeAt(i)) & 0xffffffff
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0')

  return `v2:${confidence}:${hex}`
}

function normalise(str) {
  if (!str) return ''
  return str
    .toLowerCase()
    .replace(/[.,;:!?()\/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\d)\s+(g|kg|ml|l|gm|gms|ltr|ltrs|cm|mm)\b/g, '$1$2')
    .replace(/gms?/g, 'g')
    .replace(/mls?/g, 'ml')
    .replace(/ltrs?/g, 'l')
}

function ComplianceNoticeCard({ notice }) {
  const [expanded, setExpanded] = useState(false)
  const statusColor =
    notice.report_status === 'DRAFT' ? 'bg-neutral-50 text-neutral-600 border-neutral-200' :
    notice.report_status === 'PREPARED' ? 'bg-primary-50 text-primary-700 border-primary-200' :
    notice.report_status === 'OPENED_OFFICIAL_PORTAL' ? 'bg-warning-50 text-warning-700 border-warning-200' :
    notice.report_status === 'EMAILED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
    notice.report_status === 'CLOSED' ? 'bg-success-50 text-success-700 border-success-200' :
    'bg-neutral-50 text-neutral-600 border-neutral-200'

  return (
    <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 text-left flex items-center justify-between gap-2 hover:bg-amber-50/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">
                Reported {new Date(notice.created_at).toLocaleDateString()}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor}`}>
                {notice.report_status}
              </span>
            </div>
            {notice.concern_summary && (
              <p className="text-sm text-neutral-700 mt-0.5 truncate max-w-md">{notice.concern_summary}</p>
            )}
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-neutral-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-amber-100 pt-2 space-y-2">
          {notice.concern_summary && (
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-0.5">Concern Summary</p>
              <p className="text-sm text-neutral-700">{notice.concern_summary}</p>
            </div>
          )}
          <div className="flex items-center gap-4 text-xs text-neutral-500">
            {notice.screening_score != null && (
              <span>Screening score: <strong className="text-neutral-700">{Math.round(notice.screening_score)}%</strong></span>
            )}
            {notice.overall_status && (
              <span>Status: <strong className="text-neutral-700">{notice.overall_status}</strong></span>
            )}
          </div>
          <p className="text-xs text-amber-600 italic">
            Reporter identity is kept private. This does not confirm non-compliance.
          </p>
        </div>
      )}
    </div>
  )
}

const STATUS_MAP = {
  DETECTED: { label: 'Pass', badge: 'bg-success-50 text-success-700 border-success-200' },
  UNCERTAIN: { label: 'Needs Review', badge: 'bg-warning-50 text-warning-700 border-warning-200' },
  NOT_DETECTED: { label: 'Not Detected', badge: 'bg-neutral-50 text-neutral-600 border-neutral-200' },
  NOT_APPLICABLE: { label: 'Not Applicable', badge: 'bg-neutral-50 text-neutral-400 border-neutral-100' },
}

export default function ProductDetail() {
  const { storeId, productId } = useParams()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showScreeningDetails, setShowScreeningDetails] = useState(false)
  const [complianceNotices, setComplianceNotices] = useState([])
  const [loadingNotices, setLoadingNotices] = useState(false)

  useEffect(() => {
    if (!productId) return
    setLoading(true)

    fetchPublicProduct(productId).then(({ data, error: fetchErr }) => {
      if (data) {
        setProduct(dbRowToPublicProduct(data))
      } else {
        setError(fetchErr || 'Product not found or not currently listed.')
      }
      setLoading(false)
    })
  }, [productId])

  // Check for existing compliance concern reports on this product
  useEffect(() => {
    if (!product?.ruleResults) return
    setLoadingNotices(true)
    const fp = fingerprintFromRuleResults(product.ruleResults)
    if (!fp) {
      setLoadingNotices(false)
      return
    }
    fetchReportsByFingerprint(fp)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setComplianceNotices(data)
        }
      })
      .catch(() => {
        // Silently fail — notices are informational only
      })
      .finally(() => setLoadingNotices(false))
  }, [product])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center shadow-sm">
          <Package className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-1">Product not found</h3>
          <p className="text-sm text-neutral-500 mb-4">
            {error || 'This product may no longer be listed.'}
          </p>
          <Link
            to={storeId ? `/stores/${storeId}` : '/stores'}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Store
          </Link>
        </div>
      </div>
    )
  }

  const ruleResults = product.ruleResults || []
  const score = product.screeningScore
  const isOrderable = score != null && score >= 70

  // Build score data for ScreeningScoreCard
  const scoreData = score != null ? {
    screening_score: score,
    threshold: 70,
    threshold_status: score >= 70 ? 'MET' : 'BELOW_THRESHOLD',
    applicable_rules: ruleResults.length,
    detected_rules: ruleResults.filter((r) => r.status === 'DETECTED').length,
    uncertain_rules: ruleResults.filter((r) => r.status === 'UNCERTAIN').length,
    not_detected_rules: ruleResults.filter((r) => r.status === 'NOT_DETECTED').length,
    not_applicable_rules: ruleResults.filter((r) => r.status === 'NOT_APPLICABLE').length,
  } : null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        to={product.storeId ? `/stores/${product.storeId}` : '/stores'}
        className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {product.shopName || 'Store'}
      </Link>

      {/* Product Header */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Image(s) */}
          <div className="sm:w-64 h-48 bg-neutral-50 rounded-lg overflow-hidden flex-shrink-0">
            {product.imagePaths && product.imagePaths.length > 1 ? (
              <div className="grid grid-cols-2 h-full gap-0.5">
                {product.imagePaths.slice(0, 2).map((path, idx) => (
                  <div key={idx} className="relative">
                    <img src={path} alt={`${['Front', 'Back', 'Side'][idx]} of ${product.productName}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-0.5 left-0.5 text-[9px] font-medium text-white bg-black/50 px-1 rounded">
                      {['Front', 'Back', 'Side'][idx]}
                    </span>
                  </div>
                ))}
              </div>
            ) : product.imagePath ? (
              <img src={product.imagePath} alt={product.productName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="h-10 w-10 text-neutral-300" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-neutral-900">{product.productName}</h1>

            {/* Store link */}
            {product.storeId && (
              <Link
                to={`/stores/${product.storeId}`}
                className="inline-flex items-center gap-1.5 mt-2 text-sm text-primary-600 hover:text-primary-700"
              >
                <StoreIcon className="h-3.5 w-3.5" />
                {product.shopName}
                <span className="text-neutral-400">·</span>
                <MapPin className="h-3.5 w-3.5" />
                {product.city}, {product.state}
              </Link>
            )}

            {/* LegalCheck Screening — compact trust indicator */}
            {scoreData && (
              <div className="mt-4 flex items-center gap-3">
                <ScreeningScoreCard
                  scoreData={scoreData}
                  compact
                />
                <div className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                  isOrderable
                    ? 'bg-success-50 text-success-700 border-success-200'
                    : 'bg-neutral-50 text-neutral-600 border-neutral-200'
                }`}>
                  {isOrderable ? 'LegalCheck Screened' : 'Below Threshold'}
                </div>
              </div>
            )}

            {/* Buy Now / Unavailable */}
            <div className="mt-4">
              {isOrderable ? (
                <Link
                  to={`/checkout/${productId}`}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 hover:shadow-md transition-all shadow-sm"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Buy Now
                </Link>
              ) : (
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-neutral-100 text-neutral-500 rounded-lg text-sm font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Currently unavailable for ordering
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── LegalCheck Screening Section ─────────────────────────────── */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-neutral-900">LegalCheck Screening</h2>
        </div>

        {scoreData ? (
          <>
            {/* Full ScreeningScoreCard with rule-level evidence */}
            <ScreeningScoreCard
              scoreData={scoreData}
              ruleResults={ruleResults}
            />

            {/* Evidence summary */}
            {product.imageCount > 0 && (
              <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
                <span className="font-medium text-neutral-700">Evidence from {product.imageCount} image{product.imageCount !== 1 ? 's' : ''}</span>
                {product.imagePaths && product.imagePaths.length > 1 && (
                  <span className="text-neutral-400">({product.imagePaths.length > 2 ? 'Front + Back + Side' : 'Front + Back'})</span>
                )}
              </div>
            )}

            {/* View Screening Details — expandable rule list for buyers */}
            <div className="mt-4">
              <button
                onClick={() => setShowScreeningDetails(!showScreeningDetails)}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-primary-600 hover:text-primary-700 border border-neutral-200 rounded-lg hover:bg-primary-50 transition-colors"
              >
                {showScreeningDetails ? 'Hide Screening Details' : 'View Screening Details'}
              </button>

              {showScreeningDetails && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-neutral-600">
                    Each check verifies the presence of a specific declaration on the package label.
                    Evidence is extracted from the uploaded package images using OCR text analysis.
                  </p>
                  {ruleResults.map((rule) => {
                    const statusInfo = STATUS_MAP[rule.status] || STATUS_MAP.NOT_DETECTED
                    return (
                      <div
                        key={rule.rule_id || rule.field}
                        className="border border-neutral-200 rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-mono text-xs text-neutral-400">{rule.rule_id}</span>
                              <span className="text-sm font-medium text-neutral-900">
                                {(rule.field || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                              </span>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusInfo.badge}`}>
                                {statusInfo.label}
                              </span>
                            </div>
                            <p className="text-sm text-neutral-600">{rule.explanation}</p>
                            {rule.observed_value && rule.observed_value !== 'None' && rule.status !== 'NOT_DETECTED' && (
                              <div className="mt-2 flex items-center gap-2 text-sm">
                                <span className="text-neutral-500">Detected value:</span>
                                <span className="font-mono text-neutral-900 bg-neutral-50 px-2 py-0.5 rounded">
                                  {rule.observed_value}
                                </span>
                                {rule.confidence != null && rule.confidence > 0 && (
                                  <span className="text-neutral-400">
                                    ({Math.round(rule.confidence * 100)}% confidence)
                                  </span>
                                )}
                              </div>
                            )}
                            {rule.status === 'NOT_DETECTED' && (
                              <p className="mt-2 text-xs text-neutral-500 italic">
                                Not detected in submitted images — this does not by itself confirm non-compliance.
                                The information may be present on the package but was not visible in the submitted photos.
                              </p>
                            )}
                            {rule.status === 'UNCERTAIN' && (
                              <p className="mt-2 text-xs text-warning-600">
                                The system found some evidence but could not make a clear determination. Please verify this information on the physical package.
                              </p>
                            )}
                          </div>
                        </div>
                        {/* Evidence strings */}
                        {rule.evidence && rule.evidence.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-neutral-100">
                            <p className="text-xs font-medium text-neutral-500 mb-1">Evidence from OCR:</p>
                            <div className="space-y-1">
                              {rule.evidence.map((ev, i) => (
                                <div key={i} className="text-xs font-mono text-neutral-600 bg-neutral-50 px-2 py-1 rounded break-words">
                                  "{ev}"
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Legal reference */}
                        {rule.rule_reference && (
                          <p className="mt-2 text-xs text-neutral-400">
                            Reference: {rule.source_document} — {rule.rule_reference}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-neutral-500">
            No screening data available for this product.
          </p>
        )}      </div>

      {/* ─── Previous Compliance Concerns ─────────────────────────────── */}
      {complianceNotices.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-amber-900">
                Previous compliance concerns reported for this product
              </h3>
              <p className="text-sm text-amber-700 mt-1">
                {complianceNotices.length} compliance concern report{complianceNotices.length !== 1 ? 's' : ''} found.
                This product has been flagged by other users for review.
              </p>
              <div className="mt-3 space-y-2">
                {complianceNotices.slice(0, 3).map((notice) => (
                  <ComplianceNoticeCard key={notice.report_id} notice={notice} />
                ))}
                {complianceNotices.length > 3 && (
                  <p className="text-xs text-amber-600">
                    +{complianceNotices.length - 3} more report{complianceNotices.length - 3 !== 1 ? 's' : ''} not shown
                  </p>
                )}
              </div>
              <p className="text-xs text-amber-600 mt-2 italic">
                Reporter information is kept private. These reports are informational and do not confirm non-compliance.
              </p>
            </div>
          </div>
        </div>
      )}
      {loadingNotices && (
        <div className="text-xs text-neutral-400 text-center">
          Checking for compliance notices...
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end">
        <Link
          to={product.storeId ? `/stores/${product.storeId}` : '/stores'}
          className="px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-50"
        >
          Back to Store
        </Link>
      </div>
    </div>
  )
}
