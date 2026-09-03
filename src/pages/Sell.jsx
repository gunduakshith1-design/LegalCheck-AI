import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Plus, Eye, EyeOff, AlertTriangle, CheckCircle, Package, X } from 'lucide-react'
import ScreeningScoreCard from '../components/ScreeningScoreCard'
import { useAuth } from '../contexts/AuthContext'
import { fetchUserScans, dbRowToScan } from '../lib/scanService'
import {
  createProduct,
  createListing,
  updateListingStatus,
  fetchSellerProducts,
  fetchListedProductIds,
  findProductByScan,
  dbRowToProduct,
  dbRowToListing,
  fetchSellerListings,
} from '../lib/listingService'

const STATUS_BADGE = {
  NO_ISSUES_DETECTED: 'bg-success-100 text-success-800 border border-success-200',
  POTENTIAL_NON_COMPLIANCE: 'bg-danger-100 text-danger-800 border border-danger-200',
  REVIEW_REQUIRED: 'bg-warning-100 text-warning-800 border border-warning-200',
  INSUFFICIENT_EVIDENCE: 'bg-neutral-100 text-neutral-700 border border-neutral-200',
}

const STATUS_SHORT = {
  NO_ISSUES_DETECTED: 'PASS',
  POTENTIAL_NON_COMPLIANCE: 'ISSUES',
  REVIEW_REQUIRED: 'REVIEW',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT',
}

const LISTING_STATUS = {
  DRAFT: { label: 'Draft', color: 'bg-neutral-100 text-neutral-700' },
  LISTED: { label: 'Listed', color: 'bg-success-100 text-success-700' },
  REVIEW_REQUIRED: { label: 'Review Required', color: 'bg-warning-100 text-warning-700' },
  UNLISTED: { label: 'Unlisted', color: 'bg-neutral-100 text-neutral-500' },
}

