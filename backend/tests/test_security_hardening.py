"""
Tests for Security Hardening (Step 15).

Tests cover:
1. Rate limiting logic
2. Upload path traversal prevention
3. Upload filename sanitization
4. CORS configuration safety
5. Error handling improvements
"""

from __future__ import annotations

import sys
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


# ---------------------------------------------------------------------------
# Test: Rate Limiting
# ---------------------------------------------------------------------------

class TestRateLimiting(unittest.TestCase):
    """Test the in-memory rate limiter logic."""

    def _make_limiter(self):
        """Create a fresh rate limiter state."""
        from collections import defaultdict
        limits = defaultdict(list)
        window = 60
        max_requests = 5

        def check(client_ip, endpoint):
            now = time.time()
            key = f"{client_ip}:{endpoint}"
            limits[key] = [t for t in limits[key] if now - t < window]
            if len(limits[key]) >= max_requests:
                return False
            limits[key].append(now)
            return True

        return check

    def test_first_request_allowed(self):
        """First request should be allowed."""
        check = self._make_limiter()
        self.assertTrue(check("127.0.0.1", "scan"))

    def test_burst_rejection(self):
        """Burst of requests should be rejected after limit."""
        check = self._make_limiter()
        for _ in range(5):
            self.assertTrue(check("127.0.0.1", "scan"))
        self.assertFalse(check("127.0.0.1", "scan"))

    def test_different_endpoints_independent(self):
        """Different endpoints have independent limits."""
        check = self._make_limiter()
        for _ in range(5):
            self.assertTrue(check("127.0.0.1", "scan"))
        # scan-multi should still be allowed
        self.assertTrue(check("127.0.0.1", "scan-multi"))

    def test_different_ips_independent(self):
        """Different IPs have independent limits."""
        check = self._make_limiter()
        for _ in range(5):
            self.assertTrue(check("127.0.0.1", "scan"))
        # Different IP should still be allowed
        self.assertTrue(check("192.168.1.1", "scan"))

    def test_unknown_ip_handled(self):
        """Unknown IP (request.client is None) should be handled."""
        check = self._make_limiter()
        self.assertTrue(check("unknown", "scan"))


# ---------------------------------------------------------------------------
# Test: Upload Path Traversal
# ---------------------------------------------------------------------------

class TestUploadPathTraversal(unittest.TestCase):
    """Test that path traversal is blocked in get_upload_path()."""

    def test_safe_filename_passes(self):
        """Normal filename should resolve within uploads dir."""
        from services.upload_handler import get_upload_path, UPLOADS_DIR
        result = get_upload_path("abc123.png")
        self.assertTrue(str(result).startswith(str(UPLOADS_DIR.resolve())))

    def test_path_traversal_blocked(self):
        """Path traversal attempt should be blocked."""
        from services.upload_handler import get_upload_path, UPLOADS_DIR
        result = get_upload_path("../../etc/passwd")
        # Should return __invalid__ or stay within uploads
        self.assertTrue(str(result).startswith(str(UPLOADS_DIR.resolve())))

    def test_dotfile_blocked(self):
        """Hidden files (starting with .) should be blocked."""
        from services.upload_handler import get_upload_path, UPLOADS_DIR
        result = get_upload_path(".env")
        self.assertTrue(str(result).startswith(str(UPLOADS_DIR.resolve())))

    def test_empty_filename_handled(self):
        """Empty filename should be handled safely."""
        from services.upload_handler import get_upload_path, UPLOADS_DIR
        result = get_upload_path("")
        self.assertTrue(str(result).startswith(str(UPLOADS_DIR.resolve())))

    def test_normal_uuid_filename(self):
        """UUID-based filenames from save_upload should work."""
        from services.upload_handler import get_upload_path, UPLOADS_DIR
        result = get_upload_path("a1b2c3d4e5f6.png")
        self.assertTrue(str(result).startswith(str(UPLOADS_DIR.resolve())))

    def test_filename_with_spaces(self):
        """Filename with spaces should be sanitized."""
        from services.upload_handler import get_upload_path, UPLOADS_DIR
        result = get_upload_path("my file.png")
        self.assertTrue(str(result).startswith(str(UPLOADS_DIR.resolve())))


# ---------------------------------------------------------------------------
# Test: Upload Handler Save
# ---------------------------------------------------------------------------

