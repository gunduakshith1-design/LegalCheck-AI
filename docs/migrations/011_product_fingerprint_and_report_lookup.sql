-- ============================================================================
-- MIGRATION 011: Product Fingerprint & Cross-User Report Lookup
-- ============================================================================
-- Adds a product_fingerprint column to compliance_reports so the system can
-- recognise when different users scan/report the same product.
-- Also creates a SECURITY DEFINER function that lets any authenticated user
-- look up existing reports for a product WITHOUT exposing private user data.
--
-- SAFETY:
--   - Additive only: new column + new index + new function
--   - No existing columns, data, or RLS policies are modified
--   - Uses IF NOT EXISTS / CREATE OR REPLACE for idempotency
--   - The RPC function returns only safe public fields
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Add product_fingerprint column
-- ──────────────────────────────────────────────────────────────────────────────
-- A normalised string built from the extracted fields of the scan that
-- produced this report.  Computed on the frontend and stored here so that
-- database-level lookups are fast and accurate.

ALTER TABLE public.compliance_reports
  ADD COLUMN IF NOT EXISTS product_fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_compliance_reports_fingerprint
  ON public.compliance_reports(product_fingerprint);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. get_product_reports() — Cross-user report lookup
-- ──────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: bypasses RLS so that any authenticated user can see
-- reports for a given product fingerprint.  Only safe, non-PII fields are
-- returned.  user_id and user_description are NEVER exposed.

CREATE OR REPLACE FUNCTION public.get_product_reports(p_fingerprint TEXT)
RETURNS TABLE (
  report_id     UUID,
  product_name  TEXT,
  screening_score NUMERIC,
  overall_status  TEXT,
  concern_summary TEXT,
  report_status   TEXT,
  created_at    TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    cr.id,
    cr.product_name_snapshot,
    cr.screening_score_snapshot,
    cr.overall_status_snapshot,
    cr.concern_summary,
    cr.status,
    cr.created_at
  FROM public.compliance_reports cr
  WHERE cr.product_fingerprint = p_fingerprint
  ORDER BY cr.created_at DESC;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Grant execute to authenticated users
-- ──────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_product_reports(TEXT) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- Done. No existing data, RLS policies, or functions are modified.
-- ============================================================================
