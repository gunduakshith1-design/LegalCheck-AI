import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, MapPin, Store as StoreIcon, Filter, X, Loader2 } from 'lucide-react'
import ScreeningScoreCard from '../components/ScreeningScoreCard'
import { fetchPublicStores, dbRowToPublicStore } from '../lib/storeService'

const BUSINESS_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'kirana', label: 'Kirana / Grocery' },
  { value: 'retail', label: 'Retail Shop' },
  { value: 'supermarket', label: 'Supermarket' },
  { value: 'other_retail', label: 'Other Retail' },
]

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa',
  'Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
  'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland',
  'Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
]

export default function Stores() {
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const loadStores = useCallback(async () => {
    setLoading(true)
    const { data } = await fetchPublicStores({
      city: city || null,
      state: state || null,
      businessType: businessType || null,
      search: search || null,
    })
    setStores(data.map(dbRowToPublicStore))
    setLoading(false)
  }, [city, state, businessType, search])

  useEffect(() => { loadStores() }, [loadStores])

  const handleSearch = (e) => {
    e.preventDefault()
    loadStores()
  }

  const clearFilters = () => {
    setSearch('')
    setCity('')
    setState('')
    setBusinessType('')
  }

  const hasFilters = city || state || businessType || search

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-900">Browse Stores</h1>
        <p className="text-neutral-600 mt-1">
          Discover sellers and their screened products
        </p>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-4">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stores by name..."
              className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 border rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              showFilters ? 'bg-primary-50 border-primary-300 text-primary-700' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            Search
          </button>
        </form>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-neutral-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Filter by city"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">State</label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">All States</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Business Type</label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {BUSINESS_TYPES.map((bt) => (
                  <option key={bt.value} value={bt.value}>{bt.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {hasFilters && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={clearFilters}
              className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
        </div>
      ) : stores.length === 0 ? (
        <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center shadow-sm">
          <StoreIcon className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-1">No stores found</h3>
          <p className="text-sm text-neutral-500">
            {hasFilters
              ? 'Try adjusting your search or filters.'
              : 'No stores are currently available. Check back later.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stores.map((store) => (
            <Link
              key={store.storeId}
              to={`/stores/${store.storeId}`}
              className="bg-white rounded-lg border border-neutral-200 shadow-sm p-5 hover:shadow-md hover:border-primary-200 transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-neutral-900 truncate">{store.shopName}</h3>
                  <div className="flex items-center gap-1.5 mt-1 text-sm text-neutral-500">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{store.city}, {store.state}</span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1 capitalize">{store.businessType?.replace('_', ' ')}</p>
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

              <div className="mt-4 flex items-center gap-4 text-sm">
                <span className="text-neutral-600">
                  <span className="font-medium text-neutral-900">{store.listedProductCount}</span> listed product{store.listedProductCount !== 1 ? 's' : ''}
                </span>
                {store.reviewRequiredCount > 0 && (
                  <span className="text-warning-600 text-xs">
                    {store.reviewRequiredCount} needing review
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
