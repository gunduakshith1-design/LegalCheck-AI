-- ============================================================================
-- MIGRATION 009: Compliance Reports
-- ============================================================================
-- Allows users to prepare and track compliance concern reports.
-- Reports are associated with a scan and a user.
--
-- SAFETY:
--   - New table only; no existing tables modified
--   - RLS enforced: users can only see/create their own reports
--   - Uses IF NOT EXISTS for idempotency
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. compliance_reports table
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.compliance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES public.product_scans(id) ON DELETE CASCADE,
  product_name_snapshot TEXT NOT NULL,
  screening_score_snapshot NUMERIC,
  overall_status_snapshot TEXT,
  concern_summary TEXT,
  user_description TEXT,
  report_destination TEXT,        -- e.g. 'FSSAI Food Safety Connect'
  destination_type TEXT,          -- e.g. 'official_portal', 'email', 'manual'
  status TEXT NOT NULL DEFAULT 'DRAFT',  -- DRAFT | PREPARED | OPENED_OFFICIAL_PORTAL | EMAILED | CLOSED
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_compliance_reports_user_id
  ON public.compliance_reports(user_id);

CREATE INDEX IF NOT EXISTS idx_compliance_reports_scan_id
  ON public.compliance_reports(scan_id);

CREATE INDEX IF NOT EXISTS idx_compliance_reports_status
  ON public.compliance_reports(status);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. RLS policies
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.compliance_reports ENABLE ROW LEVEL SECURITY;

-- Users can view their own reports
CREATE POLICY IF NOT EXISTS compliance_reports_select_own
  ON public.compliance_reports
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own reports
CREATE POLICY IF NOT EXISTS compliance_reports_insert_own
  ON public.compliance_reports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own reports (e.g., marking status changes)
CREATE POLICY IF NOT EXISTS compliance_reports_update_own
  ON public.compliance_reports
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users cannot delete reports (preserve audit trail)
-- No DELETE policy = denied by default

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. updated_at trigger
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS compliance_reports_updated_at ON public.compliance_reports;

CREATE TRIGGER compliance_reports_updated_at
  BEFORE UPDATE ON public.compliance_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- Done. No existing data is affected.
-- ============================================================================