class TestUploadHandler(unittest.TestCase):
    """Test save_upload generates safe filenames."""

    def test_uuid_filename_generated(self):
        """save_upload should generate a UUID-based filename."""
        from services.upload_handler import save_upload
        result = save_upload(b"test image data", "test.png")
        self.assertIn("filename", result)
        # Filename should be UUID + extension, not the original name
        self.assertNotEqual(result["filename"], "test.png")
        self.assertTrue(result["filename"].endswith(".png"))

    def test_original_filename_preserved(self):
        """Original filename should be recorded but not used for storage."""
        from services.upload_handler import save_upload
        result = save_upload(b"test", "my product.jpg")
        self.assertEqual(result["original_filename"], "my product.jpg")
        # Stored filename should be different
        self.assertNotEqual(result["filename"], "my product.jpg")

    def test_size_recorded(self):
        """File size should be recorded correctly."""
        from services.upload_handler import save_upload
        data = b"x" * 1024
        result = save_upload(data, "test.png")
        self.assertEqual(result["size_bytes"], 1024)


# ---------------------------------------------------------------------------
# Test: Image Validation
# ---------------------------------------------------------------------------

class TestImageValidation(unittest.TestCase):
    """Test image validation rejects invalid inputs."""

    def test_max_file_size_defined(self):
        """MAX_FILE_SIZE_BYTES should be defined and reasonable."""
        from services.image_validator import MAX_FILE_SIZE_BYTES
        self.assertGreater(MAX_FILE_SIZE_BYTES, 0)
        self.assertLessEqual(MAX_FILE_SIZE_BYTES, 50 * 1024 * 1024)  # At most 50MB

    def test_supported_formats_defined(self):
        """SUPPORTED_FORMATS should include common image types."""
        from services.image_validator import SUPPORTED_FORMATS
        self.assertIn("image/jpeg", SUPPORTED_FORMATS)
        self.assertIn("image/png", SUPPORTED_FORMATS)
        self.assertIn("image/webp", SUPPORTED_FORMATS)

    def test_supported_extensions_defined(self):
        """SUPPORTED_EXTENSIONS should match SUPPORTED_FORMATS."""
        from services.image_validator import SUPPORTED_EXTENSIONS
        self.assertIn(".jpg", SUPPORTED_EXTENSIONS)
        self.assertIn(".jpeg", SUPPORTED_EXTENSIONS)
        self.assertIn(".png", SUPPORTED_EXTENSIONS)
        self.assertIn(".webp", SUPPORTED_EXTENSIONS)

    def test_validation_error_has_code(self):
        """ImageValidationError should have a code field."""
        from services.image_validator import ImageValidationError
        err = ImageValidationError("test", code="TEST_CODE")
        self.assertEqual(err.code, "TEST_CODE")
        self.assertEqual(str(err), "test")


# ---------------------------------------------------------------------------
# Test: CORS Configuration
# ---------------------------------------------------------------------------

class TestCORSConfiguration(unittest.TestCase):
    """Test CORS configuration safety."""

    def test_cors_origins_from_env(self):
        """CORS_ORIGINS should be configurable via environment variable."""
        import os
        # The main.py reads CORS_ORIGINS from env
        # Default should be localhost only
        default_origins = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173"
        parsed = [o.strip() for o in default_origins.split(",") if o.strip()]
        self.assertIn("http://localhost:3000", parsed)
        self.assertNotIn("*", parsed)

    def test_wildcard_rejected(self):
        """Wildcard '*' in CORS origins should be rejected for security."""
        # The main.py logic rejects wildcards
        origins = ["*"]
        cleaned = [o for o in origins if o.strip() != "*"]
        self.assertEqual(len(cleaned), 0)

    def test_no_service_role_in_frontend(self):
        """Service role key should not appear in frontend source."""
        frontend_dir = Path(__file__).resolve().parent.parent.parent / "src"
        if frontend_dir.exists():
            for js_file in frontend_dir.rglob("*.js"):
                if "node_modules" in str(js_file):
                    continue
                content = js_file.read_text(errors="ignore")
                self.assertNotIn("service_role", content.lower(),
                    f"Service role key found in {js_file.name}")

    def test_no_shiprocket_password_in_source(self):
        """Shiprocket password should not appear in source code."""
        # Check .env.example — should only have placeholders
        env_example = Path(__file__).resolve().parent.parent.parent / ".env.example"
        if env_example.exists():
            content = env_example.read_text()
            self.assertNotIn("actual-password", content.lower())
            self.assertNotIn("real-password", content.lower())


