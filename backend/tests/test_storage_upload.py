"""
Tests: Durable Supabase Storage upload in the persistence layer.

Covers:
1. Successful upload returns a durable Supabase Storage URL.
2. Object path/filename format is the legacy UUID-hex scheme (collision-free).
3. Storage upload failures raise StorageUploadError (never a dead URL).
4. The scan response contract (files[].url / file.url) stays compatible.

The local-disk fallback (Storage unconfigured) behavior is also covered,
matching the pre-existing test_security_hardening expectations.
"""

import re
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import services.upload_handler as upload_handler
from services.upload_handler import (
    StorageUploadError,
    response_url,
    save_upload,
)

FAKE_SUPABASE_URL = "https://sb-test-project.supabase.co"
FAKE_BUCKET = "product-images"


def _mock_storage_client(status_code=200):
    """Build an httpx.Client mock whose post() returns the given status."""
    client = MagicMock()
    response = MagicMock()
    response.status_code = status_code
    client.post.return_value = response
    context_manager = MagicMock()
    context_manager.__enter__.return_value = client
    return client, context_manager


def _storage_enabled():
    """Patch module config so Storage appears configured, plus the client."""
    def decorator(func):
        def wrapper(self, *args, **kwargs):
            client, context_manager = _mock_storage_client()
            with patch.object(upload_handler, "_storage_configured", return_value=True), \
                 patch.object(upload_handler, "SUPABASE_URL", FAKE_SUPABASE_URL), \
                 patch.object(upload_handler, "SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key"), \
                 patch.object(upload_handler, "SUPABASE_STORAGE_BUCKET", FAKE_BUCKET), \
                 patch.object(upload_handler.httpx, "Client", return_value=context_manager):
                return func(self, client, *args, **kwargs)
        return wrapper
    return decorator


class TestSuccessfulStorageUpload(unittest.TestCase):
    """1. Successful image upload returns a Supabase Storage URL."""

    @_storage_enabled()
    def test_url_is_durable_storage_url(self, client):
        result = save_upload(b"fake image bytes", "test.jpg")
        self.assertIn("url", result)
        self.assertTrue(result["url"].startswith(f"{FAKE_SUPABASE_URL}/storage/v1/object/public/{FAKE_BUCKET}/"))
        self.assertTrue(result["url"].endswith(".jpg"))

    @_storage_enabled()
    def test_response_url_prefers_storage_url(self, client):
        result = save_upload(b"fake image bytes", "test.jpg")
        self.assertEqual(response_url(result), result["url"])
        self.assertFalse(response_url(result).startswith("/uploads/"))

    @_storage_enabled()
    def test_content_type_matches_extension(self, client):
        save_upload(b"fake image bytes", "photo.jpg")
        headers = client.post.call_args.kwargs["headers"]
        self.assertEqual(headers["Content-Type"], "image/jpeg")

    @_storage_enabled()
    def test_png_content_type(self, client):
        save_upload(b"fake image bytes", "photo.png")
        headers = client.post.call_args.kwargs["headers"]
        self.assertEqual(headers["Content-Type"], "image/png")

    @_storage_enabled()
    def test_service_role_key_used_for_auth_not_logged(self, client):
        save_upload(b"fake image bytes", "test.jpg")
        headers = client.post.call_args.kwargs["headers"]
        self.assertEqual(headers["Authorization"], "Bearer test-service-role-key")
        self.assertEqual(headers["apikey"], "test-service-role-key")


class TestObjectPathFormat(unittest.TestCase):
    """2. Filename/object path keeps the legacy UUID-hex format."""

    @_storage_enabled()
    def test_object_path_is_uuid_hex_filename(self, client):
        result = save_upload(b"fake image bytes", "test.jpg")
        object_path = client.post.call_args.args[0]
        # Endpoint: .../storage/v1/object/<bucket>/<uuid-hex>.<ext>
        self.assertTrue(object_path.endswith(f"/{FAKE_BUCKET}/{result['filename']}"))
        self.assertRegex(result["filename"], re.compile(r"^[0-9a-f]{32}\.jpg$"))

    @_storage_enabled()
    def test_original_filename_not_used_in_object_path(self, client):
        result = save_upload(b"fake image bytes", "my product photo.jpg")
        object_path = client.post.call_args.args[0]
        self.assertNotIn("my product photo", object_path)
        self.assertEqual(result["original_filename"], "my product photo.jpg")

    @_storage_enabled()
    def test_filenames_are_collision_free(self, client):
        a = save_upload(b"same bytes", "test.jpg")
        b = save_upload(b"same bytes", "test.jpg")
        self.assertNotEqual(a["filename"], b["filename"])


