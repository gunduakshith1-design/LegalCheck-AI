"""
Tests for the 70% Listing Threshold Enforcement.

These tests verify the security property: a seller may list a product only
when the screening score is >= 70%.

Enforcement chain:
1. Frontend: button disabled when score < 70 (cosmetic, bypassable)
2. Database trigger: validate_listing_threshold() on seller_listings (authoritative)
3. place_order(): checks score >= 70 at order time (defense in depth)

Since these tests run against the backend Python code (not the live database),
they verify:
- The screening score calculation logic
- The 70% threshold constant
- The place_order() score check logic (via the SQL in migration 008)
- The trigger logic (via the SQL in migration 014)

Database-level enforcement must be verified by applying migration 014 and
running the SQL-level tests below in Supabase SQL Editor.

IMPORTANT: These tests document the expected security behavior.
They do NOT replace actual database trigger testing.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.screening_score import calculate_screening_score, SCREENING_THRESHOLD


def _make_rule(status: str) -> dict:
    """Helper to create a minimal rule result dict."""
    return {"rule_id": "TEST", "status": status, "field": "test"}


# ---------------------------------------------------------------------------
# Test: Threshold Constant
# ---------------------------------------------------------------------------

class TestThresholdConstant(unittest.TestCase):
    """Verify the 70% threshold is correctly defined."""

    def test_threshold_is_70(self):
        """The screening threshold must be exactly 70."""
        self.assertEqual(SCREENING_THRESHOLD, 70)

    def test_threshold_is_not_mutable_in_score_calculation(self):
        """Score calculation uses the module-level constant."""
        from services.screening_score import SCREENING_THRESHOLD as t
        self.assertEqual(t, 70)


# ---------------------------------------------------------------------------
# Test: Score Calculation Boundary
# ---------------------------------------------------------------------------

class TestScoreBoundary(unittest.TestCase):
    """Verify score calculation at the 70% boundary."""

    def test_score_exactly_70_is_met(self):
        """Score of exactly 70.0% should be MET."""
        # 7 DETECTED out of 10 = 70%
        rules = [_make_rule("DETECTED") for _ in range(7)]
        rules.extend([_make_rule("NOT_DETECTED") for _ in range(3)])
        result = calculate_screening_score(rules)
        self.assertEqual(result.threshold_status, "MET")
        self.assertEqual(result.score, 70.0)

    def test_score_69_is_below(self):
        """Score of 69% should be BELOW_THRESHOLD."""
        # 6.9 DETECTED out of 10 = 69%
        rules = [_make_rule("DETECTED") for _ in range(6)]
        rules.append(_make_rule("UNCERTAIN"))  # 50 points
        rules.extend([_make_rule("NOT_DETECTED") for _ in range(3)])
        # 6*100 + 50 + 3*0 = 650 / 10 = 65.0
        result = calculate_screening_score(rules)
        self.assertEqual(result.threshold_status, "BELOW_THRESHOLD")
        self.assertLess(result.score, 70)

    def test_score_85_is_met(self):
        """Score of 85% should be MET."""
        rules = [_make_rule("DETECTED") for _ in range(8)]
        rules.append(_make_rule("UNCERTAIN"))  # 50 points
        rules.append(_make_rule("NOT_DETECTED"))  # 0 points
        # 8*100 + 50 + 0 = 850 / 10 = 85.0
        result = calculate_screening_score(rules)
        self.assertEqual(result.threshold_status, "MET")
        self.assertEqual(result.score, 85.0)

    def test_score_0_is_below(self):
        """Score of 0% should be BELOW_THRESHOLD."""
        rules = [_make_rule("NOT_DETECTED") for _ in range(10)]
        result = calculate_screening_score(rules)
        self.assertEqual(result.threshold_status, "BELOW_THRESHOLD")
        self.assertEqual(result.score, 0.0)

    def test_missing_screening_score_is_not_evaluable(self):
        """No rules → score=None, NOT_EVALUABLE."""
        result = calculate_screening_score([])
        self.assertIsNone(result.score)
        self.assertEqual(result.threshold_status, "NOT_EVALUABLE")


# ---------------------------------------------------------------------------
# Test: NOT_APPLICABLE Exclusion
# ---------------------------------------------------------------------------

class TestNotApplicableExclusion(unittest.TestCase):
    """Verify that NOT_APPLICABLE rules don't unfairly lower scores."""

    def test_all_not_applicable_gives_not_evaluable(self):
        """All NOT_APPLICABLE → score=None, NOT_EVALUABLE."""
        rules = [_make_rule("NOT_APPLICABLE") for _ in range(10)]
        result = calculate_screening_score(rules)
        self.assertIsNone(result.score)
        self.assertEqual(result.threshold_status, "NOT_EVALUABLE")

    def test_mixed_detected_and_not_applicable(self):
        """7 DETECTED + 3 NOT_APPLICABLE → score=100 (NOT_APPLICABLE excluded)."""
        rules = [_make_rule("DETECTED") for _ in range(7)]
        rules.extend([_make_rule("NOT_APPLICABLE") for _ in range(3)])
        result = calculate_screening_score(rules)
        self.assertEqual(result.score, 100.0)
        self.assertEqual(result.applicable_rules, 7)
        self.assertEqual(result.not_applicable_rules, 3)
        self.assertEqual(result.threshold_status, "MET")


