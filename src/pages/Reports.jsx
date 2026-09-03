import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, FileText, ExternalLink, Download, Copy, CheckCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { fetchUserReports, dbRowToReport, updateReportStatus } from '../lib/reportService'
import { downloadScanReport, generateComplaintText } from '../lib/downloadReport'
import { fetchScanById, dbRowToScan } from '../lib/scanService'
import AnimatedListItem from '../components/AnimatedListItem'

const STATUS_LABELS = {
  DRAFT: { label: 'Draft', color: 'bg-neutral-100 text-neutral-700' },
  PREPARED: { label: 'Prepared', color: 'bg-primary-100 text-primary-700' },
  OPENED_OFFICIAL_PORTAL: { label: 'Portal Opened', color: 'bg-warning-100 text-warning-700' },
  EMAILED: { label: 'Emailed', color: 'bg-blue-100 text-blue-700' },
  CLOSED: { label: 'Closed', color: 'bg-success-100 text-success-700' },
}

const FSSAI_PORTAL_URL = 'https://foscos.fssai.gov.in/consumergrievance/'

function ReportRow({ report, onStatusUpdate }) {
  const [scan, setScan] = useState(null)
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Load the original scan for download/copy
  useEffect(() => {
    if (report.scanId) {
      fetchScanById(report.scanId).then(({ data }) => {
        if (data) setScan(dbRowToScan(data))
      })
    }
  }, [report.scanId])

  const handleDownload = () => {
    if (scan) downloadScanReport(scan, `legalcheck-complaint-${report.scanId || report.id}.html`)
  }

  const handleCopy = async () => {
    const text = generateComplaintText(
      {
        productName: report.productNameSnapshot,
        screeningScore: report.screeningScoreSnapshot,
        overallStatus: report.overallStatusSnapshot,
        extractedFields: {},
        ruleResults: [],
        limitations: [],
      },
      report.userDescription || ''
    )
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleOpenPortal = () => {
    window.open(FSSAI_PORTAL_URL, '_blank', 'noopener,noreferrer')
    onStatusUpdate(report.id, 'OPENED_OFFICIAL_PORTAL')
  }

  const statusInfo = STATUS_LABELS[report.status] || STATUS_LABELS.DRAFT

  return (
    <div className="px-6 py-4 hover:bg-neutral-50 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-neutral-400 flex-shrink-0" />
            <h3 className="text-sm font-medium text-neutral-900 truncate">
              {report.productNameSnapshot}
            </h3>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500">
            {report.screeningScoreSnapshot != null && (
              <span>Score: {Math.round(report.screeningScoreSnapshot)}%</span>
            )}
            <span>Created: {new Date(report.createdAt).toLocaleDateString('en-IN')}</span>
            {report.overallStatusSnapshot && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                report.overallStatusSnapshot === 'POTENTIAL_NON_COMPLIANCE'
                  ? 'bg-danger-50 text-danger-700'
                  : 'bg-warning-50 text-warning-700'
              }`}>
                {report.overallStatusSnapshot === 'POTENTIAL_NON_COMPLIANCE' ? 'Issues' : 'Review'}
              </span>
            )}
          </div>
          {report.concernSummary && (
            <p className="text-xs text-neutral-400 mt-1 line-clamp-1">
              {report.concernSummary}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>

          {/* Expand/collapse toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-neutral-400 hover:text-primary-600 rounded-lg hover:bg-neutral-100"
            title={expanded ? 'Collapse' : 'Expand details'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {/* Actions */}
          <button
            onClick={handleDownload}
            className="p-1.5 text-neutral-400 hover:text-primary-600 rounded-lg hover:bg-neutral-100"
            title="Download Report"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={handleCopy}
            className="p-1.5 text-neutral-400 hover:text-primary-600 rounded-lg hover:bg-neutral-100"
            title="Copy Details"
          >
            {copied ? <CheckCircle className="h-4 w-4 text-success-600" /> : <Copy className="h-4 w-4" />}
          </button>
          <button
            onClick={handleOpenPortal}
            className="p-1.5 text-neutral-400 hover:text-primary-600 rounded-lg hover:bg-neutral-100"
            title="Open FSSAI Portal"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 p-4 bg-neutral-50 rounded-lg border border-neutral-200 text-sm space-y-3">
          {/* Concern Summary */}
          {report.concernSummary && (
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Detected Concerns</p>
              <p className="text-neutral-700">{report.concernSummary}</p>
            </div>
          )}

          {/* User Description */}
          {report.userDescription && (
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Your Description</p>
              <p className="text-neutral-700">{report.userDescription}</p>
            </div>
          )}

          {/* Scan Rule Results — what the evidence found */}
          {scan && scan.ruleResults && scan.ruleResults.length > 0 && (
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Screening Evidence</p>
              <div className="space-y-1">
                {scan.ruleResults.map((rule, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      rule.status === 'DETECTED' ? 'bg-success-500' :
                      rule.status === 'UNCERTAIN' ? 'bg-warning-500' :
                      rule.status === 'NOT_DETECTED' ? 'bg-neutral-400' : 'bg-neutral-300'
                    }`} />
                    <span className="text-neutral-700 font-medium">
                      {(rule.field || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                    <span className="text-neutral-400">—</span>
                    <span className={`${
                      rule.status === 'DETECTED' ? 'text-success-700' :
                      rule.status === 'UNCERTAIN' ? 'text-warning-700' :
                      rule.status === 'NOT_DETECTED' ? 'text-neutral-500' : 'text-neutral-400'
                    }`}>{
                      rule.status === 'DETECTED' ? 'Pass' :
                      rule.status === 'UNCERTAIN' ? 'Needs Review' :
                      rule.status === 'NOT_DETECTED' ? 'Not Detected' : 'N/A'
                    }</span>
                    {rule.observed_value && rule.observed_value !== 'None' && rule.status !== 'NOT_DETECTED' && (
                      <span className="font-mono text-neutral-500 truncate max-w-[200px]">{rule.observed_value}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Report Metadata */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-neutral-500">Created:</span>
              <span className="ml-1 text-neutral-600">
                {new Date(report.createdAt).toLocaleString('en-IN')}
              </span>
            </div>
            <div>
              <span className="text-neutral-500">Destination:</span>
              <span className="ml-1 text-neutral-600">{report.reportDestination || 'N/A'}</span>
            </div>
          </div>

          {/* Evidence traceability — link to the scan that generated this report */}
          <div className="pt-2 border-t border-neutral-200 space-y-2">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Evidence Trail</p>
            <p className="text-xs text-neutral-600">
              This report was prepared from the screening evidence of a product scan.
              The scan identified the concerns listed above based on OCR analysis of package images.
            </p>
            <div className="flex flex-wrap gap-3">
              {scan && (
                <Link
                  to={`/report/${report.scanId}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  View Original Scan & Evidence →
                </Link>
              )}
              <Link
                to={`/report-concern/${report.scanId}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-700"
              >
                View Report Details →
              </Link>
            </div>
            {scan && (
              <div className="flex flex-wrap gap-4 text-xs text-neutral-400">
                {scan.ruleResults && scan.ruleResults.length > 0 && (
                  <span>{scan.ruleResults.length} rule checks evaluated</span>
                )}
                {scan.rawOcr?.text_regions && (
                  <span>{scan.rawOcr.text_regions.length} OCR text regions</span>
                )}
                {scan.imagePath && (
                  <span>Scanned image available</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Reports() {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  const loadReports = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    const { data } = await fetchUserReports(user.id)
    setReports(data.map(dbRowToReport))
    setLoading(false)
  }, [user?.id])

  useEffect(() => { loadReports() }, [loadReports])

  const handleStatusUpdate = async (reportId, status) => {
    if (!user?.id) return
    await updateReportStatus(user.id, reportId, status)
    await loadReports()
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-900">Compliance Reports</h1>
        <p className="text-neutral-600 mt-1">
          Track and manage your compliance concern reports
        </p>
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 shadow-sm">
        {loading ? (
          <div className="px-6 py-12 text-center">
            <Loader2 className="h-6 w-6 text-primary-600 animate-spin mx-auto" />
            <p className="text-neutral-400 text-sm mt-2">Loading reports…</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="w-16 h-16 bg-neutral-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <FileText className="w-8 h-8 text-neutral-400" />
            </div>
            <p className="text-neutral-500 font-medium">No reports yet</p>
            <p className="text-neutral-400 text-sm mt-1">
              When you report a compliance concern, it will appear here.
            </p>
            <Link
              to="/history"
              className="mt-4 inline-block px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm"
            >
              View Scan History
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-neutral-200">
            {reports.map((report, idx) => (
              <AnimatedListItem key={report.id} index={idx}>
                <ReportRow
                  report={report}
                  onStatusUpdate={handleStatusUpdate}
                />
              </AnimatedListItem>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
