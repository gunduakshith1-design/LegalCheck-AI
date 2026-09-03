-- ============================================================================
-- MIGRATION 008: place_order() with Listing Price + get_public_product()
-- ============================================================================
-- Updates place_order() to derive unit_price from the seller's listing_price.
-- Sets price_pending = FALSE when listing_price exists.
-- Calculates total_amount = unit_price * quantity (subtotal only).
-- Delivery fee is added separately when delivery is created.
--
-- SAFETY:
--   - CREATE OR REPLACE — no data loss
--   - Backward compatible: if listing_price is NULL, order creation fails
--   - No existing data is modified
--
-- IMPORTANT: Review before executing.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Updated place_order() with listing price derivation
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.place_order(
  p_product_id    UUID,
  p_quantity      INTEGER,
  p_delivery_address JSONB,
  p_buyer_note    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer_id      UUID;
  v_product       RECORD;
  v_listing       RECORD;
  v_order_id      UUID;
  v_item_id       UUID;
  v_address       JSONB;
  v_unit_price    NUMERIC;
  v_price_pending BOOLEAN;
  v_total_amount  NUMERIC;
BEGIN
  -- ── 1. Authenticate buyer ──
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- ── 2. Validate delivery address ──
  IF p_delivery_address IS NULL THEN
    RAISE EXCEPTION 'Delivery address is required';
  END IF;

  IF NOT (
    p_delivery_address ? 'full_name'
    AND p_delivery_address ? 'phone'
    AND p_delivery_address ? 'address_line'
    AND p_delivery_address ? 'city'
    AND p_delivery_address ? 'state'
    AND p_delivery_address ? 'pin_code'
  ) THEN
    RAISE EXCEPTION 'Delivery address must include full_name, phone, address_line, city, state, and pin_code';
  END IF;

  -- Trim address fields
  v_address := jsonb_build_object(
    'full_name',   trim(p_delivery_address->>'full_name'),
    'phone',       trim(p_delivery_address->>'phone'),
    'address_line',trim(p_delivery_address->>'address_line'),
    'city',        trim(p_delivery_address->>'city'),
    'state',       trim(p_delivery_address->>'state'),
    'pin_code',    trim(p_delivery_address->>'pin_code')
  );

  -- Validate non-empty required fields
  IF (v_address->>'full_name') = '' THEN
    RAISE EXCEPTION 'Full name is required';
  END IF;
  IF (v_address->>'phone') = '' THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;
  IF (v_address->>'address_line') = '' THEN
    RAISE EXCEPTION 'Address line is required';
  END IF;
  IF (v_address->>'city') = '' THEN
    RAISE EXCEPTION 'City is required';
  END IF;
  IF (v_address->>'state') = '' THEN
    RAISE EXCEPTION 'State is required';
  END IF;
  IF (v_address->>'pin_code') = '' THEN
    RAISE EXCEPTION 'PIN code is required';
  END IF;

  -- ── 3. Validate quantity ──
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;

  -- ── 4. Validate product exists ──
  SELECT id, seller_user_id, product_name, image_path, screening_score
  INTO v_product
  FROM public.products
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or has been deleted';
  END IF;

  -- ── 5. Validate screening score >= 70 ──
  IF v_product.screening_score IS NULL OR v_product.screening_score < 70 THEN
    RAISE EXCEPTION 'Product screening score is below the 70%% threshold and cannot be ordered';
  END IF;

  -- ── 6. Validate listing exists, is LISTED, and has a price ──
  SELECT id, seller_user_id, product_id, listing_status, listing_price
  INTO v_listing
  FROM public.seller_listings
  WHERE product_id = p_product_id
    AND seller_user_id = v_product.seller_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product is not currently listed in any store';
  END IF;

  IF v_listing.listing_status != 'LISTED' THEN
    RAISE EXCEPTION 'Product listing is not currently active (status: %)', v_listing.listing_status;
  END IF;

  -- ── 6b. Validate listing price exists and is valid ──
  -- This is the TRUSTED price from the seller's listing.
  -- The browser cannot override this.
  IF v_listing.listing_price IS NULL OR v_listing.listing_price <= 0 THEN
    RAISE EXCEPTION 'Product does not have a valid selling price. The seller must set a price before listing.';
  END IF;

  -- ── 7. Prevent buyer from ordering their own product ──
  IF v_product.seller_user_id = v_buyer_id THEN
    RAISE EXCEPTION 'You cannot order your own product';
  END IF;

  -- ── 8. Derive price from listing (NEVER from browser) ──
  v_unit_price := v_listing.listing_price;
  v_price_pending := FALSE;
  -- Subtotal = unit_price × quantity
  -- Delivery fee is added separately when delivery is created
  v_total_amount := v_unit_price * p_quantity;

  -- ── 9. Create order ──
  INSERT INTO public.orders (
    buyer_user_id,
    seller_user_id,
    status,
    unit_price,
    price_pending,
    delivery_fee,
    total_amount,
    delivery_address,
    buyer_note
  ) VALUES (
    v_buyer_id,
    v_product.seller_user_id,
    'PENDING',
    v_unit_price,
    v_price_pending,
    NULL,              -- delivery_fee TBD (added when delivery is created)
    v_total_amount,    -- subtotal = unit_price × quantity
    v_address,
    NULLIF(trim(p_buyer_note), '')
  )
  RETURNING id INTO v_order_id;

  -- ── 10. Create order item with snapshots ──
  INSERT INTO public.order_items (
    order_id,
    product_id,
    listing_id,
    quantity,
    unit_price,
    product_name_snapshot,
    screening_score_snapshot,
    image_path_snapshot
  ) VALUES (
    v_order_id,
    p_product_id,
    v_listing.id,
    p_quantity,
    v_unit_price,              -- snapshot of price at purchase time
    v_product.product_name,
    v_product.screening_score,
    v_product.image_path
  )
  RETURNING id INTO v_item_id;

  -- ── 11. Return order summary ──
  RETURN jsonb_build_object(
    'order_id',     v_order_id,
    'item_id',      v_item_id,
    'status',       'PENDING',
    'unit_price',   v_unit_price,
    'quantity',     p_quantity,
    'subtotal',     v_total_amount,
    'total_amount', v_total_amount,  -- same as subtotal until delivery_fee added
    'message',      'Order placed successfully'
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Updated get_public_product() to include pricing
-- ──────────────────────────────────────────────────────────────────────────────
-- Adds listing_price and mrp to the public product view.
-- SECURITY DEFINER — bypasses RLS to expose only safe public data.

CREATE OR REPLACE FUNCTION public.get_public_product(p_product_id UUID)
RETURNS TABLE (
  product_id UUID, product_name TEXT, image_path TEXT,
  screening_score NUMERIC, overall_status TEXT, rule_results JSONB,
  store_id UUID, shop_name TEXT, business_type TEXT, city TEXT, state TEXT,
  listing_price NUMERIC, mrp NUMERIC
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT pr.id, pr.product_name, pr.image_path, pr.screening_score,
         pr.overall_status, pr.rule_results,
         sp.user_id, sp.shop_name, sp.business_type, sp.city, sp.state,
         sl.listing_price, pr.mrp
  FROM products pr
  JOIN seller_listings sl ON sl.product_id = pr.id
  JOIN seller_profiles sp ON sp.user_id = pr.seller_user_id
  WHERE pr.id = p_product_id AND sl.listing_status = 'LISTED';
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Done. Existing RLS policies and triggers are NOT modified.
-- ============================================================================