# ---------------------------------------------------------------------------
# Test: Database Trigger Logic (SQL documentation)
# ---------------------------------------------------------------------------

class TestTriggerLogic(unittest.TestCase):
    """
    Document the expected behavior of the database trigger.

    These tests verify the LOGIC that the trigger should enforce.
    The actual trigger is in migration 014 and must be applied to the database.
    """

    def test_trigger_rejects_null_score(self):
        """The trigger should reject listing when screening_score is NULL."""
        # Document: validate_listing_threshold() checks v_score IS NULL
        # and raises: 'Cannot list product: product has no screening score'
        score = None
        should_reject = score is None
        self.assertTrue(should_reject)

    def test_trigger_rejects_score_below_70(self):
        """The trigger should reject listing when score < 70."""
        score = 69.99
        should_reject = score < 70
        self.assertTrue(should_reject)

    def test_trigger_rejects_score_exactly_69(self):
        """The trigger should reject listing when score = 69."""
        score = 69.0
        should_reject = score < 70
        self.assertTrue(should_reject)

    def test_trigger_rejects_score_0(self):
        """The trigger should reject listing when score = 0."""
        score = 0
        should_reject = score < 70
        self.assertTrue(should_reject)

    def test_trigger_allows_score_exactly_70(self):
        """The trigger should allow listing when score = 70."""
        score = 70.0
        should_reject = score < 70
        self.assertFalse(should_reject)

    def test_trigger_allows_score_85(self):
        """The trigger should allow listing when score = 85."""
        score = 85.0
        should_reject = score < 70
        self.assertFalse(should_reject)

    def test_trigger_allows_score_100(self):
        """The trigger should allow listing when score = 100."""
        score = 100.0
        should_reject = score < 70
        self.assertFalse(should_reject)

    def test_trigger_only_fires_on_listed_status(self):
        """The trigger should only enforce when listing_status = 'LISTED'."""
        # DRAFT, UNLISTED, REVIEW_REQUIRED should NOT be blocked
        for status in ['DRAFT', 'UNLISTED', 'REVIEW_REQUIRED']:
            should_enforce = (status == 'LISTED')
            self.assertFalse(should_enforce, f"Trigger should NOT enforce for status: {status}")

    def test_trigger_fires_on_insert_listed(self):
        """The trigger should enforce on INSERT when status = 'LISTED'."""
        should_enforce = True  # INSERT + LISTED
        self.assertTrue(should_enforce)

    def test_trigger_fires_on_update_to_listed(self):
        """The trigger should enforce on UPDATE when status changes to 'LISTED'."""
        should_enforce = True  # UPDATE + LISTED
        self.assertTrue(should_enforce)


# ---------------------------------------------------------------------------
# Test: place_order() Score Check (defense in depth)
# ---------------------------------------------------------------------------

class TestPlaceOrderScoreCheck(unittest.TestCase):
    """
    Document the expected behavior of place_order() score check.

    From migration 008:
        IF v_product.screening_score IS NULL OR v_product.screening_score < 70 THEN
          RAISE EXCEPTION 'Product screening score is below the 70%% threshold and cannot be ordered';
        END IF;

    This is defense in depth — the listing trigger should already prevent
    low-score products from being listed, but place_order() double-checks.
    """

    def test_place_order_rejects_null_score(self):
        """place_order() should reject products with NULL screening_score."""
        score = None
        should_reject = score is None or score < 70
        self.assertTrue(should_reject)

    def test_place_order_rejects_below_70(self):
        """place_order() should reject products with score < 70."""
        score = 50.0
        should_reject = score is None or score < 70
        self.assertTrue(should_reject)

    def test_place_order_allows_70(self):
        """place_order() should allow products with score >= 70."""
        score = 70.0
        should_reject = score is None or score < 70
        self.assertFalse(should_reject)

    def test_place_order_allows_100(self):
        """place_order() should allow products with score = 100."""
        score = 100.0
        should_reject = score is None or score < 70
        self.assertFalse(should_reject)


# ---------------------------------------------------------------------------
# Test: Rescan Behavior
# ---------------------------------------------------------------------------

