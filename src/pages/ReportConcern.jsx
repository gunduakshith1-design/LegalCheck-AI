import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Loader2, AlertTriangle, ExternalLink, Mail, Copy, CheckCircle,
  Download, FileText, ArrowLeft, Shield,
} from 'lucide-react'
import ScreeningScoreCard from '../components/ScreeningScoreCard'
import { fetchScanById, dbRowToScan } from '../lib/scanService'
import { useAuth } from '../contexts/AuthContext'
import {
  createComplianceReport,
  dbRowToReport,
  computeProductFingerprint,
  fetchReportsByFingerprint,
  checkExistingUserReport,
} from '../lib/reportService'
import {
  downloadScanReport,
  generateComplaintText,
  generateComplaintSubject,
} from '../lib/downloadReport'

const FSSAI_PORTAL_URL = 'https://foscos.fssai.gov.in/consumergrievance/'
const FSSAI_EMAIL = 'helpdesk-foscos@fssai.gov.in'

export default function ReportConcern() {
  const { scanId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [scan, setScan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [step, setStep] = useState('review') // review | prepare | submitted
  const [userDescription, setUserDescription] = useState('')
  const [report, setReport] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)

  // Existing reports state
  const [existingReports, setExistingReports] = useState([])
  const [existingUserReport, setExistingUserReport] = useState(null)
  const [checkingExisting, setCheckingExisting] = useState(false)
  const [fingerprintConfidence, setFingerprintConfidence] = useState(null)

  useEffect(() => {
    if (!scanId) return
    setLoading(true)
    setNotFound(false)

    fetchScanById(scanId).then(({ data, error: fetchErr }) => {
      if (data) {
        const s = dbRowToScan(data)
        // Only allow concern reports for score < 70
        if (s.screeningScore != null && s.screeningScore >= 70) {
          setNotFound(true)
        } else {
          setScan(s)

          // Check for existing reports on this product
          if (user?.id) {
            setCheckingExisting(true)
            const { fingerprint, confidence } = computeProductFingerprint(s.extractedFields)
            if (fingerprint) {
              Promise.all([
                fetchReportsByFingerprint(fingerprint, s.extractedFields),
                checkExistingUserReport(user.id, fingerprint),
              ]).then(([allReports, userReport]) => {
                setExistingReports(allReports.data || [])
                setFingerprintConfidence(confidence)
                if (userReport.exists) {
                  setExistingUserReport(userReport.report)
                }
                setCheckingExisting(false)
              }).catch(() => setCheckingExisting(false))
            }
          }
        }
      } else {
        setNotFound(true)
      }
      setLoading(false)
    })
  }, [scanId, user?.id])

  // Generate concern summary from rule results
  const getConcernSummary = useCallback(() => {
    if (!scan) return ''
    const ruleResults = scan.ruleResults || []
    const concerns = ruleResults
      .filter(r => r.status === 'NOT_DETECTED' || r.status === 'UNCERTAIN')
      .map(r => `${r.field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: ${r.explanation || 'Missing from label'}`)
    return concerns.length > 0
      ? `Potential compliance concerns detected: ${concerns.join('; ')}`
      : 'Screening score below marketplace threshold'
  }, [scan])

  // Step 1: Review — user reviews scan data before preparing report
  const handlePrepareReport = () => {
    setStep('prepare')
  }

  // Step 2: Prepare — user adds description and creates draft
  const handleSubmitDraft = async () => {
    if (!user?.id || !scan) return
    setSubmitting(true)
    setError(null)

    try {
      const { data, error: createErr } = await createComplianceReport(
        user.id,
        scan.id,
        {
          productName: scan.productName,
          screeningScore: scan.screeningScore,
          overallStatus: scan.overallStatus,
          extractedFields: scan.extractedFields,
        },
        getConcernSummary(),
        userDescription,
        'FSSAI Food Safety Connect',
        'official_portal'
      )

      if (createErr) throw new Error(createErr)
      setReport(dbRowToReport(data))
      setStep('submitted')
    } catch (err) {
      console.error('[ReportConcern] Failed to create report:', err)
      setError(err.message || 'Failed to create report.')
    } finally {
      setSubmitting(false)
    }
  }

  // Copy complaint text to clipboard
  const handleCopyDetails = async () => {
    if (!scan) return
    const text = generateComplaintText(scan, userDescription)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
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

  // Download complaint report
  const handleDownload = () => {
    if (scan) downloadScanReport(scan, `legalcheck-complaint-${scan.id || 'report'}.html`)
  }

  // Open FSSAI portal
  const handleOpenPortal = () => {
    window.open(FSSAI_PORTAL_URL, '_blank', 'noopener,noreferrer')
    // Update status if report exists
    if (report?.id && user?.id) {
      import('../lib/reportService').then(({ updateReportStatus }) => {
        updateReportStatus(user.id, report.id, 'OPENED_OFFICIAL_PORTAL')
      })
    }
  }

  // Email draft
  const handleEmailReport = () => {
    if (!scan) return
    const subject = encodeURIComponent(generateComplaintSubject(scan))
    const body = encodeURIComponent(generateComplaintText(scan, userDescription))
    window.open(`mailto:${FSSAI_EMAIL}?subject=${subject}&body=${body}`, '_self')
    // Update status if report exists
    if (report?.id && user?.id) {
      import('../lib/reportService').then(({ updateReportStatus }) => {
        updateReportStatus(user.id, report.id, 'EMAILED')
      })
    }
  }

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
          <p className="text-neutral-600 mt-2">The requested scan could not be found or does not qualify for a concern report.</p>
          <button
            onClick={() => navigate('/history')}
            className="mt-4 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
          >
            Back to History
          </button>
        </div>
      </div>
    )
  }

  const screeningScoreData = scan.screeningScore != null ? {
    screening_score: scan.screeningScore,
    threshold: 70,
    threshold_status: scan.screeningScore >= 70 ? 'MET' : 'BELOW_THRESHOLD',
    applicable_rules: scan.ruleResults?.length || 0,
    detected_rules: scan.ruleResults?.filter(r => r.status === 'DETECTED').length || 0,
    uncertain_rules: scan.ruleResults?.filter(r => r.status === 'UNCERTAIN').length || 0,
    not_detected_rules: scan.ruleResults?.filter(r => r.status === 'NOT_DETECTED').length || 0,
    not_applicable_rules: scan.ruleResults?.filter(r => r.status === 'NOT_APPLICABLE').length || 0,
  } : null

  const ruleResults = scan.ruleResults || []
  const concerns = ruleResults.filter(r => r.status === 'NOT_DETECTED' || r.status === 'UNCERTAIN')

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Header */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-warning-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-warning-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              Report a Potential Compliance Concern
            </h1>
            <p className="text-neutral-600 mt-1">
              Review the screening evidence and prepare a complaint report
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">
          {error}
        </div>
      )}

      {/* Existing User Report Warning */}
      {existingUserReport && (
        <div className="bg-warning-50 border border-warning-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-warning-900">
                You have already reported this product
              </h3>
              <p className="text-sm text-warning-700 mt-1">
                Your previous report from {new Date(existingUserReport.createdAt).toLocaleDateString('en-IN')} is currently:{' '}
                <span className="font-medium">{existingUserReport.status}</span>.
              </p>
              <div className="mt-2 flex gap-3">
                <Link
                  to="/reports"
                  className="text-xs font-medium text-warning-800 hover:text-warning-900 underline"
                >
                  View your reports →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Other Users' Reports */}
      {existingReports.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-blue-900">
                Other users have reported this product
              </h3>
              <p className="text-sm text-blue-700 mt-1">
                {existingReports.length} other compliance report{existingReports.length !== 1 ? 's' : ''} exist for this product.
              </p>
              <div className="mt-2 space-y-1">
                {existingReports.slice(0, 5).map((r, idx) => (
                  <div key={idx} className="text-xs text-blue-600 flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate max-w-xs">
                      {r.concern_summary?.slice(0, 100) || 'Report filed'}
                    </span>
                    <span className="text-blue-400 flex-shrink-0">
                      ({new Date(r.created_at).toLocaleDateString('en-IN')})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Screening Score */}
      <ScreeningScoreCard scoreData={screeningScoreData} ruleSetVersion={scan.ruleSetVersion} />

      {/* Product Summary */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Product Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-neutral-500">Product Name</span>
            <p className="font-medium text-neutral-900">{scan.productName}</p>
          </div>
          <div>
            <span className="text-neutral-500">Scan Date</span>
            <p className="font-medium text-neutral-900">
              {new Date(scan.createdAt).toLocaleString('en-IN')}
            </p>
          </div>
          <div>
            <span className="text-neutral-500">Overall Status</span>
            <p className="font-medium text-neutral-900">{scan.overallStatus || 'Unknown'}</p>
          </div>
          <div>
            <span className="text-neutral-500">Scan ID</span>
            <p className="font-mono text-xs text-neutral-500 break-all">{scan.id}</p>
          </div>
        </div>
      </div>

      {/* Detected Concerns */}
      {concerns.length > 0 && (
        <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">
            Detected Concerns ({concerns.length})
          </h2>
          <div className="space-y-3">
            {concerns.map((rule, idx) => (
              <div key={idx} className="p-4 bg-warning-50 rounded-lg border border-warning-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-neutral-900">
                      {rule.field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </p>
                    <p className="text-sm text-neutral-600 mt-1">{rule.explanation}</p>
                    {rule.observed_value && rule.observed_value !== 'None' && (
                      <p className="text-sm text-neutral-500 mt-1">
                        Observed: <span className="font-mono">{rule.observed_value}</span>
                      </p>
                    )}
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                    rule.status === 'NOT_DETECTED'
                      ? 'bg-danger-100 text-danger-700'
                      : 'bg-warning-100 text-warning-700'
                  }`}>
                    {rule.status === 'NOT_DETECTED' ? 'NOT DETECTED' : 'UNCERTAIN'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step: Review */}
      {step === 'review' && (
        <>
          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900 mb-2">Before You Report</h2>
            <div className="space-y-3 text-sm text-neutral-600">
              <p>
                This screening report is generated by an automated AI system. It identifies
                <strong> potential</strong> compliance concerns based on label text analysis.
              </p>
              <p>
                A screening score below 70% does <strong>not</strong> mean the product is unsafe,
                illegal, or in violation. It means the automated system detected fewer expected
                label declarations than the threshold requires.
              </p>
              <p>
                Please review the evidence above carefully before submitting a concern through
                official channels.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <Link
              to={`/report/${scan.id}`}
              className="px-6 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium text-center"
            >
              View Original Scan & Evidence
            </Link>
            <button
              onClick={handlePrepareReport}
              className="px-6 py-2 bg-warning-600 text-white rounded-lg hover:bg-warning-700 transition-colors font-medium"
            >
              Prepare Concern Report
            </button>
          </div>
        </>
      )}

      {/* Step: Prepare */}
      {step === 'prepare' && (
        <>
          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">
              Why are you reporting this product?
            </h2>
            <div className="space-y-4">
              {/* AI-detected concern summary */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Detected Concern Summary
                </label>
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-sm text-neutral-700">
                  {getConcernSummary()}
                </div>
              </div>

              {/* User description */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Additional Details (optional)
                </label>
                <textarea
                  value={userDescription}
                  onChange={(e) => setUserDescription(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Describe any additional concerns or observations..."
                />
                <p className="text-xs text-neutral-400 mt-1">
                  This information will be included in the complaint report.
                </p>
              </div>

              {/* Disclaimer */}
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-xs text-blue-700">
                  <Shield className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />
                  This report will be prepared as a draft. You will review it before any action is taken.
                  LegalCheck AI does not automatically submit complaints to any government authority.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button
              onClick={() => setStep('review')}
              className="px-6 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium"
            >
              Back
            </button>
            <button
              onClick={handleSubmitDraft}
              disabled={submitting}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Prepare Report
            </button>
          </div>
        </>
      )}

      {/* Step: Submitted / Actions */}
      {step === 'submitted' && (
        <>
          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <div className="flex items-start gap-3 mb-4">
              <CheckCircle className="h-6 w-6 text-success-600 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">Report Prepared</h2>
                <p className="text-sm text-neutral-600 mt-1">
                  Your compliance concern report has been saved as a draft.
                  Review the options below to take further action.
                </p>
              </div>
            </div>

            {/* Complaint preview */}
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 mb-4">
              <p className="text-xs text-neutral-500 font-medium mb-2">COMPLAINT PREVIEW</p>
              <pre className="text-xs text-neutral-700 whitespace-pre-wrap font-mono leading-relaxed">
                {generateComplaintText(scan, userDescription)}
              </pre>
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-neutral-700">Take Action</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Download */}
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-3 p-4 border border-neutral-200 rounded-lg hover:bg-neutral-50 text-left"
                >
                  <Download className="h-5 w-5 text-primary-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-neutral-900">Download Report</p>
                    <p className="text-xs text-neutral-500">Save as printable HTML file</p>
                  </div>
                </button>

                {/* Copy Details */}
                <button
                  onClick={handleCopyDetails}
                  className="flex items-center gap-3 p-4 border border-neutral-200 rounded-lg hover:bg-neutral-50 text-left"
                >
                  {copied ? (
                    <CheckCircle className="h-5 w-5 text-success-600 flex-shrink-0" />
                  ) : (
                    <Copy className="h-5 w-5 text-primary-600 flex-shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-neutral-900">
                      {copied ? 'Copied!' : 'Copy Details'}
                    </p>
                    <p className="text-xs text-neutral-500">Copy complaint text to clipboard</p>
                  </div>
                </button>

                {/* Open Official Portal */}
                <button
                  onClick={handleOpenPortal}
                  className="flex items-center gap-3 p-4 border border-primary-200 bg-primary-50 rounded-lg hover:bg-primary-100 text-left"
                >
                  <ExternalLink className="h-5 w-5 text-primary-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-primary-900">Open FSSAI Complaint Portal</p>
                    <p className="text-xs text-primary-600">Submit via official FSSAI channel</p>
                  </div>
                </button>

                {/* Email */}
                <button
                  onClick={handleEmailReport}
                  className="flex items-center gap-3 p-4 border border-neutral-200 rounded-lg hover:bg-neutral-50 text-left"
                >
                  <Mail className="h-5 w-5 text-primary-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-neutral-900">Email Report</p>
                    <p className="text-xs text-neutral-500">Draft email to FSSAI helpdesk</p>
                  </div>
                </button>
              </div>

              {/* FSSAI Info */}
              <div className="mt-4 p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                <p className="text-xs text-neutral-600">
                  <FileText className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />
                  <strong>Official Destination:</strong> FSSAI Food Safety Connect Consumer Grievance Platform
                  <br />
                  <a
                    href={FSSAI_PORTAL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:underline"
                  >
                    {FSSAI_PORTAL_URL}
                  </a>
                  <br />
                  <span className="text-neutral-500">
                    Email: {FSSAI_EMAIL}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <Link
              to={`/report/${scan.id}`}
              className="px-6 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium text-center"
            >
              View Original Scan & Evidence
            </Link>
            <Link
              to="/reports"
              className="px-6 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium text-center"
            >
              View All Reports
            </Link>
            <Link
              to="/history"
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium text-center"
            >
              Back to History
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
