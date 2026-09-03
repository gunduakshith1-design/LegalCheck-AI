import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Loader2, Download, AlertTriangle, Tag } from 'lucide-react'
import ScreeningScoreCard from '../components/ScreeningScoreCard'
import { fetchScanById, dbRowToScan } from '../lib/scanService'
import { downloadScanReport } from '../lib/downloadReport'

export default function Report() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [scan, setScan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setNotFound(false)

    fetchScanById(id).then(({ data, error }) => {
      if (data) {
        setScan(dbRowToScan(data))
      } else {
        setNotFound(true)
      }
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    )
  }

  if (notFound || !scan) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-8 shadow-sm text-center">
          <h1 className="text-2xl font-semibold text-neutral-900">Report Not Found</h1>
          <p className="text-neutral-600 mt-2">The requested report could not be found.</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // Reconstruct screening_score object for the score card
  const screeningScoreData = scan.screeningScore !== null && scan.screeningScore !== undefined
    ? {
        screening_score: scan.screeningScore,
        threshold: 70,
        threshold_status: scan.screeningScore >= 70 ? 'MET' : 'BELOW_THRESHOLD',
        applicable_rules: scan.ruleResults?.length || 0,
        detected_rules: scan.ruleResults?.filter((r) => r.status === 'DETECTED').length || 0,
        uncertain_rules: scan.ruleResults?.filter((r) => r.status === 'UNCERTAIN').length || 0,
        not_detected_rules: scan.ruleResults?.filter((r) => r.status === 'NOT_DETECTED').length || 0,
        not_applicable_rules: scan.ruleResults?.filter((r) => r.status === 'NOT_APPLICABLE').length || 0,
      }
    : null

  // Map DB row to the format the existing Report UI expects
  const ocrData = scan.rawOcr ? {
    lines: scan.rawOcr.text_regions || [],
    text: scan.rawOcr.raw_text || '',
    metadata: {
      backend: scan.rawOcr.engine,
      line_count: scan.rawOcr.line_count,
      avg_confidence: scan.rawOcr.average_confidence,
    },
  } : null

  const hasOcrData = ocrData && ocrData.lines
  const ocrLines = hasOcrData ? ocrData.lines : []
  const fullText = hasOcrData ? ocrData.text : ''
  const ruleResults = scan.ruleResults || []
  const hasRuleResults = ruleResults.length > 0
  const imageUrl = scan.imagePath
  const productName = scan.productName

  const RULE_STATUS_COLORS = {
    DETECTED: 'text-success-700 bg-success-50',
    NOT_DETECTED: 'text-danger-700 bg-danger-50',
    UNCERTAIN: 'text-warning-700 bg-warning-50',
    NOT_APPLICABLE: 'text-neutral-500 bg-neutral-50',
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-900">Detailed Compliance Report</h1>
        <p className="text-neutral-600 mt-1">
          Generated on {new Date(scan.createdAt).toLocaleString('en-IN')}
        </p>
      </div>

      {/* Screening Score */}
      <ScreeningScoreCard scoreData={screeningScoreData} />

      {/* Product Image */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Product Image</h2>
        <div className="aspect-video bg-neutral-50 rounded-lg border border-neutral-200 overflow-hidden">
          {imageUrl ? (
            <img src={imageUrl} alt={productName} className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 bg-neutral-200 rounded-lg mx-auto mb-4 flex items-center justify-center">
                  <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.293-1.293a1 1 0 011.414 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-neutral-500 text-sm">Product image not available</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* OCR Extracted Text */}
      {hasOcrData && (
        <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Extracted Text (OCR)</h2>
          {fullText ? (
            <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-4 mb-4">
              <p className="text-sm text-neutral-900 whitespace-pre-wrap break-words font-mono leading-relaxed">
                {fullText}
              </p>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-warning-700 font-medium">No readable text was detected</p>
              <p className="text-neutral-500 text-sm mt-1">Try a clearer image with visible text on the packaging.</p>
            </div>
          )}
          {ocrLines.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-neutral-700 mb-3">Text Regions ({ocrLines.length})</h3>
              <div className="space-y-2">
                {ocrLines.map((line, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                    <span className="text-xs text-neutral-400 font-mono mt-0.5 flex-shrink-0 w-6 text-right">{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-neutral-900 break-words">{line.text}</p>
                      <div className="flex gap-4 mt-1">
                        <span className="text-xs text-neutral-500">Confidence: {(line.confidence * 100).toFixed(1)}%</span>
                        {line.bbox && (
                          <span className="text-xs text-neutral-400">bbox available</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rule Results */}
      {hasRuleResults && (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm">
          <div className="px-6 py-4 border-b border-neutral-200">
            <h2 className="text-lg font-semibold text-neutral-900">Compliance Screening Results</h2>
            <p className="text-sm text-neutral-600 mt-1">
              Each rule checks for the presence of a specific declaration on the package label.
            </p>
          </div>
          <div className="divide-y divide-neutral-200">
            {ruleResults.map((rule) => (
              <div key={rule.rule_id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-neutral-500">{rule.rule_id}</span>
                      <span className="font-medium text-neutral-900">
                        {rule.field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-600 mb-2">{rule.explanation}</p>
                    {rule.observed_value && rule.observed_value !== 'None' && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-neutral-500">Detected value:</span>
                        <span className="font-mono text-neutral-900 bg-neutral-50 px-2 py-0.5 rounded">
                          {rule.observed_value}
                        </span>
                        <span className="text-neutral-400">
                          (confidence: {(rule.confidence * 100).toFixed(0)}%)
                        </span>
                      </div>
                    )}
                    <div className="mt-2 text-xs text-neutral-500">
                      <span className="font-medium">Source:</span> {rule.source_document} — {rule.rule_reference}
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ${RULE_STATUS_COLORS[rule.status] || ''}`}>
                    {rule.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evidence Section */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Evidence & References</h2>
        <div className="space-y-4">
          {hasOcrData && (
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
              <h3 className="font-medium text-neutral-900 mb-2">OCR Details</h3>
              <div className="text-sm text-neutral-600 space-y-1">
                <p>Backend: {ocrData.metadata?.backend || 'N/A'}</p>
                <p>Text regions: {ocrData.metadata?.line_count || ocrLines.length}</p>
                <p>Average confidence: {((ocrData.metadata?.avg_confidence || 0) * 100).toFixed(1)}%</p>
              </div>
            </div>
          )}
          <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
            <h3 className="font-medium text-neutral-900 mb-2">Extraction Method</h3>
            <p className="text-sm text-neutral-600">
              {hasOcrData ? `Real OCR (${scan.ocrEngine || 'RapidOCR'})` : 'No OCR data available'}
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Scanned: {new Date(scan.createdAt).toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons — Score-based */}
      <div className="flex flex-col sm:flex-row justify-end gap-3">
        <button
          onClick={() => navigate('/history')}
          className="px-6 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium"
        >
          Back to History
        </button>
        <button
          onClick={() => downloadScanReport(scan)}
          className="px-6 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium flex items-center justify-center gap-2"
        >
          <Download className="h-4 w-4" />
          Download Report
        </button>
        {scan.screeningScore != null && scan.screeningScore >= 70 ? (
          <Link
            to="/sell"
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <Tag className="h-4 w-4" />
            Sell / Add to Store
          </Link>
        ) : (
          <Link
            to={`/report-concern/${scan.id}`}
            className="px-6 py-2 bg-warning-600 text-white rounded-lg hover:bg-warning-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <AlertTriangle className="h-4 w-4" />
            Report Concern
          </Link>
        )}
      </div>
    </div>
  )
}
