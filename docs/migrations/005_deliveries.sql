-- ============================================================================
-- MIGRATION 005: Deliveries
-- ============================================================================
-- Creates the delivery tracking table for LegalCheck AI.
-- Each delivery belongs to exactly one order (1:1 relationship).
--
-- SECURITY MODEL:
--   - Credentials never leave the backend (no VITE_* env vars)
--   - Delivery operations go through SECURITY DEFINER functions
--   - Buyer/Seller can only read their own deliveries (via order ownership)
--   - No direct INSERT/UPDATE/DELETE from clients
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. deliveries table
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deliveries (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  provider                TEXT NOT NULL DEFAULT 'demo',
  provider_delivery_id    TEXT NULL,          -- external ID from provider (e.g., DEMO-DELIVERY-XXXX)
  status                  TEXT NOT NULL DEFAULT 'CREATED'
                            CHECK (status IN (
                              'QUOTE_AVAILABLE','CREATED','ASSIGNED',
                              'PICKED_UP','OUT_FOR_DELIVERY','DELIVERED',
                              'CANCELLED','FAILED'
                            )),
  pickup_address          JSONB NOT NULL,     -- seller pickup address snapshot
  drop_address            JSONB NOT NULL,     -- buyer delivery address snapshot
  delivery_fee            NUMERIC NULL,       -- quoted delivery fee
  eta_minutes             INTEGER NULL,       -- estimated time in minutes
  tracking_url            TEXT NULL,          -- tracking URL if provided by provider
  courier_name            TEXT NULL,          -- courier company name
  awb_code                TEXT NULL,          -- airway bill number if applicable
  provider_payload        JSONB NULL,         -- raw provider response for debugging
  weight_kg               NUMERIC NULL,       -- package weight used for quote
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deliveries_order ON public.deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_provider ON public.deliveries(provider);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. updated_at trigger
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_deliveries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_deliveries_updated ON public.deliveries;
CREATE TRIGGER on_deliveries_updated
  BEFORE UPDATE ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_deliveries_updated_at();

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. create_delivery() — SECURITY DEFINER for creating a delivery
-- ──────────────────────────────────────────────────────────────────────────────
-- Only the seller who owns the order can create a delivery.
-- Validates: order exists, is READY_FOR_PICKUP, no existing delivery.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_delivery(
  p_order_id        UUID,
  p_provider        TEXT DEFAULT 'demo',
  p_provider_delivery_id TEXT DEFAULT NULL,
  p_status          TEXT DEFAULT 'CREATED',
  p_pickup_address  JSONB DEFAULT '{}'::JSONB,
  p_drop_address    JSONB DEFAULT '{}'::JSONB,
  p_delivery_fee    NUMERIC DEFAULT NULL,
  p_eta_minutes     INTEGER DEFAULT NULL,
  p_tracking_url    TEXT DEFAULT NULL,
  p_courier_name    TEXT DEFAULT NULL,
  p_awb_code        TEXT DEFAULT NULL,
  p_provider_payload JSONB DEFAULT NULL,
  p_weight_kg       NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID;
  v_order        RECORD;
  v_delivery_id  UUID;
BEGIN
  -- Authenticate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Fetch order
  SELECT id, seller_user_id, status INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Only the seller can create delivery for their order
  IF v_order.seller_user_id != v_user_id THEN
    RAISE EXCEPTION 'You do not have permission to create delivery for this order';
  END IF;

  -- Order must be READY_FOR_PICKUP
  IF v_order.status != 'READY_FOR_PICKUP' THEN
    RAISE EXCEPTION 'Delivery can only be created for orders in READY_FOR_PICKUP status. Current status: %', v_order.status;
  END IF;

  -- No duplicate deliveries
  IF EXISTS (SELECT 1 FROM public.deliveries WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'A delivery already exists for this order';
  END IF;

  -- Create delivery
  INSERT INTO public.deliveries (
    order_id, provider, provider_delivery_id, status,
    pickup_address, drop_address, delivery_fee, eta_minutes,
    tracking_url, courier_name, awb_code, provider_payload, weight_kg
  ) VALUES (
    p_order_id, p_provider, p_provider_delivery_id, p_status,
    p_pickup_address, p_drop_address, p_delivery_fee, p_eta_minutes,
    p_tracking_url, p_courier_name, p_awb_code, p_provider_payload, p_weight_kg
  )
  RETURNING id INTO v_delivery_id;

  RETURN jsonb_build_object(
    'delivery_id', v_delivery_id,
    'order_id', p_order_id,
    'provider', p_provider,
    'status', p_status,
    'message', 'Delivery created successfully'
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. update_delivery_status() — SECURITY DEFINER for status updates
-- ──────────────────────────────────────────────────────────────────────────────
-- Updates delivery status and syncs order status when appropriate.
-- Can be called by: seller (for demo), webhook (for real providers).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_delivery_status(
  p_delivery_id    UUID,
  p_new_status     TEXT,
  p_tracking_url   TEXT DEFAULT NULL,
  p_courier_name   TEXT DEFAULT NULL,
  p_awb_code       TEXT DEFAULT NULL,
  p_provider_payload JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID;
  v_delivery    RECORD;
  v_order_id    UUID;
  v_new_order_status TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Fetch delivery with order info
  SELECT d.id, d.order_id, d.status, d.provider, o.seller_user_id
  INTO v_delivery
  FROM public.deliveries d
  JOIN public.orders o ON o.id = d.order_id
  WHERE d.id = p_delivery_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found';
  END IF;

  -- Only the seller or webhook can update
  -- (webhook runs as SECURITY DEFINER owner, so auth.uid() may differ)
  -- For now, only validate seller ownership
  IF v_delivery.seller_user_id != v_user_id THEN
    RAISE EXCEPTION 'You do not have permission to update this delivery';
  END IF;

  -- Update delivery
  UPDATE public.deliveries
  SET status = p_new_status,
      tracking_url = COALESCE(p_tracking_url, tracking_url),
      courier_name = COALESCE(p_courier_name, courier_name),
      awb_code = COALESCE(p_awb_code, awb_code),
      provider_payload = COALESCE(p_provider_payload, provider_payload)
  WHERE id = p_delivery_id;

  -- Sync order status based on delivery status
  v_new_order_status := CASE p_new_status
    WHEN 'OUT_FOR_DELIVERY' THEN 'OUT_FOR_DELIVERY'
    WHEN 'DELIVERED' THEN 'DELIVERED'
    WHEN 'CANCELLED' THEN NULL  -- don't auto-cancel order
    WHEN 'FAILED' THEN NULL     -- don't auto-fail order
    ELSE NULL
  END;

  IF v_new_order_status IS NOT NULL THEN
    UPDATE public.orders
    SET status = v_new_order_status
    WHERE id = v_delivery.order_id;
  END IF;

  RETURN jsonb_build_object(
    'delivery_id', p_delivery_id,
    'old_status', v_delivery.status,
    'new_status', p_new_status,
    'order_status_updated', v_new_order_status IS NOT NULL,
    'message', 'Delivery status updated'
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. RLS policies
-- ──────────────────────────────────────────────────────────────────────────────
-- Buyer/Seller can read deliveries through order ownership.
-- No INSERT/UPDATE/DELETE from clients — only SECURITY DEFINER functions.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- Buyer SELECT (through order ownership)
CREATE POLICY "deliveries_buyer_select"
  ON public.deliveries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = deliveries.order_id
        AND orders.buyer_user_id = auth.uid()
    )
  );

-- Seller SELECT (through order ownership)
CREATE POLICY "deliveries_seller_select"
  ON public.deliveries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = deliveries.order_id
        AND orders.seller_user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies — only SECURITY DEFINER functions.
-- This prevents clients from creating/modifying deliveries directly.

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. Grant execute on functions
-- ──────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.create_delivery(UUID, TEXT, TEXT, TEXT, JSONB, JSONB, NUMERIC, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_delivery_status(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- Done. Existing RLS on orders, order_items, products, seller_listings,
-- seller_profiles, and product_scans is NOT modified.
-- ──────────────────────────────────────────────────────────────────────────────
