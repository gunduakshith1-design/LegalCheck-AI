import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import ScreeningScoreCard from '../components/ScreeningScoreCard'
import { useAuth } from '../contexts/AuthContext'
import { fetchUserScans, dbRowToScan } from '../lib/scanService'
import { downloadScanReport } from '../lib/downloadReport'
import AnimatedListItem from '../components/AnimatedListItem'

const STATUS_BADGE = {
  NO_ISSUES_DETECTED: 'compliance-badge-pass',
  POTENTIAL_NON_COMPLIANCE: 'compliance-badge-violation',
  REVIEW_REQUIRED: 'compliance-badge-warning',
  INSUFFICIENT_EVIDENCE: 'compliance-badge-warning',
}

const STATUS_SHORT = {
  NO_ISSUES_DETECTED: 'PASS',
  POTENTIAL_NON_COMPLIANCE: 'ISSUES',
  REVIEW_REQUIRED: 'REVIEW',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT',
}

export default function History() {
  const { user } = useAuth()
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    fetchUserScans(user.id).then(({ data }) => {
      setScans(data.map(dbRowToScan))
      setLoading(false)
    })
  }, [user?.id])

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-900">Scan History</h1>
        <p className="text-neutral-600 mt-1">Complete record of all product compliance scans</p>
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 shadow-sm">
        {loading ? (
          <div className="px-6 py-12 text-center">
            <p className="text-neutral-400 text-sm">Loading scan history…</p>
          </div>
        ) : scans.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="w-16 h-16 bg-neutral-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-neutral-500 font-medium">No scans yet</p>
            <p className="text-neutral-400 text-sm mt-1">Start by scanning a product.</p>
            <Link
              to="/scan"
              className="mt-4 inline-block px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
            >
              Scan Product
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-neutral-200">
            {scans.map((scan, idx) => (
              <AnimatedListItem key={scan.id} index={idx} className="px-6 py-4 hover:bg-neutral-50 transition-colors">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-neutral-900 truncate">{scan.productName}</h3>
                    <p className="text-xs sm:text-sm text-neutral-500 mt-1">
                      Scanned: {new Date(scan.createdAt).toLocaleString('en-IN')}
                    </p>
                    {scan.ruleSetVersion && (
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Screened using Rule Set {scan.ruleSetVersion}
                      </p>
                    )}
                    <div className="flex items-center gap-2 sm:gap-3 mt-2 sm:mt-0 sm:hidden">
                      <ScreeningScoreCard scoreData={scan.screeningScore ? {
                        screening_score: scan.screeningScore,
                        threshold_status: scan.screeningScore >= 70 ? 'MET' : 'BELOW_THRESHOLD',
                      } : null} compact ruleSetVersion={scan.ruleSetVersion} />
                      <div className={`compliance-badge ${STATUS_BADGE[scan.overallStatus] || 'compliance-badge-warning'}`}>
                        {STATUS_SHORT[scan.overallStatus] || scan.overallStatus}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                    <div className="hidden sm:flex items-center gap-3 sm:gap-4">
                      <ScreeningScoreCard scoreData={scan.screeningScore ? {
                        screening_score: scan.screeningScore,
                        threshold_status: scan.screeningScore >= 70 ? 'MET' : 'BELOW_THRESHOLD',
                      } : null} compact ruleSetVersion={scan.ruleSetVersion} />
                      <div className={`compliance-badge ${STATUS_BADGE[scan.overallStatus] || 'compliance-badge-warning'}`}>
                        {STATUS_SHORT[scan.overallStatus] || scan.overallStatus}
                      </div>
                    </div>
                    <Link
                      to={`/report/${scan.id}`}
                      className="text-primary-600 hover:text-primary-700 text-sm font-medium whitespace-nowrap"
                    >
                      View
                    </Link>
                    {scan.screeningScore != null && scan.screeningScore < 70 && (
                      <Link
                        to={`/report-concern/${scan.id}`}
                        className="text-warning-600 hover:text-warning-700 text-sm font-medium whitespace-nowrap hidden sm:inline-flex"
                      >
                        Report
                      </Link>
                    )}
                    <button
                      onClick={() => downloadScanReport(scan)}
                      className="text-neutral-400 hover:text-primary-600 p-1 rounded-lg hover:bg-neutral-100"
                      title="Download Report"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </AnimatedListItem>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
