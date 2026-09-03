import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import StatCard from '../components/StatCard'
import ScreeningScoreCard from '../components/ScreeningScoreCard'
import AnimatedListItem from '../components/AnimatedListItem'
import { useAuth } from '../contexts/AuthContext'
import { fetchScanStats, fetchUserScans, dbRowToScan } from '../lib/scanService'
import { fetchListingStats } from '../lib/listingService'
import { fetchStoreStats, fetchPublicStores, dbRowToPublicStore } from '../lib/storeService'
import { CheckCircle } from 'lucide-react'

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

export default function Dashboard() {
  const { user, profile, sellerProfile } = useAuth()
  const role = profile?.role || 'buyer'
  const isSeller = role === 'seller'

  // Seller state
  const [stats, setStats] = useState({ total: 0, noIssues: 0, potentialIssues: 0, reviewRequired: 0 })
  const [scoreStats, setScoreStats] = useState({ avgScore: null, aboveThreshold: 0, belowThreshold: 0, scoredScans: 0 })
  const [listingStats, setListingStats] = useState({ listed: 0, reviewRequired: 0, eligible: 0, total: 0 })
  const [recentScans, setRecentScans] = useState([])

  // Buyer state
  const [storeStats, setStoreStats] = useState({ storeCount: 0, totalListedProducts: 0 })
  const [recentStores, setRecentStores] = useState([])
  const [buyerScans, setBuyerScans] = useState([])
  const [buyerScanStats, setBuyerScanStats] = useState({ total: 0, noIssues: 0, potentialIssues: 0, reviewRequired: 0 })

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)

    if (isSeller) {
      Promise.all([
        fetchScanStats(user.id),
        fetchUserScans(user.id, { limit: 5 }),
        fetchListingStats(user.id),
      ]).then(([statsResult, scansResult, listStatsResult]) => {
        setStats(statsResult)
        const scans = scansResult.data.map(dbRowToScan)
        setRecentScans(scans)

        const scoredScans = scans.filter((s) => s.screeningScore !== null && s.screeningScore !== undefined)
        if (scoredScans.length > 0) {
          const avg = scoredScans.reduce((sum, s) => sum + s.screeningScore, 0) / scoredScans.length
          setScoreStats({
            avgScore: Math.round(avg),
            aboveThreshold: scoredScans.filter((s) => s.screeningScore >= 70).length,
            belowThreshold: scoredScans.filter((s) => s.screeningScore < 70).length,
            scoredScans: scoredScans.length,
          })
        }

        if (listStatsResult) {
          setListingStats(listStatsResult)
        }

        setLoading(false)
      })
    } else {
      // Buyer dashboard
      Promise.all([
        fetchStoreStats(),
        fetchPublicStores({}),
        fetchScanStats(user.id),
        fetchUserScans(user.id, { limit: 5 }),
      ]).then(([statsResult, storesResult, scanStatsResult, scansResult]) => {
        setStoreStats(statsResult)
        setRecentStores(storesResult.data.map(dbRowToPublicStore).slice(0, 5))
        setBuyerScanStats(scanStatsResult)
        setBuyerScans(scansResult.data.map(dbRowToScan))
        setLoading(false)
      })
    }
  }, [user?.id, isSeller])

  // ── Seller Dashboard ──
  if (isSeller) {
    return (
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="bg-white rounded-lg border border-neutral-200 p-6 sm:p-8 shadow-sm min-w-0">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 break-words">Welcome to LegalCheck AI</h1>
              <p className="text-neutral-600 mt-2 overflow-wrap-anywhere">
                Manage your product inventory and screening results
              </p>
            </div>
            <Link
              to="/scan"
              className="mt-4 md:mt-0 px-6 sm:px-8 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center justify-center space-x-2 flex-shrink-0 whitespace-nowrap"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>Scan Product</span>
            </Link>
          </div>
        </div>

        {/* Profile Completeness */}
        {isSeller && sellerProfile && (() => {
          const shopDone = !!(sellerProfile.shop_name && sellerProfile.business_type)
          const sellerDone = !!(sellerProfile.owner_name && sellerProfile.phone)
          const pickupDone = !!(sellerProfile.address && sellerProfile.city && sellerProfile.state && sellerProfile.pincode)
          const allDone = shopDone && sellerDone && pickupDone
          if (allDone) return null
          return (
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-primary-900">Complete your seller profile</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                    <span className="flex items-center gap-1 text-xs">
                      {shopDone ? <CheckCircle className="h-3 w-3 text-success-600" /> : <span className="w-3 h-3 rounded-full border border-neutral-300" />}
                      <span className={shopDone ? 'text-success-700' : 'text-primary-600'}>Shop details</span>
                    </span>
                    <span className="flex items-center gap-1 text-xs">
                      {sellerDone ? <CheckCircle className="h-3 w-3 text-success-600" /> : <span className="w-3 h-3 rounded-full border border-neutral-300" />}
                      <span className={sellerDone ? 'text-success-700' : 'text-primary-600'}>Contact details</span>
                    </span>
                    <span className="flex items-center gap-1 text-xs">
                      {pickupDone ? <CheckCircle className="h-3 w-3 text-success-600" /> : <span className="w-3 h-3 rounded-full border border-neutral-300" />}
                      <span className={pickupDone ? 'text-success-700' : 'text-primary-600'}>Pickup info</span>
                    </span>
                  </div>
                </div>
                <Link
                  to="/seller-profile"
                  className="px-3 py-1.5 bg-primary-600 text-white text-xs font-medium rounded-lg hover:bg-primary-700 flex-shrink-0 whitespace-nowrap"
                >
                  Complete Setup
                </Link>
              </div>
            </div>
          )
        })()}

        {/* Scan Stats */}
        <div>
          <h2 className="text-sm font-medium text-neutral-500 mb-3 uppercase tracking-wide">Scanning</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <StatCard title="Total Scans" value={loading ? '—' : stats.total} icon="scan" color="primary" />
            <StatCard
              title="Avg Screening Score"
              value={loading ? '—' : scoreStats.avgScore !== null ? `${scoreStats.avgScore}%` : '—'}
              icon="score"
              color="primary"
            />
            <StatCard title="Above 70% Threshold" value={loading ? '—' : scoreStats.aboveThreshold} icon="pass" color="success" />
            <StatCard title="Below 70% Threshold" value={loading ? '—' : scoreStats.belowThreshold} icon="warn" color="warning" />
          </div>
        </div>

        {/* Seller Listing Stats */}
        <div>
          <h2 className="text-sm font-medium text-neutral-500 mb-3 uppercase tracking-wide">Store Inventory</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <StatCard title="Listed Products" value={loading ? '—' : listingStats.listed} icon="store" color="success" />
            <StatCard title="Products Needing Review" value={loading ? '—' : listingStats.reviewRequired} icon="review" color="warning" />
            <StatCard title="Eligible to List" value={loading ? '—' : listingStats.eligible} icon="shield" color="primary" />
            <StatCard title="Total Products" value={loading ? '—' : listingStats.total} icon="package" color="neutral" />
          </div>
        </div>

        {/* Recent Scans */}
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm">
          <div className="px-6 py-4 border-b border-neutral-200">
            <h2 className="text-lg font-semibold text-neutral-900">Recent Scans</h2>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center">
              <p className="text-neutral-400 text-sm">Loading scans…</p>
            </div>
          ) : recentScans.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="w-16 h-16 bg-neutral-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-neutral-500 font-medium">No scans yet</p>
              <p className="text-neutral-400 text-sm mt-1">Scan your first product to see results here.</p>
              <Link
                to="/scan"
                className="mt-4 inline-block px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                Scan Product
              </Link>
            </div>
          ) : (
            <>
              <div className="divide-y divide-neutral-200">
                {recentScans.map((scan, idx) => (
                  <AnimatedListItem key={scan.id} index={idx} className="px-6 py-4 hover:bg-neutral-50 transition-colors">
                    <div className="flex items-center justify-between gap-4 min-w-0">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-neutral-900 truncate">{scan.productName}</h3>
                        <p className="text-sm text-neutral-500 mt-1">
                          Scanned: {new Date(scan.createdAt).toLocaleDateString('en-IN')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                        <ScreeningScoreCard scoreData={scan.screeningScore ? {
                          screening_score: scan.screeningScore,
                          threshold_status: scan.screeningScore >= 70 ? 'MET' : 'BELOW_THRESHOLD',
                        } : null} compact />
                        <div className={`compliance-badge ${STATUS_BADGE[scan.overallStatus] || 'compliance-badge-warning'} hidden sm:inline-flex`}>
                          {STATUS_SHORT[scan.overallStatus] || scan.overallStatus}
                        </div>
                        <Link
                          to={`/report/${scan.id}`}
                          className="text-primary-600 hover:text-primary-700 text-sm font-medium whitespace-nowrap"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  </AnimatedListItem>
                ))}
              </div>
              <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200">
                <Link to="/history" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                  View all scans →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Buyer Dashboard ──
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 sm:p-8 shadow-sm min-w-0">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 break-words">Welcome to LegalCheck AI</h1>
            <p className="text-neutral-600 mt-2 overflow-wrap-anywhere">
              Browse stores, scan products for compliance, and discover screened products
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-4 md:mt-0 flex-shrink-0">
            <Link
              to="/scan"
              className="px-6 sm:px-8 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center justify-center space-x-2 whitespace-nowrap"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>Scan Product</span>
            </Link>
            <Link
              to="/stores"
              className="px-6 sm:px-8 py-3 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium flex items-center justify-center space-x-2 whitespace-nowrap"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span>Browse Stores</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Scan Stats */}
      <div>
        <h2 className="text-sm font-medium text-neutral-500 mb-3 uppercase tracking-wide">Your Scanning</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <StatCard title="Total Scans" value={loading ? '—' : buyerScanStats.total} icon="scan" color="primary" />
          <StatCard title="No Issues Found" value={loading ? '—' : buyerScanStats.noIssues} icon="pass" color="success" />
          <StatCard title="Potential Issues" value={loading ? '—' : buyerScanStats.potentialIssues} icon="warn" color="warning" />
          <StatCard title="Review Required" value={loading ? '—' : buyerScanStats.reviewRequired} icon="review" color="neutral" />
        </div>
      </div>

      {/* Marketplace Stats */}
      <div>
        <h2 className="text-sm font-medium text-neutral-500 mb-3 uppercase tracking-wide">Marketplace Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">            <StatCard
              title="Available Stores"
              value={loading ? '—' : storeStats.storeCount}
              icon="store"
              color="primary"
            />
            <StatCard
              title="Listed Products"
              value={loading ? '—' : storeStats.totalListedProducts}
              icon="package"
              color="success"
            />
        </div>
      </div>

      {/* Recent Scans */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-sm">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Recent Scans</h2>
          <div className="flex items-center gap-3">
            <Link to="/scan" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              Scan Product
            </Link>
            {buyerScanStats.total > 0 && (
              <Link to="/history" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                View all →
              </Link>
            )}
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center">
            <p className="text-neutral-400 text-sm">Loading scans…</p>
          </div>
        ) : buyerScans.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="w-16 h-16 bg-neutral-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-neutral-500 font-medium">No scans yet</p>
            <p className="text-neutral-400 text-sm mt-1">Upload a product image to check its compliance screening.</p>
            <Link
              to="/scan"
              className="mt-4 inline-block px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
            >
              Scan Product
            </Link>
          </div>
        ) : (
          <>
            <div className="divide-y divide-neutral-200">
              {buyerScans.map((scan, idx) => (
                <AnimatedListItem key={scan.id} index={idx} className="px-6 py-4 hover:bg-neutral-50 transition-colors">
                  <div className="flex items-center justify-between gap-4 min-w-0">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-neutral-900 truncate">{scan.productName}</h3>
                      <p className="text-sm text-neutral-500 mt-1">
                        Scanned: {new Date(scan.createdAt).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                      <ScreeningScoreCard scoreData={scan.screeningScore ? {
                        screening_score: scan.screeningScore,
                        threshold_status: scan.screeningScore >= 70 ? 'MET' : 'BELOW_THRESHOLD',
                      } : null} compact />
                      <div className={`compliance-badge ${STATUS_BADGE[scan.overallStatus] || 'compliance-badge-warning'} hidden sm:inline-flex`}>
                        {STATUS_SHORT[scan.overallStatus] || scan.overallStatus}
                      </div>
                      <Link
                        to={`/report/${scan.id}`}
                        className="text-primary-600 hover:text-primary-700 text-sm font-medium whitespace-nowrap"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                </AnimatedListItem>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Recent Stores */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-sm">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Recent Stores</h2>
          <Link to="/stores" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center">
            <p className="text-neutral-400 text-sm">Loading stores…</p>
          </div>
        ) : recentStores.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="w-16 h-16 bg-neutral-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <p className="text-neutral-500 font-medium">No stores available</p>
            <p className="text-neutral-400 text-sm mt-1">Check back later for listed stores and products.</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-200">
            {recentStores.map((store, idx) => (
              <AnimatedListItem key={store.storeId} index={idx}>
              <Link
                to={`/stores/${store.storeId}`}
                className="px-6 py-4 hover:bg-neutral-50 transition-colors block"
              >
                <div className="flex items-center justify-between gap-4 min-w-0">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-neutral-900 truncate">{store.shopName}</h3>
                    <p className="text-sm text-neutral-500 mt-0.5">
                      {store.city}, {store.state} · {store.listedProductCount} product{store.listedProductCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <ScreeningScoreCard
                      scoreData={store.storeScreeningScore != null ? {
                        screening_score: store.storeScreeningScore,
                        threshold_status: store.storeScreeningScore >= 70 ? 'MET' : 'BELOW_THRESHOLD',
                      } : null}
                      compact
                    />
                  </div>
                </div>
              </Link>
              </AnimatedListItem>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