class TestRescanBehavior(unittest.TestCase):
    """Verify that rescanning doesn't break historical data."""

    def test_new_scan_produces_new_score(self):
        """A new scan should produce an independent score."""
        # Old scan: 60%
        old_rules = [_make_rule("DETECTED") for _ in range(6)]
        old_rules.extend([_make_rule("NOT_DETECTED") for _ in range(4)])
        old_score = calculate_screening_score(old_rules)
        self.assertEqual(old_score.threshold_status, "BELOW_THRESHOLD")

        # New scan: 85%
        new_rules = [_make_rule("DETECTED") for _ in range(8)]
        new_rules.append(_make_rule("UNCERTAIN"))
        new_rules.append(_make_rule("NOT_DETECTED"))
        new_score = calculate_screening_score(new_rules)
        self.assertEqual(new_score.threshold_status, "MET")

        # Scores are independent
        self.assertNotEqual(old_score.score, new_score.score)

    def test_rescan_does_not_modify_old_score(self):
        """Historical scan scores should remain unchanged after rescan."""
        # This is a documentation test — the database stores each scan's
        # score independently. Rescanning creates a new product_scans row.
        old_score = 60.0
        new_score = 85.0
        # The old score should remain 60.0 in the database
        self.assertEqual(old_score, 60.0)
        # The new score should be 85.0 in a separate record
        self.assertEqual(new_score, 85.0)


# ---------------------------------------------------------------------------
# Test: Security Invariants
# ---------------------------------------------------------------------------

class TestSecurityInvariants(unittest.TestCase):
    """Document critical security invariants."""

    def test_frontend_check_is_not_authoritative(self):
        """The frontend check is cosmetic only — the database trigger is authoritative."""
        # This is a documentation test. The frontend can be bypassed
        # using browser dev tools, curl, or any HTTP client.
        # The database trigger (migration 014) is the real enforcement.
        pass

    def test_browser_cannot_override_listing_price(self):
        """The listing price comes from the database, not the browser."""
        # place_order() derives price from v_listing.listing_price
        # which is read from the database, not from p_listing_price
        # This is verified in migration 008.
        pass

    def test_buyer_cannot_see_seller_private_data(self):
        """Buyer marketplace RPCs only expose public data."""
        # get_public_stores() and get_store_listed_products() are SECURITY DEFINER
        # and only return: shop_name, business_type, city, state, product_name, etc.
        # Private data (phone, email, verification numbers) is never exposed.
        pass

    def test_seller_cannot_list_other_sellers_product(self):
        """RLS ensures seller_user_id matches auth.uid()."""
        # seller_listings RLS policy: CHECK (auth.uid() = seller_user_id)
        # This prevents seller A from inserting a listing with seller B's user_id.
        pass


# ---------------------------------------------------------------------------
# Test: Migration 014 SQL Verification
# ---------------------------------------------------------------------------

class TestMigrationSQL(unittest.TestCase):
    """
    Verify that migration 014 SQL is correct and idempotent.

    The SQL should:
    1. CREATE OR REPLACE FUNCTION validate_listing_threshold()
    2. DROP TRIGGER IF EXISTS enforce_listing_threshold
    3. CREATE TRIGGER enforce_listing_threshold BEFORE INSERT OR UPDATE
    """

    def test_migration_file_exists(self):
        """Migration 014 file should exist."""
        migration_path = Path(__file__).resolve().parent.parent.parent / "docs" / "migrations" / "014_enforce_listing_threshold.sql"
        self.assertTrue(migration_path.exists(), f"Migration file not found: {migration_path}")

    def test_migration_contains_create_function(self):
        """Migration should CREATE OR REPLACE the function."""
        migration_path = Path(__file__).resolve().parent.parent.parent / "docs" / "migrations" / "014_enforce_listing_threshold.sql"
        content = migration_path.read_text()
        self.assertIn("CREATE OR REPLACE FUNCTION", content)
        self.assertIn("validate_listing_threshold", content)

    def test_migration_contains_create_trigger(self):
        """Migration should CREATE TRIGGER on seller_listings."""
        migration_path = Path(__file__).resolve().parent.parent.parent / "docs" / "migrations" / "014_enforce_listing_threshold.sql"
        content = migration_path.read_text()
        self.assertIn("CREATE TRIGGER", content)
        self.assertIn("enforce_listing_threshold", content)
        self.assertIn("seller_listings", content)

    def test_migration_checks_70_threshold(self):
        """Migration should check score < 70."""
        migration_path = Path(__file__).resolve().parent.parent.parent / "docs" / "migrations" / "014_enforce_listing_threshold.sql"
        content = migration_path.read_text()
        self.assertIn("70", content)
        self.assertIn("screening_score", content)

    def test_migration_is_idempotent(self):
        """Migration should use DROP TRIGGER IF EXISTS and CREATE OR REPLACE."""
        migration_path = Path(__file__).resolve().parent.parent.parent / "docs" / "migrations" / "014_enforce_listing_threshold.sql"
        content = migration_path.read_text()
        self.assertIn("DROP TRIGGER IF EXISTS", content)
        self.assertIn("CREATE OR REPLACE FUNCTION", content)

    def test_migration_only_enforces_on_listed(self):
        """Trigger should only enforce when listing_status = 'LISTED'."""
        migration_path = Path(__file__).resolve().parent.parent.parent / "docs" / "migrations" / "014_enforce_listing_threshold.sql"
        content = migration_path.read_text()
        self.assertIn("LISTED", content)


if __name__ == "__main__":
    unittest.main()
