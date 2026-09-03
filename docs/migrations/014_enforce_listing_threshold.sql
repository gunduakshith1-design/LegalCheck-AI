-- ============================================================================
-- MIGRATION 014: Enforce 70% Screening Threshold on Seller Listings
-- ============================================================================
-- Adds a database trigger that prevents listing a product whose screening
-- score is below 70%. This is the SERVER-SIDE enforcement point for the
-- listing gate.
--
-- WHY THIS IS NEEDED:
--   The .env.example documented validate_listing_threshold() but no migration
--   ever created it. The existing enforce_listing_price() trigger only checks
--   price, not score. Without this trigger, a seller could bypass the frontend
--   check and directly INSERT a LISTED row for a low-score product.
--
-- ENFORCEMENT CHAIN (after this migration):
--   1. Frontend: button disabled when score < 70 (cosmetic, bypassable)
--   2. Database trigger: BEFORE INSERT/UPDATE on seller_listings (authoritative)
--   3. place_order(): checks score >= 70 at order time (defense in depth)
--
-- WHAT THIS TRIGGER DOES:
--   - On INSERT: if listing_status = 'LISTED', checks product's screening_score >= 70
--   - On UPDATE: if listing_status changes to 'LISTED', checks product's screening_score >= 70
--   - Also prevents listing products with NULL screening_score
--   - Does NOT affect DRAFT, UNLISTED, or REVIEW_REQUIRED status changes
--
-- SAFETY:
--   - Uses CREATE OR REPLACE for idempotency
--   - DROP TRIGGER IF EXISTS before CREATE TRIGGER
--   - Only fires on INSERT/UPDATE, not on existing data
--   - Does not modify any existing data
--   - Preserves all existing RLS policies
--
-- IMPORTANT: Review before executing in Supabase SQL Editor.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Create the threshold enforcement function
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_listing_threshold()
RETURNS TRIGGER AS $$
DECLARE
  v_score NUMERIC;
  v_product_id UUID;
BEGIN
  -- Only enforce when listing_status is LISTED
  IF NEW.listing_status = 'LISTED' THEN
    v_product_id := NEW.product_id;

    -- Look up the screening score from the products table
    -- This is the TRUSTED score from the rule engine, not from the browser
    SELECT p.screening_score INTO v_score
    FROM public.products p
    WHERE p.id = v_product_id;

    -- Reject if no screening score exists
    IF v_score IS NULL THEN
      RAISE EXCEPTION 'Cannot list product: product has no screening score. Run a scan first.';
    END IF;

    -- Reject if score is below 70%
    IF v_score < 70 THEN
      RAISE EXCEPTION 'Cannot list product: screening score (%.1f%%) is below the 70%% threshold. Review the product and rescan if needed.', v_score;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Create the trigger (BEFORE INSERT and UPDATE)
-- ──────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS enforce_listing_threshold ON public.seller_listings;
CREATE TRIGGER enforce_listing_threshold
  BEFORE INSERT OR UPDATE ON public.seller_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_listing_threshold();

-- ──────────────────────────────────────────────────────────────────────────────
-- Done. This migration:
--   - Creates validate_listing_threshold() function
--   - Creates enforce_listing_threshold trigger on seller_listings
--   - Does NOT modify any existing data
--   - Does NOT modify any existing RLS policies
--   - Does NOT modify any existing triggers (enforce_listing_price remains)
--   - Is idempotent (safe to re-run)
-- ============================================================================
