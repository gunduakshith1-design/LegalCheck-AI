import React, { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FileText, CheckCircle, Camera, X, RefreshCw, Eye } from 'lucide-react'
import ScreeningScoreCard from '../components/ScreeningScoreCard'
import ScanProcessingPanel from '../components/ScanProcessingPanel'
import FadeContent from '../components/FadeContent'
import { useAuth } from '../contexts/AuthContext'
import { persistScan } from '../lib/scanService'
import {
  computeProductFingerprint,
  fetchReportsByFingerprint,
  checkExistingUserReport,
} from '../lib/reportService'

const STATUS_COLORS = {
  NO_ISSUES_DETECTED: 'bg-success-50 text-success-700 border-success-200',
  POTENTIAL_NON_COMPLIANCE: 'bg-danger-50 text-danger-700 border-danger-200',
  REVIEW_REQUIRED: 'bg-warning-50 text-warning-700 border-warning-200',
  INSUFFICIENT_EVIDENCE: 'bg-neutral-50 text-neutral-700 border-neutral-200',
}

const STATUS_LABELS = {
  NO_ISSUES_DETECTED: 'No Issues Detected',
  POTENTIAL_NON_COMPLIANCE: 'Potential Non-Compliance',
  REVIEW_REQUIRED: 'Review Required',
  INSUFFICIENT_EVIDENCE: 'Insufficient Evidence',
}

const IMAGE_SLOTS = [
  { key: 'front', label: 'Front', required: true, description: 'Main label / brand name' },
  { key: 'back', label: 'Back', required: true, description: 'Nutrition info, ingredients, manufacturer' },
  { key: 'side', label: 'Side', required: false, description: 'MRP, barcode, batch details (optional)' },
]

const QUALITY_CONFIG = {
  clear: { icon: CheckCircle, color: 'text-success-600', bg: 'bg-success-50', label: 'Clear' },
  fair: { icon: Eye, color: 'text-warning-600', bg: 'bg-warning-50', label: 'Partially readable' },
  poor: { icon: AlertTriangle, color: 'text-warning-600', bg: 'bg-warning-50', label: 'Hard to read' },
  no_text: { icon: X, color: 'text-danger-600', bg: 'bg-danger-50', label: 'No text detected' },
}

/**
 * Compact scan coverage panel shown after analysis.
 * Displays which images were uploaded and their OCR quality.
 */
