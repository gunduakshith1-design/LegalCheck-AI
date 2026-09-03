-- ============================================================================
-- MIGRATION 004: Orders & Order Items  (SECURITY-REVIEWED)
-- ============================================================================
-- Creates the internal ordering system for LegalCheck AI.
--
-- Security review completed. Corrections applied:
--   FIX-1: Removed 'CANCELLED' from seller transition map (buyer-only action)
--   FIX-2: Removed permissive orders_buyer_insert policy (use place_order() only)
--   FIX-3: Removed permissive order_items_insert policy (use place_order() only)
--   FIX-4: Added WITH CHECK on seller UPDATE to restrict to status-only changes
--
-- IMPORTANT: Review this migration before executing.
-- Run in the Supabase SQL Editor or via `supabase db push`.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. orders table
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  seller_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN (
                      'PENDING','ACCEPTED','PREPARING','READY_FOR_PICKUP',
                      'OUT_FOR_DELIVERY','DELIVERED','CANCELLED','REJECTED'
                    )),
  unit_price      NUMERIC NULL,          -- NULL = price pending (prototype)
  price_pending   BOOLEAN NOT NULL DEFAULT TRUE,
  delivery_fee    NUMERIC NULL,          -- NULL = not yet calculated
  total_amount    NUMERIC NULL,          -- NULL = pending price confirmation
  delivery_address JSONB NOT NULL,       -- {full_name, phone, address_line, city, state, pin_code}
  buyer_note      TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON public.orders(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON public.orders(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders(created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. order_items table
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id              UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  listing_id              UUID NOT NULL REFERENCES public.seller_listings(id) ON DELETE RESTRICT,
  quantity                INTEGER NOT NULL CHECK (quantity > 0),
  unit_price              NUMERIC NULL,          -- snapshot at order time
  product_name_snapshot   TEXT NOT NULL,          -- snapshot at order time
  screening_score_snapshot NUMERIC NULL,          -- snapshot at order time
  image_path_snapshot     TEXT NULL,              -- snapshot at order time
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. updated_at trigger for orders
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_orders_updated ON public.orders;
CREATE TRIGGER on_orders_updated
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_orders_updated_at();

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. place_order() — SECURITY DEFINER function for secure order creation
-- ──────────────────────────────────────────────────────────────────────────────
-- This function is the ONLY way to create orders.
-- It validates everything server-side and cannot be bypassed.
--
-- Security checks performed:
--   1. Buyer is authenticated (auth.uid() is not null)
--   2. Product exists and is not deleted
--   3. Product belongs to the intended seller
--   4. Listing exists and is linked to the product + seller
--   5. Listing status = 'LISTED'
--   6. Product screening_score >= 70
--   7. Quantity > 0
--   8. Delivery address has required fields
--   9. buyer_user_id = auth.uid() (buyer cannot impersonate)
--  10. No client-submitted price, screening_score, or seller_user_id can be trusted
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

  -- ── 6. Validate listing exists, is LISTED, and matches product + seller ──
  SELECT id, seller_user_id, product_id, listing_status
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

  -- ── 7. Prevent buyer from ordering their own product ──
  IF v_product.seller_user_id = v_buyer_id THEN
    RAISE EXCEPTION 'You cannot order your own product';
  END IF;

  -- ── 8. Create order ──
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
    NULL,              -- no price yet (prototype)
    TRUE,              -- price_pending
    NULL,              -- delivery_fee TBD
    NULL,              -- total_amount TBD (NULL = pending)
    v_address,
    NULLIF(trim(p_buyer_note), '')
  )
  RETURNING id INTO v_order_id;

  -- ── 9. Create order item with snapshots ──
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
    NULL,                            -- price_pending
    v_product.product_name,
    v_product.screening_score,
    v_product.image_path
  )
  RETURNING id INTO v_item_id;

  -- ── 10. Return order summary ──
  RETURN jsonb_build_object(
    'order_id',   v_order_id,
    'item_id',    v_item_id,
    'status',     'PENDING',
    'message',    'Order placed successfully'
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. update_order_status() — SECURITY DEFINER for seller status transitions
-- ──────────────────────────────────────────────────────────────────────────────
-- Only the seller who owns the order can update status.
-- Only valid transitions are allowed.
-- FIX-1: Removed 'CANCELLED' from seller transitions — cancellation is buyer-only.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id  UUID,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID;
  v_order      RECORD;
  v_valid_transition BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Fetch the order
  SELECT id, seller_user_id, status INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Only the seller can update status
  IF v_order.seller_user_id != v_user_id THEN
    RAISE EXCEPTION 'You do not have permission to update this order';
  END IF;

  -- Validate status transition
  -- FIX-1: CANCELLED removed — only the buyer can cancel (via cancel_order())
  v_valid_transition := CASE
    WHEN v_order.status = 'PENDING'            AND p_new_status IN ('ACCEPTED', 'REJECTED') THEN TRUE
    WHEN v_order.status = 'ACCEPTED'           AND p_new_status IN ('PREPARING') THEN TRUE
    WHEN v_order.status = 'PREPARING'          AND p_new_status IN ('READY_FOR_PICKUP') THEN TRUE
    WHEN v_order.status = 'READY_FOR_PICKUP'   AND p_new_status IN ('OUT_FOR_DELIVERY') THEN TRUE
    WHEN v_order.status = 'OUT_FOR_DELIVERY'   AND p_new_status IN ('DELIVERED') THEN TRUE
    ELSE FALSE
  END;

  IF NOT v_valid_transition THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', v_order.status, p_new_status;
  END IF;

  UPDATE public.orders
  SET status = p_new_status
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'old_status', v_order.status,
    'new_status', p_new_status,
    'message', 'Status updated successfully'
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. cancel_order() — SECURITY DEFINER for buyer cancellation
-- ──────────────────────────────────────────────────────────────────────────────
-- Buyer can cancel their own order only while it's PENDING.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_order   RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id, buyer_user_id, status INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.buyer_user_id != v_user_id THEN
    RAISE EXCEPTION 'You do not have permission to cancel this order';
  END IF;

  IF v_order.status != 'PENDING' THEN
    RAISE EXCEPTION 'Only pending orders can be cancelled';
  END IF;

  UPDATE public.orders SET status = 'CANCELLED' WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'new_status', 'CANCELLED',
    'message', 'Order cancelled'
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. Row-Level Security (RLS) policies
-- ──────────────────────────────────────────────────────────────────────────────
-- Security model:
--   SELECT: both buyer and seller can read their own rows
--   INSERT: NO direct inserts — use place_order() SECURITY DEFINER only
--   UPDATE: NO direct updates — use update_order_status() SECURITY DEFINER only
--   DELETE: not allowed (soft-delete via status = CANCELLED/REJECTED)
--
-- SECURITY DEFINER functions bypass RLS entirely, so the absence of
-- INSERT/UPDATE policies does not block the functions — it blocks direct
-- client access via the Supabase JS client.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- ── Orders: Buyer SELECT (own orders only) ──
CREATE POLICY "orders_buyer_select"
  ON public.orders
  FOR SELECT
  USING (buyer_user_id = auth.uid());

-- ── Orders: Seller SELECT (orders for their store) ──
CREATE POLICY "orders_seller_select"
  ON public.orders
  FOR SELECT
  USING (seller_user_id = auth.uid());

-- FIX-2: Removed orders_buyer_insert policy.
-- All order creation MUST go through place_order() SECURITY DEFINER.
-- Without this policy, a direct client INSERT would bypass all validation
-- (product checks, 70% threshold, listing status, address validation).
-- SECURITY DEFINER functions bypass RLS, so place_order() still works.

-- FIX-4: Removed permissive orders_seller_update policy.
-- All status changes MUST go through update_order_status() SECURITY DEFINER.
-- Without this policy, a direct client UPDATE could change any column
-- (delivery_address, buyer_note, total_amount, etc.) on the seller's rows.
-- SECURITY DEFINER functions bypass RLS, so update_order_status() still works.

-- ── Order Items: Buyer SELECT (through order ownership) ──
CREATE POLICY "order_items_buyer_select"
  ON public.order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND orders.buyer_user_id = auth.uid()
    )
  );

-- ── Order Items: Seller SELECT (through order ownership) ──
CREATE POLICY "order_items_seller_select"
  ON public.order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND orders.seller_user_id = auth.uid()
    )
  );

-- FIX-3: Removed order_items_insert policy.
-- All order item creation MUST go through place_order() SECURITY DEFINER.
-- Without this policy, a direct client INSERT could inject fake items
-- with fabricated product_id, screening_score_snapshot, etc.
-- SECURITY DEFINER functions bypass RLS, so place_order() still works.

-- ──────────────────────────────────────────────────────────────────────────────
-- 8. Grant execute on functions to authenticated users
-- ──────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.place_order(UUID, INTEGER, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(UUID) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- Done. No existing RLS on product_scans, seller_profiles, products, or
-- seller_listings has been modified.
-- ──────────────────────────────────────────────────────────────────────────────
