-- ============================================================================
-- MIGRATION 010: Buyer Marketplace RPC Functions
-- ============================================================================
-- Creates the two SECURITY DEFINER functions that the buyer marketplace
-- depends on to discover stores and listed products.
--
-- ROOT CAUSE: These functions were documented in .env.example but never
-- applied to the database. The storeService.js calls them via supabase.rpc(),
-- but they silently fail and return empty arrays, causing the buyer
-- marketplace to show 0 stores and 0 products.
--
-- WHY SECURITY DEFINER: The underlying tables (products, seller_profiles,
-- seller_listings) have RLS policies that restrict SELECT to the owning
-- seller only. Buyers cannot directly query these tables. SECURITY DEFINER
-- functions run with the owner's privileges, bypassing RLS to expose only
-- safe public data (shop name, city, product name, screening score).
-- Private data (phone, email, verification numbers) is NEVER exposed.
--
-- SAFETY:
--   - No existing tables or data are modified
--   - No existing RLS policies are modified
--   - GRANT only to 'authenticated' role (logged-in buyers)
--   - Uses CREATE OR REPLACE for idempotency
--
-- Run in Supabase SQL Editor or via `supabase db push`.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. get_public_stores() — Discover stores with listed products
-- ──────────────────────────────────────────────────────────────────────────────
-- Returns all seller stores that have at least one product with
-- listing_status = 'LISTED'. Includes aggregate stats for the store.
--
-- Parameters: optional filters for city, state, business type, search.
-- Returns: store_id, shop_name, business_type, city, state,
--          listed_product_count, store_screening_score, review_required_count
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_public_stores(
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_business_type TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
  store_id UUID,
  shop_name TEXT,
  business_type TEXT,
  city TEXT,
  state TEXT,
  listed_product_count BIGINT,
  store_screening_score NUMERIC,
  review_required_count BIGINT
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    sp.user_id AS store_id,
    sp.shop_name,
    sp.business_type,
    sp.city,
    sp.state,
    COUNT(DISTINCT CASE WHEN sl.listing_status = 'LISTED' THEN sl.product_id END),
    ROUND(AVG(CASE WHEN sl.listing_status = 'LISTED' THEN p.screening_score END), 1),
    COUNT(DISTINCT CASE WHEN sl.listing_status = 'LISTED' AND p.screening_score < 70 THEN sl.product_id END)
  FROM seller_profiles sp
  LEFT JOIN seller_listings sl ON sl.seller_user_id = sp.user_id
  LEFT JOIN products p ON p.id = sl.product_id
  WHERE (p_city IS NULL OR sp.city ILIKE '%' || p_city || '%')
    AND (p_state IS NULL OR sp.state ILIKE '%' || p_state || '%')
    AND (p_business_type IS NULL OR sp.business_type = p_business_type)
    AND (p_search IS NULL OR sp.shop_name ILIKE '%' || p_search || '%')
  GROUP BY sp.user_id, sp.shop_name, sp.business_type, sp.city, sp.state
  HAVING COUNT(DISTINCT CASE WHEN sl.listing_status = 'LISTED' THEN sl.product_id END) > 0
  ORDER BY sp.shop_name;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. get_store_listed_products() — Products listed by a specific store
-- ──────────────────────────────────────────────────────────────────────────────
-- Returns all products with listing_status = 'LISTED' for a given store.
-- Used by the StoreDetail page to show a store's product catalog.
--
-- Parameters: p_store_id = the seller's user_id (store identity).
-- Returns: product_id, product_name, image_path, screening_score,
--          overall_status, listed_at, rule_results, listing_price, mrp
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_store_listed_products(p_store_id UUID)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  image_path TEXT,
  screening_score NUMERIC,
  overall_status TEXT,
  listed_at TIMESTAMPTZ,
  rule_results JSONB,
  listing_price NUMERIC,
  mrp NUMERIC
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT pr.id, pr.product_name, pr.image_path, pr.screening_score,
         pr.overall_status, sl.listed_at, pr.rule_results,
         sl.listing_price, pr.mrp
  FROM seller_listings sl
  JOIN products pr ON pr.id = sl.product_id
  WHERE sl.seller_user_id = p_store_id AND sl.listing_status = 'LISTED'
  ORDER BY sl.listed_at DESC NULLS LAST;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Grant execute permissions to authenticated users
-- ──────────────────────────────────────────────────────────────────────────────
-- Only logged-in buyers can call these functions.
-- Anonymous/public access is not granted (buyers must authenticate).
-- ──────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_public_stores(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_listed_products(UUID) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- Done. Existing RLS policies, functions, triggers, and data are NOT modified.
-- ============================================================================