// ---------------------------------------------------------------------------
// Add to Store Confirmation Modal
// ---------------------------------------------------------------------------
function AddToStoreModal({ scan, product, onConfirm, onCancel, creating }) {
  const [displayName, setDisplayName] = useState(
    product?.productName || scan?.productName || 'Unknown Product'
  )
  const [listingPrice, setListingPrice] = useState('')
  const [priceError, setPriceError] = useState('')
  const score = scan?.screeningScore
  const isEligible = score != null && score >= 70
  const ruleResults = scan?.ruleResults || []
  const detected = ruleResults.filter((r) => r.status === 'DETECTED').length
  const issues = ruleResults.filter((r) => r.status === 'NOT_DETECTED').length

  // Extract MRP from rule results if available
  const mrpRule = ruleResults.find((r) => r.field === 'mrp' && r.observed_value && r.observed_value !== 'MRP_KEYWORD_FOUND_NO_VALUE')
  const detectedMrp = mrpRule ? mrpRule.observed_value : null

  const handlePriceChange = (val) => {
    setListingPrice(val)
    setPriceError('')
    const num = parseFloat(val)
    if (val && (isNaN(num) || num <= 0)) {
      setPriceError('Price must be greater than 0')
    }
  }

  const handleConfirm = () => {
    const num = parseFloat(listingPrice)
    if (!listingPrice || isNaN(num) || num <= 0) {
      setPriceError('Selling price is required and must be greater than 0')
      return
    }
    onConfirm(displayName, num)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900">Add to Store</h2>
          <button onClick={onCancel} className="text-neutral-400 hover:text-neutral-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Product Name */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Product Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Enter product name"
            />
          </div>

          {/* Score */}
          <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-neutral-700">Screening Score</span>
              <span className={`text-lg font-bold ${isEligible ? 'text-success-700' : 'text-danger-700'}`}>
                {score != null ? `${Math.round(score)}%` : 'N/A'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isEligible ? (
                <>
                  <CheckCircle className="h-4 w-4 text-success-600" />
                  <span className="text-sm text-success-700 font-medium">Screening threshold met</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-danger-600" />
                  <span className="text-sm text-danger-700 font-medium">Review required — below 70% threshold</span>
                </>
              )}
            </div>
          </div>

          {/* Rule Summary */}
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="p-2 rounded-lg bg-success-50">
              <div className="font-semibold text-success-700">{detected}</div>
              <div className="text-success-600 text-xs">Detected</div>
            </div>
            <div className="p-2 rounded-lg bg-danger-50">
              <div className="font-semibold text-danger-700">{issues}</div>
              <div className="text-danger-600 text-xs">Issues</div>
            </div>
            <div className="p-2 rounded-lg bg-neutral-50">
              <div className="font-semibold text-neutral-700">{ruleResults.length}</div>
              <div className="text-neutral-500 text-xs">Total Checks</div>
            </div>
          </div>

          {/* Detected MRP */}
          {detectedMrp && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-xs text-blue-700">
                <span className="font-medium">Printed MRP detected:</span> {detectedMrp}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Your selling price should not exceed the printed MRP.
              </p>
            </div>
          )}

          {/* Selling Price */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Your Selling Price (₹) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={listingPrice}
              onChange={(e) => handlePriceChange(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                priceError ? 'border-danger-400' : 'border-neutral-300'
              }`}
              placeholder="e.g. 99.00"
            />
            {priceError && (
              <p className="text-xs text-danger-600 mt-1">{priceError}</p>
            )}
            <p className="text-xs text-neutral-400 mt-1">
              This is the price buyers will pay. Shipping cost is separate.
            </p>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-neutral-500">
            Listing this product makes it visible in your store. The screening score is a label compliance
            screening indicator, not a legal certification. Setting a selling price is required to list.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-neutral-200">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isEligible || creating || !displayName.trim() || !listingPrice}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEligible ? 'Confirm Listing' : 'Cannot List — Score Below 70%'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scan Card (for scans not yet productized)
// ---------------------------------------------------------------------------
function ScanCard({ scan, onAddToStore }) {
  const score = scan.screeningScore
  const isEligible = score != null && score >= 70

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {/* Image */}
        <div className="sm:w-40 h-40 sm:h-auto bg-neutral-50 flex-shrink-0">
          {scan.imagePath ? (
            <img src={scan.imagePath} alt={scan.productName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-10 w-10 text-neutral-300" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-medium text-neutral-900 truncate">{scan.productName}</h3>
              <p className="text-sm text-neutral-500 mt-0.5">
                Scanned: {new Date(scan.createdAt).toLocaleDateString('en-IN')}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <ScreeningScoreCard
                scoreData={score != null ? {
                  screening_score: score,
                  threshold_status: isEligible ? 'MET' : 'BELOW_THRESHOLD',
                } : null}
                compact
              />
              <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[scan.overallStatus] || ''}`}>
                {STATUS_SHORT[scan.overallStatus] || scan.overallStatus}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {isEligible ? (
              <span className="inline-flex items-center gap-1 text-xs text-success-700 font-medium">
                <CheckCircle className="h-3.5 w-3.5" />
                Screening threshold met — eligible for listing
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-danger-700 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                Review required — below 70% threshold
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Link
              to={`/report/${scan.id}`}
              className="px-3 py-1.5 text-xs font-medium text-neutral-600 border border-neutral-300 rounded-lg hover:bg-neutral-50"
            >
              View Report
            </Link>
            <button
              onClick={() => onAddToStore(scan)}
              disabled={!isEligible}
              className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              {isEligible ? 'Add to Store' : 'Score Below Threshold'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Product Card (for products already created)
// ---------------------------------------------------------------------------
function ProductCard({ product, listing, onUnlist, onList, loading }) {
  const score = product.screeningScore
  const isEligible = score != null && score >= 70
  const listingStatus = listing?.listingStatus
  const isListed = listingStatus === 'LISTED'
  const isUnlisted = listingStatus === 'UNLISTED' || !listing

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {/* Image */}
        <div className="sm:w-40 h-40 sm:h-auto bg-neutral-50 flex-shrink-0">
          {product.imagePath ? (
            <img src={product.imagePath} alt={product.productName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-10 w-10 text-neutral-300" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-medium text-neutral-900 truncate">{product.productName}</h3>
              <p className="text-sm text-neutral-500 mt-0.5">
                Added: {new Date(product.createdAt).toLocaleDateString('en-IN')}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <ScreeningScoreCard
                scoreData={score != null ? {
                  screening_score: score,
                  threshold_status: isEligible ? 'MET' : 'BELOW_THRESHOLD',
                } : null}
                compact
              />
              {listingStatus && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${LISTING_STATUS[listingStatus]?.color || ''}`}>
                  {LISTING_STATUS[listingStatus]?.label || listingStatus}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Link
              to={`/report/${product.scanId}`}
              className="px-3 py-1.5 text-xs font-medium text-neutral-600 border border-neutral-300 rounded-lg hover:bg-neutral-50"
            >
              View Report
            </Link>

            {!listing && isEligible && (
              <button
                onClick={() => onList(product)}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                List in Store
              </button>
            )}

            {!listing && !isEligible && (
              <span className="inline-flex items-center gap-1 text-xs text-danger-600 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                Cannot list — score below 70%
              </span>
            )}

            {isListed && (
              <button
                onClick={() => onUnlist(product)}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-medium text-danger-600 border border-danger-300 rounded-lg hover:bg-danger-50 flex items-center gap-1"
              >
                <EyeOff className="h-3.5 w-3.5" />
                Unlist
              </button>
            )}

            {listingStatus === 'UNLISTED' && isEligible && (
              <button
                onClick={() => onList(product)}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 flex items-center gap-1"
              >
                <Eye className="h-3.5 w-3.5" />
                Re-list
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Sell Page
// ---------------------------------------------------------------------------
export default function Sell() {
  const { user } = useAuth()
  const [scans, setScans] = useState([])
  const [products, setProducts] = useState([])
  const [listings, setListings] = useState([])
  const [listedScanIds, setListedScanIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [modalScan, setModalScan] = useState(null)
  const [creating, setCreating] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('scans') // 'scans' | 'products'

  const loadData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)

    try {
      const [scansResult, productsResult, listingsResult] = await Promise.all([
        fetchUserScans(user.id),
        fetchSellerProducts(user.id),
        fetchSellerListings(user.id),
      ])

      const allScans = scansResult.data.map(dbRowToScan)
      const allProducts = productsResult.data.map(dbRowToProduct)
      const allListings = listingsResult.data.map(dbRowToListing)

      // Find which scans already have products
      const scansWithProducts = new Set(allProducts.map((p) => p.scanId))

      setScans(allScans.filter((s) => !scansWithProducts.has(s.id)))
      setProducts(allProducts)
      setListings(allListings)

      // Build a map of product_id → listing
      const listingMap = new Map()
      allListings.forEach((l) => listingMap.set(l.productId, l))
      setListedScanIds(new Set(
        allListings.filter((l) => l.listingStatus === 'LISTED').map((l) => l.productId)
      ))
    } catch (err) {
      console.error('[Sell] Failed to load data:', err)
      setError('Failed to load inventory data.')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { loadData() }, [loadData])

  // Get listing for a product
  const getListing = (productId) => listings.find((l) => l.productId === productId)

  // Handle Add to Store — open modal
  const handleAddToStore = (scan) => {
    setModalScan(scan)
    setError(null)
  }

  // Handle Confirm — create product + listing
  const handleConfirm = async (displayName, listingPrice) => {
    if (!modalScan || !user?.id) return
    setCreating(true)
    setError(null)

    try {
      // 1. Create product from scan
      const { data: product, error: prodErr } = await createProduct(
        user.id,
        modalScan.id,
        modalScan,
        displayName
      )
      if (prodErr) throw new Error(prodErr)

      // 2. Create listing with price
      const { error: listErr } = await createListing(user.id, product.id, listingPrice)
      if (listErr) throw new Error(listErr)

      setModalScan(null)
      await loadData()
    } catch (err) {
      console.error('[Sell] Failed to add to store:', err)
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  // Handle Unlist
  const handleUnlist = async (product) => {
    if (!user?.id) return
    setActionLoading(true)
    try {
      await updateListingStatus(user.id, product.id, 'UNLISTED')
      await loadData()
    } catch (err) {
      console.error('[Sell] Failed to unlist:', err)
      setError('Failed to unlist product.')
    } finally {
      setActionLoading(false)
    }
  }

  // Handle List (from product card)
  const handleList = async (product) => {
    if (!user?.id) return
    setActionLoading(true)
    try {
      const { error } = await createListing(user.id, product.id)
      if (error) throw new Error(error)
      await loadData()
    } catch (err) {
      console.error('[Sell] Failed to list:', err)
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const unlistedScans = scans // scans without a product
  const allProductsList = products

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-900">Your Products</h1>
        <p className="text-neutral-600 mt-1">
          Manage your scanned products and store listings
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('scans')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'scans'
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Scanned Products ({unlistedScans.length})
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'products'
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Inventory ({allProductsList.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
        </div>
      ) : activeTab === 'scans' ? (
        // Scans without products
        unlistedScans.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center shadow-sm">
            <Package className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-neutral-900 mb-1">No unlisted scans</h3>
            <p className="text-sm text-neutral-500 mb-4">
              All your scans have been added to your inventory, or you haven't scanned any products yet.
            </p>
            <Link
              to="/scan"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" />
              Scan a Product
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {unlistedScans.map((scan) => (
              <ScanCard key={scan.id} scan={scan} onAddToStore={handleAddToStore} />
            ))}
          </div>
        )
      ) : (
        // Products inventory
        allProductsList.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center shadow-sm">
            <Package className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-neutral-900 mb-1">No products yet</h3>
            <p className="text-sm text-neutral-500 mb-4">
              Scan a product and add it to your store to see it here.
            </p>
            <Link
              to="/scan"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" />
              Scan a Product
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {allProductsList.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                listing={getListing(product.id)}
                onUnlist={handleUnlist}
                onList={handleList}
                loading={actionLoading}
              />
            ))}
          </div>
        )
      )}

      {/* Add to Store Modal */}
      {modalScan && (
        <AddToStoreModal
          scan={modalScan}
          onConfirm={handleConfirm}
          onCancel={() => setModalScan(null)}
          creating={creating}
        />
      )}
    </div>
  )
}
