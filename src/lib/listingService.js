import { supabase } from './supabase'

/**
 * Listing Service — Supabase CRUD for products + seller_listings.
 *
 * Flow: seller scans → creates product from scan → creates listing from product.
 * The 70% threshold is enforced server-side via a PostgreSQL trigger.
 */

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * Create a product from an existing scan.
 * Links the scan evidence to the seller's inventory.
 *
 * @param {string} sellerUserId - Authenticated seller's user ID
 * @param {string} scanId - The product_scans record ID
 * @param {object} scanData - The scan data (name, image, score, rules, status)
 * @param {string} displayName - Seller-editable display name
 * @returns {{ data, error }}
 */
export async function createProduct(sellerUserId, scanId, scanData, displayName) {
  if (!supabase || !sellerUserId || !scanId) {
    return { data: null, error: 'Missing required parameters' }
  }

  const payload = {
    scan_id: scanId,
    seller_user_id: sellerUserId,
    product_name: displayName || scanData.productName || 'Unknown Product',
    image_path: scanData.imagePath || null,
    screening_score: scanData.screeningScore ?? null,
    overall_status: scanData.overallStatus || 'REVIEW_REQUIRED',
    rule_results: scanData.ruleResults || null,
  }

  const { data, error } = await supabase
    .from('products')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.error('[ListingService] Failed to create product:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

/**
 * Fetch all products for the current seller, newest first.
 */
export async function fetchSellerProducts(sellerUserId) {
  if (!supabase || !sellerUserId) return { data: [], error: null }

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('seller_user_id', sellerUserId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[ListingService] Failed to fetch products:', error)
    return { data: [], error: error.message }
  }

  return { data: data || [], error: null }
}

/**
 * Fetch products that already have a listing for this seller.
 */
export async function fetchListedProductIds(sellerUserId) {
  if (!supabase || !sellerUserId) return new Set()

  const { data, error } = await supabase
    .from('seller_listings')
    .select('product_id')
    .eq('seller_user_id', sellerUserId)
    .in('listing_status', ['DRAFT', 'LISTED'])

  if (error) {
    console.error('[ListingService] Failed to fetch listed product IDs:', error)
    return new Set()
  }

  return new Set((data || []).map((r) => r.product_id))
}

/**
 * Check if a scan has already been turned into a product by this seller.
 */
export async function findProductByScan(sellerUserId, scanId) {
  if (!supabase || !sellerUserId || !scanId) return null

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('seller_user_id', sellerUserId)
    .eq('scan_id', scanId)
    .single()

  if (error) return null
  return data
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

/**
 * Create a listing for a product (List it in the store).
 *
 * @param {string} sellerUserId
 * @param {string} productId
 * @param {number} listingPrice - Seller's selling price in INR (required)
 * @returns {{ data, error }}
 */
export async function createListing(sellerUserId, productId, listingPrice) {
  if (!supabase || !sellerUserId || !productId) {
    return { data: null, error: 'Missing required parameters' }
  }

  // Validate price
  if (!listingPrice || listingPrice <= 0) {
    return { data: null, error: 'Selling price is required and must be greater than 0' }
  }

  const { data, error } = await supabase
    .from('seller_listings')
    .insert({
      seller_user_id: sellerUserId,
      product_id: productId,
      listing_status: 'LISTED',
      listing_price: listingPrice,
      listed_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('[ListingService] Failed to create listing:', error)
    // Check if it's a threshold violation
    if (error.message?.includes('70%') || error.message?.includes('threshold')) {
      return { data: null, error: 'Screening score is below the 70% threshold. Review required before listing.' }
    }
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

/**
 * Update a listing's status (e.g., unlist).
 */
export async function updateListingStatus(sellerUserId, productId, status) {
  if (!supabase || !sellerUserId || !productId) {
    return { data: null, error: 'Missing required parameters' }
  }

  const updates = { listing_status: status }
  if (status === 'UNLISTED') {
    updates.listed_at = null
  }

  const { data, error } = await supabase
    .from('seller_listings')
    .update(updates)
    .eq('seller_user_id', sellerUserId)
    .eq('product_id', productId)
    .select()
    .single()

  if (error) {
    console.error('[ListingService] Failed to update listing:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

/**
 * Fetch the listing for a specific product + seller.
 */
export async function fetchListing(sellerUserId, productId) {
  if (!supabase || !sellerUserId || !productId) return null

  const { data, error } = await supabase
    .from('seller_listings')
    .select('*')
    .eq('seller_user_id', sellerUserId)
    .eq('product_id', productId)
    .single()

  if (error) return null
  return data
}

/**
 * Fetch all listings for the current seller.
 */
export async function fetchSellerListings(sellerUserId) {
  if (!supabase || !sellerUserId) return { data: [], error: null }

  const { data, error } = await supabase
    .from('seller_listings')
    .select('*')
    .eq('seller_user_id', sellerUserId)
    .order('listed_at', { ascending: false, nullsFirst: true })

  if (error) {
    console.error('[ListingService] Failed to fetch listings:', error)
    return { data: [], error: error.message }
  }

  return { data: data || [], error: null }
}

/**
 * Fetch listing stats for the dashboard.
 * Returns { listed, reviewRequired, eligible, total }
 */
export async function fetchListingStats(sellerUserId) {
  if (!supabase || !sellerUserId) {
    return { listed: 0, reviewRequired: 0, eligible: 0, total: 0, error: null }
  }

  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, screening_score')
    .eq('seller_user_id', sellerUserId)

  if (prodErr) {
    console.error('[ListingService] Failed to fetch product stats:', prodErr)
    return { listed: 0, reviewRequired: 0, eligible: 0, total: 0, error: prodErr.message }
  }

  const { data: listings, error: listErr } = await supabase
    .from('seller_listings')
    .select('product_id, listing_status')
    .eq('seller_user_id', sellerUserId)

  if (listErr) {
    console.error('[ListingService] Failed to fetch listing stats:', listErr)
    return { listed: 0, reviewRequired: 0, eligible: 0, total: 0, error: listErr.message }
  }

  const allProducts = products || []
  const allListings = listings || []
  const listedProductIds = new Set(
    allListings.filter((l) => l.listing_status === 'LISTED').map((l) => l.product_id)
  )
  const reviewProductIds = new Set(
    allListings.filter((l) => l.listing_status === 'REVIEW_REQUIRED').map((l) => l.product_id)
  )

  return {
    listed: listedProductIds.size,
    reviewRequired: reviewProductIds.size,
    eligible: allProducts.filter((p) => p.screening_score != null && p.screening_score >= 70).length,
    total: allProducts.length,
    error: null,
  }
}

// ---------------------------------------------------------------------------
// Row → camelCase helpers
// ---------------------------------------------------------------------------

export function dbRowToProduct(row) {
  if (!row) return null
  return {
    id: row.id,
    scanId: row.scan_id,
    sellerUserId: row.seller_user_id,
    productName: row.product_name || 'Unknown Product',
    imagePath: row.image_path,
    screeningScore: row.screening_score,
    overallStatus: row.overall_status,
    ruleResults: row.rule_results,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function dbRowToListing(row) {
  if (!row) return null
  return {
    id: row.id,
    sellerUserId: row.seller_user_id,
    productId: row.product_id,
    listingStatus: row.listing_status,
    listingPrice: row.listing_price != null ? Number(row.listing_price) : null,
    listedAt: row.listed_at,
    updatedAt: row.updated_at,
  }
}