function ScanCoveragePanel({ imageQuality, imageUrls, onRetake, onRemove, disabled }) {
  if (!imageQuality || imageQuality.length === 0) return null

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-neutral-900 mb-3">Scan Coverage</h3>
      <div className="space-y-2">
        {imageQuality.map((iq) => {
          const config = QUALITY_CONFIG[iq.quality_status] || QUALITY_CONFIG.clear
          const Icon = config.icon
          const slot = IMAGE_SLOTS.find(s => s.label === iq.label)
          return (
            <div key={iq.label} className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${config.bg}`}>
                <Icon className={`h-3.5 w-3.5 ${config.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900">{iq.label}</span>
                  <span className={`text-xs ${config.color}`}>{config.label}</span>
                  {slot && !slot.required && (
                    <span className="text-xs text-neutral-400">(optional)</span>
                  )}
                </div>
                <p className="text-xs text-neutral-500">
                  {iq.line_count} text region{iq.line_count !== 1 ? 's' : ''} · {(iq.average_confidence * 100).toFixed(0)}% confidence
                  {iq.low_confidence_regions > 0 && (
                    <span className="text-warning-600"> · {iq.low_confidence_regions} low-confidence</span>
                  )}
                </p>
              </div>
              {!disabled && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => onRetake(iq.label)}
                    className="p-1 text-neutral-400 hover:text-primary-600 rounded transition-colors"
                    title="Retake image"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  {slot && !slot.required && (
                    <button
                      onClick={() => onRemove(iq.label)}
                      className="p-1 text-neutral-400 hover:text-danger-600 rounded transition-colors"
                      title="Remove image"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Quality warnings */}
      {imageQuality.some(iq => iq.quality_status === 'poor' || iq.quality_status === 'no_text') && (
        <div className="mt-3 p-2 rounded-lg bg-warning-50 border border-warning-200">
          {imageQuality.filter(iq => iq.quality_status === 'no_text').map(iq => (
            <p key={iq.label} className="text-xs text-warning-700">
              ⚠ {iq.label} image has no detectable text. Retake recommended before screening.
            </p>
          ))}
          {imageQuality.filter(iq => iq.quality_status === 'poor').map(iq => (
            <p key={iq.label} className="text-xs text-warning-700">
              ⚠ {iq.label} image is hard to read. Retake recommended before screening.
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Single image upload slot with preview and label.
 */
function ImageSlot({ slot, image, onImageSelect, onRemove, disabled }) {
  const inputRef = React.useRef()
  const [dragActive, setDragActive] = useState(false)

  const handleFile = useCallback((file) => {
    if (!file) return
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg']
    if (!allowedTypes.includes(file.type)) return
    if (file.size > 10 * 1024 * 1024) return
    onImageSelect(slot.key, file)
  }, [slot.key, onImageSelect])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  const handleDrag = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(e.type === 'dragenter' || e.type === 'dragover')
  }, [])

  if (image) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-neutral-500" />
            <span className="text-sm font-medium text-neutral-900">{slot.label}</span>
            {slot.required && <span className="text-xs text-danger-600">Required</span>}
          </div>
          <button
            onClick={() => onRemove(slot.key)}
            disabled={disabled}
            className="p-1 text-neutral-400 hover:text-danger-600 rounded transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="aspect-[4/3] bg-neutral-50 overflow-hidden">
          <img src={URL.createObjectURL(image)} alt={`${slot.label} of product`} className="w-full h-full object-contain" />
        </div>
        <div className="px-4 py-2 text-xs text-neutral-500 truncate">
          {image.name} ({(image.size / 1024).toFixed(0)} KB)
        </div>
      </div>
    )
  }

  return (
    <div
      className={`bg-white rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
        dragActive ? 'border-primary-400 bg-primary-50' : 'border-neutral-300 hover:border-primary-300 hover:bg-neutral-50'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".png,.jpg,.jpeg"
        onChange={(e) => handleFile(e.target.files?.[0])}
        disabled={disabled}
      />
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
          slot.required ? 'bg-primary-100' : 'bg-neutral-100'
        }`}>
          <Camera className={`h-6 w-6 ${slot.required ? 'text-primary-600' : 'text-neutral-400'}`} />
        </div>
        <p className="text-sm font-medium text-neutral-900">{slot.label}</p>
        <p className="text-xs text-neutral-500 mt-1">{slot.description}</p>
        {!slot.required && (
          <p className="text-xs text-neutral-400 mt-1">Optional</p>
        )}
      </div>
    </div>
  )
}

export default function ScanProduct({ scanStore }) {
  const { user } = useAuth()
  const [images, setImages] = useState({}) // { front: File, back: File, side?: File }
  const [imageUrls, setImageUrls] = useState({}) // { front: url, back: url, side?: url }
  const [uploading, setUploading] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [error, setError] = useState(null)
  const [persisted, setPersisted] = useState(false)
  const [persistError, setPersistError] = useState(null)
  const [existingReports, setExistingReports] = useState([])
  const [existingUserReport, setExistingUserReport] = useState(null)
  const [checkingExisting, setCheckingExisting] = useState(false)
  const [fingerprintConfidence, setFingerprintConfidence] = useState(null)
  const [showCoverage, setShowCoverage] = useState(false)
  const [previousScanScore, setPreviousScanScore] = useState(null)
  const [showIssues, setShowIssues] = useState(false)
  const [imageLabels, setImageLabels] = useState([])

  const handleRemoveImage = useCallback((slotKey) => {
    if (imageUrls[slotKey]) {
      URL.revokeObjectURL(imageUrls[slotKey])
    }
    setImages(prev => {
      const next = { ...prev }
      delete next[slotKey]
      return next
    })
    setImageUrls(prev => {
      const next = { ...prev }
      delete next[slotKey]
      return next
    })
    setScanResult(null)
    setError(null)
    setPersisted(false)
    setPersistError(null)
  }, [imageUrls])

  const handleImageSelect = useCallback((slotKey, file) => {
    // Reset scan state when images change
    setScanResult(null)
    setError(null)
    setPersisted(false)
    setPersistError(null)
    setExistingReports([])
    setExistingUserReport(null)

    // Revoke old URL if replacing
    if (imageUrls[slotKey]) {
      URL.revokeObjectURL(imageUrls[slotKey])
    }

    const url = URL.createObjectURL(file)
    setImages(prev => ({ ...prev, [slotKey]: file }))
    setImageUrls(prev => ({ ...prev, [slotKey]: url }))
  }, [imageUrls])

  const handleRetake = useCallback((label) => {
    // Find the slot key for this label
    const slot = IMAGE_SLOTS.find(s => s.label === label)
    if (slot) {
      handleRemoveImage(slot.key)
    }
  }, [handleRemoveImage])

  const handleRemoveCoverage = useCallback((label) => {
    const slot = IMAGE_SLOTS.find(s => s.label === label)
    if (slot) {
      handleRemoveImage(slot.key)
    }
  }, [handleRemoveImage])

  const clearAll = useCallback(() => {
    Object.values(imageUrls).forEach(url => URL.revokeObjectURL(url))
    setImages({})
    setImageUrls({})
    setScanResult(null)
    setError(null)
    setPersisted(false)
    setPersistError(null)
    setExistingReports([])
    setExistingUserReport(null)
    setPreviousScanScore(null)
    setShowIssues(false)
  }, [imageUrls])

  /**
   * Scan Again: preserve old scan score, return to upload view.
   * The old scan remains in history. A new scan will be created.
   */
  const handleScanAgain = useCallback(() => {
    const currentScore = scanResult?.screening_score?.screening_score ?? null
    if (currentScore != null) {
      setPreviousScanScore(currentScore)
    }
    // Clear current scan result but keep images for reference
    setScanResult(null)
    setError(null)
    setPersisted(false)
    setPersistError(null)
    setExistingReports([])
    setExistingUserReport(null)
    setShowIssues(false)
    // Scroll to top of upload area
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [scanResult])

  /**
   * Retry: re-run the analysis with the same images.
   */
  const handleRetry = useCallback(() => {
    setError(null)
    setScanResult(null)
    setPersisted(false)
    setPersistError(null)
    setExistingReports([])
    setExistingUserReport(null)
    // Re-trigger analysis
    analyzeProduct()
  }, [images])

  const hasRequiredImages = images.front && images.back
  const imageCount = Object.keys(images).length

  const analyzeProduct = async () => {
    if (!hasRequiredImages) return

    setUploading(true)
    setError(null)
    setScanResult(null)
    setPersisted(false)
    setPersistError(null)
    setExistingReports([])
    setExistingUserReport(null)

    // Build labels for the processing panel
    const labels = []
    for (const slot of IMAGE_SLOTS) {
      if (images[slot.key]) {
        labels.push(slot.label)
      }
    }
    setImageLabels(labels)

    try {
      const formData = new FormData()

      // Append images in order: front, back, side
      for (const slot of IMAGE_SLOTS) {
        if (images[slot.key]) {
          formData.append('files', images[slot.key])
        }
      }
      formData.append('labels', labels.join(','))
      formData.append('preprocessing', 'standard')

      const response = await fetch('/api/scan-multi', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail?.error || data.error || 'Scan processing failed')
      }

      // Add local image URLs to the result for display
      data._localImageUrls = { ...imageUrls }

      setScanResult(data)

      // Persist the scan to Supabase
      if (user?.id) {
        const imagePaths = (data.files || []).map(f => f.url)
        const { error: persistErr } = await persistScan(user.id, data, imagePaths)
        if (persistErr) {
          console.error('[ScanProduct] Persistence failed:', persistErr)
          setPersistError('Scan completed but could not be saved to history. Results are still visible.')
        } else {
          setPersisted(true)
        }

        // Check for existing product reports
        setCheckingExisting(true)
        try {
          const { fingerprint, confidence } = computeProductFingerprint(data.fields)
          if (fingerprint) {
            const [allReports, userReport] = await Promise.all([
              fetchReportsByFingerprint(fingerprint, data.fields),
              checkExistingUserReport(user.id, fingerprint),
            ])
            setFingerprintConfidence(confidence)
            setExistingReports(allReports.data || [])
            if (userReport.exists) {
              setExistingUserReport(userReport.report)
            }
          }
        } catch (e) {
          console.warn('[ScanProduct] Existing report check failed:', e)
        } finally {
          setCheckingExisting(false)
        }
      }
    } catch (err) {
      console.error('Scan error:', err)
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setUploading(false)
    }
  }

  const score = scanResult?.screening_score?.screening_score ?? null
  const qualifiesForReport = score != null && score < 70

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <h1 className="text-xl sm:text-2xl font-semibold text-neutral-900">Scan Product</h1>
        <p className="text-neutral-600 mt-1">
          Upload 2–3 images of the same product (front, back, and optional side) for comprehensive compliance screening
        </p>
      </div>

      {/* Scan Results View */}
      {scanResult && (
        <FadeContent blur duration={300}>
        <div className="space-y-6">

          {/* Progression Indicator — shown when user arrived via Scan Again */}
          {previousScanScore != null && (
            <div className="bg-white rounded-lg border border-primary-200 p-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex-1">
                  <p className="text-xs font-medium text-neutral-500 mb-1">Previous scan</p>
                  <p className={`text-2xl font-bold ${previousScanScore >= 70 ? 'text-success-700' : 'text-danger-700'}`}>
                    {Math.round(previousScanScore)}%
                  </p>
                </div>
                <div className="flex sm:flex-col items-center gap-2">
                  <div className="hidden sm:block w-8 h-px bg-neutral-300" />
                  <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <div className="hidden sm:block w-8 h-px bg-neutral-300" />
                </div>
                <div className="flex-1 sm:text-right">
                  <p className="text-xs font-medium text-neutral-500 mb-1">New scan</p>
                  <p className={`text-2xl font-bold ${score >= 70 ? 'text-success-700' : 'text-danger-700'}`}>
                    {Math.round(score)}%
                  </p>
                </div>
                <div className="flex-shrink-0">
                  {score >= 70 && previousScanScore < 70 ? (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium bg-success-50 text-success-700 border border-success-200">
                      ✓ Now eligible
                    </span>
                  ) : score > previousScanScore ? (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium bg-success-50 text-success-700 border border-success-200">
                      ↑ Improved
                    </span>
                  ) : score === previousScanScore ? (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium bg-neutral-50 text-neutral-600 border border-neutral-200">
                      → Same score
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium bg-warning-50 text-warning-700 border border-warning-200">
                      ↓ Lower score
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* Persistence status */}
          {persisted && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-success-50 border border-success-200 text-success-700 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Scan saved to your history.
            </div>
          )}
          {persistError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning-50 border border-warning-200 text-warning-700 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {persistError}
            </div>
          )}

          {/* Existing Product Reports Banner */}
          {existingReports.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-blue-900">This product has been reported before</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    {existingReports.length} compliance concern report{existingReports.length !== 1 ? 's' : ''} found from {existingReports.length === 1 ? 'another user' : 'other users'}.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Existing User Report Banner */}
          {existingUserReport && (
            <div className="bg-warning-50 border border-warning-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-warning-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-warning-900">You have already reported this product</h3>
                  <p className="text-sm text-warning-700 mt-1">
                    Your previous report is in status: <span className="font-medium">{existingUserReport.status}</span>.
                  </p>
                  <Link to="/reports" className="mt-2 inline-block text-xs font-medium text-warning-800 hover:text-warning-900 underline">
                    View your reports →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {checkingExisting && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-neutral-600 text-sm">
              <svg className="animate-spin h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Checking for existing reports on this product...
            </div>
          )}

          {/* Overall Status Banner */}
          <div className={`border rounded-lg p-4 shadow-sm ${STATUS_COLORS[scanResult.overall_status] || STATUS_COLORS.REVIEW_REQUIRED}`}>
            <div className="flex items-center gap-3">
              {scanResult.overall_status === 'NO_ISSUES_DETECTED' && (
                <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {scanResult.overall_status === 'POTENTIAL_NON_COMPLIANCE' && (
                <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              {scanResult.overall_status === 'REVIEW_REQUIRED' && (
                <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <div>
                <p className="font-semibold text-lg">
                  {STATUS_LABELS[scanResult.overall_status] || scanResult.overall_status}
                </p>
                <p className="text-sm opacity-80 mt-0.5">
                  {scanResult.overall_status === 'NO_ISSUES_DETECTED'
                    ? 'All configured declaration checks found the expected information across all uploaded images.'
                    : scanResult.overall_status === 'POTENTIAL_NON_COMPLIANCE'
                    ? 'One or more required declarations were not detected on any of the uploaded images.'
                    : 'Some declarations could not be clearly identified. Manual review recommended.'}
                </p>
              </div>
            </div>
          </div>

          {/* Screening Score */}
          <div data-testid="screening-score-card">
            <ScreeningScoreCard
              scoreData={scanResult.screening_score}
              ruleResults={scanResult.rule_results}
              textRegions={scanResult.ocr?.text_regions || []}
              imageCount={scanResult.image_count || imageCount}
              imageQuality={scanResult.image_quality}
              showIssues={showIssues}
              ruleSetVersion={scanResult.rule_set_version}
            />
          </div>

          {/* Scan Coverage Panel */}
          {scanResult.image_quality && scanResult.image_quality.length > 0 && (
            <ScanCoveragePanel
              imageQuality={scanResult.image_quality}
              imageUrls={scanResult._localImageUrls}
              onRetake={handleRetake}
              onRemove={handleRemoveCoverage}
              disabled={uploading}
            />
          )}

          {/* Uploaded Images */}
          <div className="bg-white rounded-lg border border-neutral-200 shadow-sm">
            <div className="px-6 py-4 border-b border-neutral-200">
              <h2 className="text-lg font-semibold text-neutral-900">Scanned Images ({scanResult.image_count || imageCount})</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {scanResult.files?.map((f, idx) => (
                  <div key={idx} className="text-center">
                    <div className="aspect-[4/3] bg-neutral-50 rounded-lg border border-neutral-200 overflow-hidden mb-2">
                      <img
                        src={scanResult._localImageUrls?.[IMAGE_SLOTS[idx]?.key] || f.url}
                        alt={f.label}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <p className="text-xs font-medium text-neutral-700">{f.label}</p>
                  </div>
                ))}
                {(!scanResult.files || scanResult.files.length === 0) && imageCount > 0 && (
                  IMAGE_SLOTS.filter(s => imageUrls[s.key]).map(slot => (
                    <div key={slot.key} className="text-center">
                      <div className="aspect-[4/3] bg-neutral-50 rounded-lg border border-neutral-200 overflow-hidden mb-2">
                        <img src={imageUrls[slot.key]} alt={slot.label} className="w-full h-full object-contain" />
                      </div>
                      <p className="text-xs font-medium text-neutral-700">{slot.label}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Scan Metadata */}
          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Scan Metadata</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-neutral-500">OCR Engine</span>
                <p className="font-medium text-neutral-900">{scanResult.ocr?.engine}</p>
              </div>
              <div>
                <span className="text-neutral-500">Total text regions</span>
                <p className="font-medium text-neutral-900">{scanResult.ocr?.line_count}</p>
              </div>
              <div>
                <span className="text-neutral-500">Avg confidence</span>
                <p className="font-medium text-neutral-900">
                  {((scanResult.ocr?.average_confidence || 0) * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <span className="text-neutral-500">Total time</span>
                <p className="font-medium text-neutral-900">{scanResult.timing?.total_seconds}s</p>
              </div>
            </div>
            {scanResult.rule_set_version && (
              <div className="mt-3 pt-3 border-t border-neutral-100">
                <p className="text-xs text-neutral-500">
                  Rule Set: <span className="font-medium text-neutral-700">Packaged Commodities Rules — 2011</span>
                  {' '}&middot;{' '}
                  Engine Version: <span className="font-medium text-neutral-700">{scanResult.rule_set_version}</span>
                </p>
              </div>
            )}
          </div>



          {/* Limitations */}
          {scanResult.limitations && scanResult.limitations.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-2">Important Notes</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                {scanResult.limitations.slice(0, 6).map((note, i) => (
                  <li key={i}>• {note}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Raw OCR Text */}
          <div className="bg-white rounded-lg border border-neutral-200 shadow-sm">
            <details>
              <summary className="px-6 py-4 cursor-pointer text-sm font-medium text-neutral-700 hover:text-neutral-900">
                Raw OCR Text — Combined from {scanResult.image_count || imageCount} image(s) ({scanResult.ocr?.text_regions?.length || 0} regions)
              </summary>
              <div className="px-6 pb-4">
                <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-4 max-h-64 overflow-y-auto">
                  <p className="text-sm text-neutral-900 whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {scanResult.ocr?.raw_text}
                  </p>
                </div>
              </div>
            </details>
          </div>

          {/* Action buttons — Review → Fix → Re-scan workflow */}
          {qualifiesForReport ? (
            <div className="bg-white rounded-lg border border-neutral-200 p-5 shadow-sm">
              <p className="text-sm font-medium text-neutral-900 mb-3">
                Screening score is below 70%. Review the issues below, then fix and re-scan.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => {
                    setShowIssues(true)
                    // Scroll to the ScreeningScoreCard
                    const el = document.querySelector('[data-testid="screening-score-card"]')
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    else window.scrollTo({ top: 200, behavior: 'smooth' })
                  }}
                  className="px-5 py-2.5 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View Issues
                </button>
                <button
                  onClick={handleScanAgain}
                  className="px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Scan Again
                </button>
                <Link
                  to={`/report-concern/${scanResult.scan_id}`}
                  className="px-5 py-2.5 bg-warning-600 text-white rounded-lg hover:bg-warning-700 transition-colors font-medium text-center"
                >
                  Report Concern
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={clearAll}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                Scan Another Product
              </button>
            </div>
          )}
        </div>
        </FadeContent>
      )}

      {/* Upload View */}
      {!scanResult && (
        <>
          {/* Re-scan context banner */}
          {previousScanScore != null && (
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 text-primary-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-primary-900">Re-scan product</p>
                  <p className="text-xs text-primary-700 mt-0.5">
                    Your previous scan scored {Math.round(previousScanScore)}%. Replace or retake images to improve the screening result.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Image Upload Slots */}
          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900 mb-1">Product Images</h2>
            <p className="text-sm text-neutral-600 mb-4">
              Upload the front and back of the product. Add a side view for more complete screening.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {IMAGE_SLOTS.map(slot => (
                <ImageSlot
                  key={slot.key}
                  slot={slot}
                  image={images[slot.key]}
                  onImageSelect={handleImageSelect}
                  onRemove={handleRemoveImage}
                  disabled={uploading}
                />
              ))}
            </div>
          </div>

          {/* Processing panel */}
          <ScanProcessingPanel
            imageLabels={imageLabels}
            active={uploading}
            error={!uploading && error ? error : null}
            onRetry={handleRetry}
          />

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button
              onClick={clearAll}
              disabled={uploading || imageCount === 0}
              className="px-6 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium disabled:opacity-50"
            >
              Clear All
            </button>
            <button
              onClick={analyzeProduct}
              disabled={uploading || !hasRequiredImages}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Analyzing {imageCount} image(s)...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span><span className="hidden sm:inline">Analyze Product </span><span className="sm:hidden">Analyze </span>{imageCount > 0 ? `(${imageCount} img${imageCount !== 1 ? 's' : ''})` : ''}</span>
                </>
              )}
            </button>
          </div>

          {/* Information Panel */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-900 mb-2">How multi-image scanning works</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Upload the <strong>front</strong> (brand/label) and <strong>back</strong> (manufacturer info) — both required</li>
              <li>• Optionally add a <strong>side</strong> view (MRP, batch, barcode)</li>
              <li>• OCR extracts text from each image independently</li>
              <li>• All text is combined — fields found on ANY side count</li>
              <li>• One final compliance score is generated from the combined data</li>
              <li>• A field found on the back counts even if missing from the front</li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