class TestStorageFailure(unittest.TestCase):
    """3. Storage upload failure is handled cleanly — never a dead URL."""

    def _configured(self):
        return patch.object(upload_handler, "_storage_configured", return_value=True), \
               patch.object(upload_handler, "SUPABASE_URL", FAKE_SUPABASE_URL), \
               patch.object(upload_handler, "SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key"), \
               patch.object(upload_handler, "SUPABASE_STORAGE_BUCKET", FAKE_BUCKET)

    def test_http_error_raises_storage_upload_error(self):
        client, context_manager = _mock_storage_client(status_code=500)
        patches = self._configured()
        with patches[0], patches[1], patches[2], patches[3], \
             patch.object(upload_handler.httpx, "Client", return_value=context_manager):
            with self.assertRaises(StorageUploadError):
                save_upload(b"fake image bytes", "test.jpg")

    def test_network_exception_raises_storage_upload_error(self):
        client, context_manager = _mock_storage_client()
        client.post.side_effect = ConnectionError("connection refused")
        patches = self._configured()
        with patches[0], patches[1], patches[2], patches[3], \
             patch.object(upload_handler.httpx, "Client", return_value=context_manager):
            with self.assertRaises(StorageUploadError):
                save_upload(b"fake image bytes", "test.jpg")

    def test_no_silent_dead_url_on_failure(self):
        """On failure the exception propagates; no result dict with a bad URL."""
        client, context_manager = _mock_storage_client(status_code=403)
        patches = self._configured()
        with patches[0], patches[1], patches[2], patches[3], \
             patch.object(upload_handler.httpx, "Client", return_value=context_manager):
            with self.assertRaises(StorageUploadError):
                save_upload(b"fake image bytes", "test.jpg")


class TestUnconfiguredFallback(unittest.TestCase):
    """Local development: Storage unconfigured → legacy /uploads behavior."""

    def test_unconfigured_returns_no_url(self):
        with patch.object(upload_handler, "_storage_configured", return_value=False):
            result = save_upload(b"test image data", "test.png")
        self.assertNotIn("url", result)
        self.assertTrue(result["filename"].endswith(".png"))
        self.assertTrue((Path(result["path"])).exists())

    def test_response_url_falls_back_to_uploads_path(self):
        with patch.object(upload_handler, "_storage_configured", return_value=False):
            result = save_upload(b"test image data", "test.png")
        self.assertEqual(response_url(result), f"/uploads/{result['filename']}")


class TestScanResponseCompatibility(unittest.TestCase):
    """4. Existing scan response structure remains compatible."""

    def test_save_result_keeps_legacy_keys(self):
        with patch.object(upload_handler, "_storage_configured", return_value=False):
            result = save_upload(b"test image data", "test.png")
        for key in ("path", "filename", "original_filename", "size_bytes"):
            self.assertIn(key, result)

    def test_main_uses_response_url_for_file(self):
        source = (Path(__file__).resolve().parent.parent / "main.py").read_text()
        self.assertIn('"url": response_url(saved)', source)

    def test_main_uses_response_url_for_files(self):
        source = (Path(__file__).resolve().parent.parent / "main.py").read_text()
        self.assertIn('"url": response_url(sf)', source)
        self.assertNotIn('"url": f"/uploads/', source)

    def test_main_translates_storage_failure_to_http_error(self):
        source = (Path(__file__).resolve().parent.parent / "main.py").read_text()
        self.assertIn("StorageUploadError", source)
        self.assertIn("_save_upload_with_fallback", source)
        self.assertIn("STORAGE_UPLOAD_FAILED", source)


if __name__ == "__main__":
    unittest.main()
