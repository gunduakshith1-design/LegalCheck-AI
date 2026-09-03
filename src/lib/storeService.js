import { supabase } from './supabase'

/**
 * Store Service — buyer-facing queries for store discovery.
 *
 * Uses SECURITY DEFINER PostgreSQL functions to safely expose
 * public store/product data without breaking seller RLS policies.
 *
 * Private data (phone, email, verification numbers, unlisted products,
 * raw OCR, private scans) is NEVER exposed through these functions.
 */

/**
 * Fetch public stores with optional filters.
 *
 * @param {object} filters - { city, state, businessType, search }
 * @returns {{ data, error }}
 */
export async function fetchPublicStores(filters = {}) {
  if (!supabase) return { data: [], error: 'Supabase not configured' }

  const { data, error } = await supabase.rpc('get_public_stores', {
    p_city: filters.city || null,
    p_state: filters.state || null,
    p_business_type: filters.businessType || null,
    p_search: filters.search || null,
  })

  if (error) {
    console.error('[StoreService] Failed to fetch stores:', error)
    return { data: [], error: error.message }
  }

  return { data: data || [], error: null }
}

/**
 * Fetch listed products for a specific store.
 *
 * @param {string} storeId - The seller's user_id (used as store_id)
 * @returns {{ data, error }}
 */
export async function fetchStoreListedProducts(storeId) {
  if (!supabase || !storeId) return { data: [], error: null }

  const { data, error } = await supabase.rpc('get_store_listed_products', {
    p_store_id: storeId,
  })

  if (error) {
    console.error('[StoreService] Failed to fetch store products:', error)
    return { data: [], error: error.message }
  }

  return { data: data || [], error: null }
}

/**
 * Fetch public product detail for buyer viewing.
 *
 * @param {string} productId
 * @returns {{ data, error }}
 */
export async function fetchPublicProduct(productId) {
  if (!supabase || !productId) return { data: null, error: null }

  const { data, error } = await supabase.rpc('get_public_product', {
    p_product_id: productId,
  })

  if (error) {
    console.error('[StoreService] Failed to fetch product:', error)
    return { data: null, error: error.message }
  }

  // RPC returns an array; take the first row
  const row = data && data.length > 0 ? data[0] : null
  return { data: row, error: null }
}

/**
 * Fetch store stats for buyer dashboard.
 * Returns { storeCount, totalListedProducts }
 */
export async function fetchStoreStats() {
  if (!supabase) return { storeCount: 0, totalListedProducts: 0, error: null }

  const { data, error } = await supabase.rpc('get_public_stores', {
    p_city: null,
    p_state: null,
    p_business_type: null,
    p_search: null,
  })

  if (error) {
    console.error('[StoreService] Failed to fetch store stats:', error)
    return { storeCount: 0, totalListedProducts: 0, error: error.message }
  }

  const stores = data || []
  return {
    storeCount: stores.length,
    totalListedProducts: stores.reduce((sum, s) => sum + (s.listed_product_count || 0), 0),
    error: null,
  }
}

// ---------------------------------------------------------------------------
// Row → camelCase helpers
// ---------------------------------------------------------------------------

export function dbRowToPublicStore(row) {
  if (!row) return null
  return {
    storeId: row.store_id,
    shopName: row.shop_name,
    businessType: row.business_type,
    city: row.city,
    state: row.state,
    listedProductCount: Number(row.listed_product_count) || 0,
    storeScreeningScore: row.store_screening_score != null ? Number(row.store_screening_score) : null,
    reviewRequiredCount: Number(row.review_required_count) || 0,
  }
}

export function dbRowToPublicProduct(row) {
  if (!row) return null
  return {
    productId: row.product_id,
    productName: row.product_name || 'Unknown Product',
    imagePath: row.image_path,
    screeningScore: row.screening_score != null ? Number(row.screening_score) : null,
    overallStatus: row.overall_status,
    listedAt: row.listed_at,
    ruleResults: row.rule_results,
    // Pricing
    listingPrice: row.listing_price != null ? Number(row.listing_price) : null,
    mrp: row.mrp != null ? Number(row.mrp) : null,
    // Store info (only on detail view)
    storeId: row.store_id,
    shopName: row.shop_name,
    businessType: row.business_type,
    city: row.city,
    state: row.state,
    // Evidence traceability
    imagePaths: row.image_paths || (row.image_path ? [row.image_path] : []),
    scanId: row.scan_id || null,
    imageCount: row.image_count != null ? Number(row.image_count) : 0,
  }
}
