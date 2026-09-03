import React from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Download, AlertTriangle, Tag } from 'lucide-react'
import ComplianceField from '../components/ComplianceField'
import { downloadScanReport } from '../lib/downloadReport'

export default function Result({ scanStore }) {
  const navigate = useNavigate()
  const lastScanId = sessionStorage.getItem('lastScanId')
  const scan = scanStore.getScan(lastScanId)

  // Fallback if no scan data found
  if (!scan) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-8 shadow-sm text-center">
          <h1 className="text-2xl font-semibold text-neutral-900">No Scan Results</h1>
          <p className="text-neutral-600 mt-2">No scan results found. Start by scanning a product.</p>
          <button
            onClick={() => navigate('/scan')}
            className="mt-4 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
          >
            Scan Product
          </button>
        </div>
      </div>
    )
  }

  // Handle new OCR data structure
  const ocrData = scan.ocrData
  const hasOcrData = ocrData && ocrData.lines
  const ocrLines = hasOcrData ? ocrData.lines : []
  const fullText = hasOcrData ? ocrData.text : ''

  // Legacy mock data support
  const fields = scan.fields || []
  const hasFields = fields.length > 0
  const overallStatus = scan.status

  const getOverallStatus = () => {
    if (hasFields) {
      const counts = fields.reduce((acc, field) => {
        acc[field.status] = (acc[field.status] || 0) + 1
        return acc
      }, {})
      if (counts.VIOLATION > 0) return { status: 'VIOLATION', color: 'danger', message: 'Multiple compliance issues detected' }
      if (counts.WARNING > 0) return { status: 'WARNING', color: 'warning', message: 'Some potential compliance issues found' }
      return { status: 'PASS', color: 'success', message: 'All requirements met' }
    }
    return { status: 'PENDING', color: 'primary', message: 'OCR extraction complete. Compliance analysis pending.' }
  }

  const overall = getOverallStatus()
  const score = hasFields ? Math.round(((fields.filter(f => f.status === 'PASS').length) / fields.length) * 100) : 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-neutral-200 p-4 sm:p-6 shadow-sm min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-neutral-900 break-words">Compliance Analysis Results</h1>
            <p className="text-neutral-600 mt-1">
              Product scanned on {new Date(scan.timestamp).toLocaleString('en-IN')}
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className={`compliance-badge compliance-badge-${overall.status.toLowerCase()} text-lg px-4 py-2`}>
              {overall.status}
            </div>
            <p className="text-sm text-neutral-600 mt-1">Compliance Score: {score}%</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {hasOcrData && !hasFields && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600">Text Regions Detected</p>
                <p className="text-xl font-semibold text-neutral-900">{ocrData.metadata?.line_count || ocrLines.length}</p>
              </div>
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600">Average Confidence</p>
                <p className="text-xl font-semibold text-success-700">
                  {((ocrData.metadata?.avg_confidence || 0) * 100).toFixed(1)}%
                </p>
              </div>
              <div className="w-10 h-10 bg-success-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600">Processing Time</p>
                <p className="text-xl font-semibold text-neutral-900">
                  {ocrData.metadata?.timing?.total_seconds?.toFixed(2) || '—'}s
                </p>
              </div>
              <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {hasFields && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600">Total Fields Checked</p>
                <p className="text-xl font-semibold text-neutral-900">{fields.length}</p>
              </div>
              <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600">Passed</p>
                <p className="text-xl font-semibold text-success-700">
                  {fields.filter(f => f.status === 'PASS').length}
                </p>
              </div>
              <div className="w-10 h-10 bg-success-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600">Issues Found</p>
                <p className="text-xl font-semibold text-warning-700">
                  {fields.filter(f => f.status === 'WARNING' || f.status === 'VIOLATION').length}
                </p>
              </div>
              <div className="w-10 h-10 bg-warning-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OCR Extracted Text (new flow) */}
      {hasOcrData && !hasFields && (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm min-w-0">
          <div className="px-6 py-4 border-b border-neutral-200">
            <h2 className="text-lg font-semibold text-neutral-900">Extracted Text</h2>
            <p className="text-sm text-neutral-600 mt-1">
              Raw text extracted from the product image via OCR
            </p>
          </div>
          <div className="p-4 sm:p-6 space-y-4 overflow-x-hidden">
            {fullText ? (
              <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-4">
                <p className="text-sm text-neutral-900 whitespace-pre-wrap break-words font-mono leading-relaxed">
                  {fullText}
                </p>
              </div>
            ) : (
              <div className="text-center py-8">
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
                        <span className="text-xs text-neutral-500">Confidence: {(line.confidence * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legacy Compliance Fields (mock data) */}
      {hasFields && (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm min-w-0">
          <div className="px-6 py-4 border-b border-neutral-200">
            <h2 className="text-lg font-semibold text-neutral-900">Field-by-Field Analysis</h2>
            <p className="text-sm text-neutral-600 mt-1">
              Detailed compliance evaluation for each extracted field
            </p>
          </div>
          <div className="p-4 sm:p-6 space-y-4 overflow-x-hidden">
            {fields.map((field, index) => (
              <ComplianceField key={index} {...field} />
            ))}
          </div>
        </div>
      )}

      {/* Overall Assessment */}
      <div className="bg-white rounded-lg border border-neutral-200 p-4 sm:p-6 shadow-sm min-w-0">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Overall Assessment</h2>
        <div className={`border rounded-lg p-4 ${
          overall.status === 'PASS' ? 'bg-success-50 border-success-200' :
          overall.status === 'WARNING' ? 'bg-warning-50 border-warning-200' :
          overall.status === 'VIOLATION' ? 'bg-danger-50 border-danger-200' :
          'bg-primary-50 border-primary-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-neutral-900">Status: {overall.status}</h3>
            {hasFields && <span className="text-sm text-neutral-600">LegalMetrology Rule v1.2</span>}
          </div>
          <p className="text-neutral-700">{overall.message}</p>
          {hasFields && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-neutral-600 mb-1">
                <span>Compliance Score</span>
                <span>{score}%</span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div className="bg-primary-600 h-2 rounded-full" style={{ width: `${score}%` }}></div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-end gap-3">
        <button
          onClick={() => navigate('/')}
          className="px-6 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium"
        >
          Back to Dashboard
        </button>
        <button
          onClick={() => navigate(`/report/${scan.id}`)}
          className="px-6 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium"
        >
          View Detailed Report
        </button>
        <button
          onClick={() => downloadScanReport({ id: scan.id, productName: scan.fields?.manufacturer_name?.value || scan.fields?.product_name?.value || 'Product', screeningScore: score, overallStatus: overall.status, ruleResults: [], extractedFields: Object.fromEntries((scan.fields || []).map(f => [f.label, f])), rawOcr: scan.ocrData ? { raw_text: scan.ocrData.text } : null, limitations: [], createdAt: scan.timestamp })}
          className="px-6 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium flex items-center justify-center gap-2"
        >
          <Download className="h-4 w-4" />
          Download Report
        </button>
        {score >= 70 ? (
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
