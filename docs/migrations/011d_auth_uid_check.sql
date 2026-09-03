-- Fix: Use auth.uid() IS NOT NULL instead of auth.role()
-- SECURITY DEFINER functions run as owner, so auth.role() may not
-- reflect the caller. auth.uid() reads from the JWT and reliably
-- returns NULL for anonymous (unauthenticated) callers.

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
    AND auth.uid() IS NOT NULL
  ORDER BY cr.created_at DESC;
$$;
