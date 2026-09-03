-- Fix: Revoke anonymous access to get_product_reports
-- Supabase defaults grant EXECUTE to both 'anon' and 'authenticated'.
-- The GRANT to 'authenticated' in migration 011 doesn't revoke 'anon'.
-- Only logged-in users should be able to look up cross-user reports.

REVOKE EXECUTE ON FUNCTION public.get_product_reports(TEXT) FROM anon;