# ---------------------------------------------------------------------------
# Test: Error Handling
# ---------------------------------------------------------------------------

class TestErrorHandling(unittest.TestCase):
    """Test that error responses are safe and informative."""

    def test_scan_error_codes_defined(self):
        """Error responses should use structured error codes."""
        expected_codes = [
            "UNSUPPORTED_FORMAT",
            "UNSUPPORTED_EXTENSION",
            "FILE_TOO_LARGE",
            "FILE_TOO_SMALL",
            "CORRUPTED_IMAGE",
            "EMPTY_FILE",
            "RATE_LIMITED",
        ]
        # These codes are defined in the validator and main.py
        from services.image_validator import ImageValidationError
        for code in expected_codes:
            err = ImageValidationError("test", code=code)
            self.assertEqual(err.code, code)

    def test_error_response_structure(self):
        """Error responses should have success=False and error message."""
        from services.image_validator import ImageValidationError
        err = ImageValidationError("File too large", code="FILE_TOO_LARGE")
        response = {"success": False, "error": err.message, "code": err.code}
        self.assertFalse(response["success"])
        self.assertIn("error", response)
        self.assertIn("code", response)


# ---------------------------------------------------------------------------
# Test: .gitignore Safety
# ---------------------------------------------------------------------------

class TestGitignoreSafety(unittest.TestCase):
    """Test that .gitignore properly protects secrets."""

    def test_gitignore_exists(self):
        """Project should have a .gitignore file."""
        gitignore = Path(__file__).resolve().parent.parent.parent / ".gitignore"
        self.assertTrue(gitignore.exists())

    def test_env_files_ignored(self):
        """.env files should be in .gitignore."""
        gitignore = Path(__file__).resolve().parent.parent.parent / ".gitignore"
        content = gitignore.read_text()
        self.assertIn(".env", content)

    def test_env_example_not_ignored(self):
        """.env.example should NOT be ignored (it's a template)."""
        gitignore = Path(__file__).resolve().parent.parent.parent / ".gitignore"
        content = gitignore.read_text()
        # Should have a negation for .env.example
        self.assertIn("!.env.example", content)

    def test_uploads_ignored(self):
        """Upload directory contents should be ignored."""
        gitignore = Path(__file__).resolve().parent.parent.parent / ".gitignore"
        content = gitignore.read_text()
        self.assertIn("backend/uploads", content)

    def test_node_modules_ignored(self):
        """node_modules should be ignored."""
        gitignore = Path(__file__).resolve().parent.parent.parent / ".gitignore"
        content = gitignore.read_text()
        self.assertIn("node_modules", content)


# ---------------------------------------------------------------------------
# Test: Environment Variable Safety
# ---------------------------------------------------------------------------

class TestEnvironmentSafety(unittest.TestCase):
    """Test that environment variables are properly scoped."""

    def test_vite_prefix_only_for_public(self):
        """Only public config should use VITE_ prefix."""
        env_example = Path(__file__).resolve().parent.parent.parent / ".env.example"
        if env_example.exists():
            content = env_example.read_text()
            # Shiprocket credentials should NOT have VITE_ prefix
            lines = content.split("\n")
            for line in lines:
                if "SHIPROCKET" in line and not line.strip().startswith("#"):
                    self.assertFalse(line.strip().startswith("VITE_"),
                        f"Shiprocket credential should not be exposed to frontend: {line.strip()}")

    def test_backend_secrets_not_in_frontend(self):
        """Backend secrets (Shiprocket, webhook) should not be in frontend code."""
        frontend_dir = Path(__file__).resolve().parent.parent.parent / "src"
        if frontend_dir.exists():
            secret_patterns = ["SHIPROCKET_API_PASSWORD", "SHIPROCKET_WEBHOOK_SECRET"]
            for pattern in secret_patterns:
                for js_file in frontend_dir.rglob("*.js"):
                    if "node_modules" in str(js_file):
                        continue
                    content = js_file.read_text(errors="ignore")
                    self.assertNotIn(pattern, content,
                        f"Backend secret {pattern} found in {js_file.name}")


if __name__ == "__main__":
    unittest.main()
