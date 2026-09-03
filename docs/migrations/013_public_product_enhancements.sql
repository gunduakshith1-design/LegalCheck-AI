-- ============================================================================
-- MIGRATION 013: Public Product Enhancements for Evidence Traceability
-- ============================================================================
-- Adds image_paths, scan_id, and image_count to get_public_product() RPC
-- so buyers can see product images and link back to scan evidence.
--
-- SAFETY:
--   - Replaces get_public_product() with updated version (CREATE OR REPLACE)
--   - No existing columns, data, or RLS policies are modified
--   - All added fields are non-PII: image URLs and scan reference
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_public_product(p_product_id UUID)
RETURNS TABLE (
  product_id UUID, product_name TEXT, image_path TEXT,
  screening_score NUMERIC, overall_status TEXT, rule_results JSONB,
  store_id UUID, shop_name TEXT, business_type TEXT, city TEXT, state TEXT,
  listing_price NUMERIC, mrp NUMERIC,
  image_paths JSONB, scan_id UUID, image_count INT
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT pr.id, pr.product_name, pr.image_path,
         pr.screening_score, pr.overall_status, pr.rule_results,
         sp.user_id, sp.shop_name, sp.business_type, sp.city, sp.state,
         sl.listing_price, pr.mrp,
         ps.image_paths,
         pr.scan_id,
         CASE
           WHEN ps.image_paths IS NOT NULL THEN jsonb_array_length(ps.image_paths)
           WHEN pr.image_path IS NOT NULL THEN 1
           ELSE 0
         END
  FROM products pr
  JOIN seller_listings sl ON sl.product_id = pr.id
  JOIN seller_profiles sp ON sp.user_id = pr.seller_user_id
  LEFT JOIN product_scans ps ON ps.id = pr.scan_id
  WHERE pr.id = p_product_id AND sl.listing_status = 'LISTED';
$$;

-- ============================================================================
-- Done. No existing data, RLS policies, or functions are modified.
-- ============================================================================
