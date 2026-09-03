import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { MapPin, Package, ArrowLeft, Loader2, Store as StoreIcon } from 'lucide-react'
import ScreeningScoreCard from '../components/ScreeningScoreCard'
import { fetchPublicStores, fetchStoreListedProducts, dbRowToPublicStore, dbRowToPublicProduct } from '../lib/storeService'

export default function StoreDetail() {
  const { storeId } = useParams()
  const [store, setStore] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!storeId) return
    setLoading(true)

    Promise.all([
      fetchPublicStores({ search: null }),
      fetchStoreListedProducts(storeId),
    ]).then(([storesResult, productsResult]) => {
      const allStores = storesResult.data.map(dbRowToPublicStore)
      const foundStore = allStores.find((s) => s.storeId === storeId)
      setStore(foundStore || null)
      setProducts(productsResult.data.map(dbRowToPublicProduct))
      setLoading(false)
    }).catch(() => {
      setError('Failed to load store details.')
      setLoading(false)
    })
  }, [storeId])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    )
  }

  if (error || !store) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center shadow-sm">
          <StoreIcon className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-1">Store not found</h3>
          <p className="text-sm text-neutral-500 mb-4">
            {error || 'This store may no longer be available.'}
          </p>
          <Link
            to="/stores"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Stores
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back link */}
      <Link to="/stores" className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium">
        <ArrowLeft className="h-4 w-4" />
        All Stores
      </Link>

      {/* Store Header */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">{store.shopName}</h1>
            <div className="flex items-center gap-1.5 mt-1 text-sm text-neutral-500">
              <MapPin className="h-4 w-4 flex-shrink-0" />
              <span>{store.city}, {store.state}</span>
            </div>
            <p className="text-xs text-neutral-400 mt-1 capitalize">{store.businessType?.replace('_', ' ')}</p>
          </div>
          <div className="flex-shrink-0">
            <ScreeningScoreCard
              scoreData={store.storeScreeningScore != null ? {
                screening_score: store.storeScreeningScore,
                threshold: 70,
                threshold_status: store.storeScreeningScore >= 70 ? 'MET' : 'BELOW_THRESHOLD',
                applicable_rules: 0,
                detected_rules: 0,
                uncertain_rules: 0,
                not_detected_rules: 0,
                not_applicable_rules: 0,
              } : null}
            />
          </div>
        </div>

        {/* Store stats */}
        <div className="mt-4 flex items-center gap-6 text-sm text-neutral-600">
          <span>
            <span className="font-medium text-neutral-900">{store.listedProductCount}</span> listed product{store.listedProductCount !== 1 ? 's' : ''}
          </span>
          {store.reviewRequiredCount > 0 && (
            <span className="text-warning-600">
              {store.reviewRequiredCount} needing review
            </span>
          )}
        </div>

        {/* Disclaimer */}
        <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
          <p className="text-xs text-blue-700">
            The Store Screening Score is the average of AI-assisted screening scores for currently listed products.
            It is an informational aggregate — not legal certification or a guarantee of compliance.
          </p>
        </div>
      </div>

      {/* Listed Products */}
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Listed Products</h2>

        {products.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center shadow-sm">
            <Package className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-neutral-500 font-medium">No products currently listed</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => (
              <Link
                key={product.productId}
                to={`/stores/${storeId}/products/${product.productId}`}
                className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden hover:shadow-md hover:border-primary-200 transition-all duration-200"
              >
                {/* Image */}
                <div className="aspect-video bg-neutral-50">
                  {product.imagePath ? (
                    <img src={product.imagePath} alt={product.productName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="h-8 w-8 text-neutral-300" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-medium text-neutral-900 truncate">{product.productName}</h3>

                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {product.screeningScore != null ? (
                      <>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          product.screeningScore >= 70
                            ? 'bg-success-50 text-success-700 border border-success-200'
                            : 'bg-danger-50 text-danger-700 border border-danger-200'
                        }`}>
                          Screened · {Math.round(product.screeningScore)}%
                        </span>
                        {product.screeningScore >= 70 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success-50 text-success-600">
                            LegalCheck Screened
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-neutral-400">Not yet screened</span>
                    )}
                  </div>

                  {product.screeningScore != null && product.screeningScore < 70 && (
                    <p className="mt-1.5 text-xs text-warning-600">
                      Below screening threshold — review required
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
