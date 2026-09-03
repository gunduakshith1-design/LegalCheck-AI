-- ============================================================================
-- MIGRATION 006: Shiprocket Delivery Fields
-- ============================================================================
-- Adds columns required for real Shiprocket integration.
-- These columns are NULLABLE — demo deliveries don't need them.
--
-- IMPORTANT: Review this migration before executing.
-- Run in the Supabase SQL Editor or via `supabase db push`.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Add Shiprocket-specific columns to deliveries table
-- ──────────────────────────────────────────────────────────────────────────────

-- provider_order_id: Shiprocket's internal order ID
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS provider_order_id TEXT NULL;

-- provider_shipment_id: Shiprocket's shipment ID (needed for AWB assignment)
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS provider_shipment_id TEXT NULL;

-- package dimensions (required by Shiprocket for real deliveries)
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS length_cm NUMERIC NULL;

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS breadth_cm NUMERIC NULL;

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC NULL;

-- pickup_location: Shiprocket pickup location name
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS pickup_location TEXT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Indexes for new columns
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_deliveries_provider_order
  ON public.deliveries(provider_order_id);

CREATE INDEX IF NOT EXISTS idx_deliveries_provider_shipment
  ON public.deliveries(provider_shipment_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Done. Existing RLS policies, functions, and triggers are NOT modified.
-- The new columns are NULLABLE, so existing demo deliveries are unaffected.
-- ============================================================================
