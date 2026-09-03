-- ============================================================================
-- MIGRATION 007: Listing Pricing, MRP, and Pickup Location
-- ============================================================================
-- Adds seller-controlled selling price, detected MRP, and pickup location.
-- Includes server-side enforcement triggers.
--
-- SAFETY:
--   - All new columns are NULLABLE
--   - Existing rows are unaffected
--   - No existing data is deleted or modified
--   - Uses IF NOT EXISTS for idempotency
--   - Triggers only enforce on NEW inserts/updates, not existing data
--
-- IMPORTANT: Review this migration before executing.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Add listing_price to seller_listings
-- ──────────────────────────────────────────────────────────────────────────────
-- The seller's actual selling price for this product.
-- Required for LISTED products. Must be > 0.

ALTER TABLE public.seller_listings
  ADD COLUMN IF NOT EXISTS listing_price NUMERIC NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Add mrp to products
-- ──────────────────────────────────────────────────────────────────────────────
-- The detected MRP from the package label (extracted by rule engine).
-- Nullable — MRP may not be detected on all products.
-- Stored as numeric for price comparisons.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS mrp NUMERIC NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Add shiprocket_pickup_location to seller_profiles
-- ──────────────────────────────────────────────────────────────────────────────
-- Maps the seller to their configured Shiprocket pickup location.
-- Must match a location name configured in the Shiprocket dashboard.
-- Authoritative source for pickup location in real shipments.

ALTER TABLE public.seller_profiles
  ADD COLUMN IF NOT EXISTS shiprocket_pickup_location TEXT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Indexes
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_seller_listings_price
  ON public.seller_listings(listing_price)
  WHERE listing_price IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Trigger: Enforce listing_price when status becomes LISTED
-- ──────────────────────────────────────────────────────────────────────────────
-- When a listing transitions to LISTED, listing_price must be > 0.
-- This prevents products from being listed without a valid price.

CREATE OR REPLACE FUNCTION public.enforce_listing_price()
RETURNS TRIGGER AS $$
BEGIN
  -- Only enforce when status is LISTED
  IF NEW.listing_status = 'LISTED' THEN
    -- listing_price must exist and be > 0
    IF NEW.listing_price IS NULL OR NEW.listing_price <= 0 THEN
      RAISE EXCEPTION 'Cannot list product: selling price is required and must be greater than 0';
    END IF;

    -- If trusted MRP exists on the product, listing_price must not exceed it
    IF NEW.product_id IS NOT NULL THEN
      DECLARE
        v_mrp NUMERIC;
      BEGIN
        SELECT mrp INTO v_mrp FROM public.products WHERE id = NEW.product_id;
        IF v_mrp IS NOT NULL AND v_mrp > 0 AND NEW.listing_price > v_mrp THEN
          RAISE EXCEPTION 'Cannot list product: selling price (₹%) exceeds the detected MRP (₹%)', NEW.listing_price, v_mrp;
        END IF;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_listing_price_on_change ON public.seller_listings;
CREATE TRIGGER enforce_listing_price_on_change
  BEFORE INSERT OR UPDATE ON public.seller_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_listing_price();

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. Trigger: Populate products.mrp from rule_results on product creation
-- ──────────────────────────────────────────────────────────────────────────────
-- When a product is created, extract MRP from rule_results if available.
-- This ensures mrp is populated alongside the product, not left permanently NULL.

CREATE OR REPLACE FUNCTION public.populate_product_mrp()
RETURNS TRIGGER AS $$
DECLARE
  v_mrp_value TEXT;
  v_mrp_numeric NUMERIC;
BEGIN
  -- Only populate if mrp is not already set
  IF NEW.mrp IS NULL AND NEW.rule_results IS NOT NULL THEN
    -- Look for MRP in rule_results (extracted field with field_name = 'mrp')
    -- rule_results is an array of rule result objects
    -- Each has: { rule_id, field, status, observed_value, ... }
    -- Find the MRP rule where status = 'DETECTED' and observed_value is numeric
    IF jsonb_array_length(NEW.rule_results) > 0 THEN
      -- Try to extract MRP value from the first matching rule
      SELECT (elem->>'observed_value') INTO v_mrp_value
      FROM jsonb_array_elements(NEW.rule_results) AS elem
      WHERE elem->>'field' = 'mrp'
        AND elem->>'status' = 'DETECTED'
        AND elem->>'observed_value' IS NOT NULL
        AND elem->>'observed_value' != 'MRP_KEYWORD_FOUND_NO_VALUE'
      LIMIT 1;

      -- Parse the MRP value (may contain currency symbols like "Rs. 299" or "₹299")
      IF v_mrp_value IS NOT NULL THEN
        -- Remove currency symbols and whitespace, extract numeric part
        v_mrp_numeric := NULLIF(
          regexp_replace(v_mrp_value, '[^0-9.]', '', 'g'),
          ''
        )::NUMERIC;

        IF v_mrp_numeric IS NOT NULL AND v_mrp_numeric > 0 THEN
          NEW.mrp := v_mrp_numeric;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS populate_mrp_on_product_insert ON public.products;
CREATE TRIGGER populate_mrp_on_product_insert
  BEFORE INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.populate_product_mrp();

-- ──────────────────────────────────────────────────────────────────────────────
-- Done. Existing RLS policies, functions, and triggers are NOT modified.
-- All new columns are NULLABLE, so existing data is unaffected.
-- Triggers only enforce on NEW inserts/updates, not existing data.
-- ============================================================================
