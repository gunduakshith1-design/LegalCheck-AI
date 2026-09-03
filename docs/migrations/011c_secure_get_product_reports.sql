-- Fix: Add auth check inside get_product_reports function body
-- SECURITY DEFINER runs as owner, so GRANT/REVOKE may not fully block
-- in Supabase's default grant setup. Checking auth.role() inside the
-- function is the robust approach.

CREATE OR REPLACE FUNCTION public.get_product_reports(p_fingerprint TEXT)
RETURNS TABLE (
  report_id       UUID,
  product_name    TEXT,
  screening_score NUMERIC,
  overall_status  TEXT,
  concern_summary TEXT,
  report_status   TEXT,
  created_at      TIMESTAMPTZ
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
    AND (SELECT auth.role()) = 'authenticated'
  ORDER BY cr.created_at DESC;
$$;
