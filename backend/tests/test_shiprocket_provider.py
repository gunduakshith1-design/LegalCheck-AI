"""
Tests for Shiprocket delivery provider.

These tests verify:
1. Authentication with token caching
2. 401 re-authentication
3. Serviceability response parsing
4. Quote normalization
5. Missing parcel data handling
6. Real-provider configuration validation
7. Invalid credentials handling
8. Provider timeout
9. Status mapping
10. Webhook validation
11. Demo provider still works
12. Existing backend tests continue passing

All HTTP calls are mocked — no live Shiprocket API calls are made.
"""

import os
import time
import pytest
from unittest.mock import patch, MagicMock, PropertyMock

from services.delivery.models import (
    Address,
    DeliveryQuote,
    DeliveryResult,
    DeliveryStatus,
    DELIVERY_STATUS_CREATED,
    DELIVERY_STATUS_ASSIGNED,
    DELIVERY_STATUS_PICKED_UP,
    DELIVERY_STATUS_OUT_FOR_DELIVERY,
    DELIVERY_STATUS_DELIVERED,
    DELIVERY_STATUS_CANCELLED,
)
from services.delivery.provider import DeliveryProvider, DeliveryProviderError
from services.delivery.shiprocket_provider import (
    ShiprocketDeliveryProvider,
    SHIPROCKET_STATUS_MAP,
)


# ──────────────────────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def provider():
    """Create a ShiprocketDeliveryProvider with mocked credentials."""
    os.environ["SHIPROCKET_API_EMAIL"] = "test@example.com"
    os.environ["SHIPROCKET_API_PASSWORD"] = "test-password"
    os.environ["SHIPROCKET_PICKUP_LOCATION"] = "Primary"
    return ShiprocketDeliveryProvider()


@pytest.fixture
def pickup_address():
    return Address.from_dict({
        "full_name": "Test Seller",
        "phone": "9876543210",
        "address_line": "123 Test Street",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pin_code": "400001",
    })


@pytest.fixture
def drop_address():
    return Address.from_dict({
        "full_name": "Test Buyer",
        "phone": "9876543211",
        "address_line": "456 Buyer Lane",
        "city": "Pune",
        "state": "Maharashtra",
        "pin_code": "411001",
    })


# ──────────────────────────────────────────────────────────────────────────────
# 1. Authentication tests
# ──────────────────────────────────────────────────────────────────────────────

class TestAuthentication:
    def test_authenticate_success(self, provider):
        """Successful authentication returns and caches token."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"token": "test-jwt-token-123"}
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider._client, "post", return_value=mock_response):
            token = provider._authenticate()
            assert token == "test-jwt-token-123"
            assert provider._token == "test-jwt-token-123"

    def test_authenticate_caches_token(self, provider):
        """Token is cached and reused on subsequent calls."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"token": "cached-token"}
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider._client, "post", return_value=mock_response) as mock_post:
            provider._authenticate()
            provider._authenticate()  # Second call should use cache
            assert mock_post.call_count == 1  # Only one HTTP call

    def test_authenticate_force_refresh(self, provider):
        """force=True re-authenticates even if token is cached."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"token": "new-token"}
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider._client, "post", return_value=mock_response) as mock_post:
            provider._authenticate()
            provider._authenticate(force=True)  # Force re-auth
            assert mock_post.call_count == 2

    def test_authenticate_failure_raises_error(self, provider):
        """Authentication failure raises DeliveryProviderError."""
        import httpx as _httpx
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = _httpx.HTTPStatusError(
            "401", request=MagicMock(), response=mock_response
        )

        with patch.object(provider._client, "post", return_value=mock_response):
            with pytest.raises(DeliveryProviderError) as exc_info:
                provider._authenticate()
            assert "401" in str(exc_info.value) or "authentication" in str(exc_info.value).lower()

    def test_authenticate_missing_credentials_raises_error(self):
        """Missing credentials raises DeliveryProviderError."""
        saved_email = os.environ.pop("SHIPROCKET_API_EMAIL", None)
        saved_pass = os.environ.pop("SHIPROCKET_API_PASSWORD", None)
        try:
            p = ShiprocketDeliveryProvider()
            p._token = None
            with pytest.raises(DeliveryProviderError) as exc_info:
                p._authenticate()
            assert "credentials" in str(exc_info.value).lower()
        finally:
            if saved_email is not None:
                os.environ["SHIPROCKET_API_EMAIL"] = saved_email
            if saved_pass is not None:
                os.environ["SHIPROCKET_API_PASSWORD"] = saved_pass

    def test_authenticate_timeout_raises_error(self, provider):
        """Timeout during authentication raises DeliveryProviderError."""
        import httpx
        with patch.object(provider._client, "post", side_effect=httpx.TimeoutException("timeout")):
            with pytest.raises(DeliveryProviderError) as exc_info:
                provider._authenticate()
            assert "timed out" in str(exc_info.value).lower()


# ──────────────────────────────────────────────────────────────────────────────
# 2. Request with 401 re-authentication
# ──────────────────────────────────────────────────────────────────────────────

class TestRequestReauth:
    def test_request_reauthenticates_on_401(self, provider):
        """Request automatically re-authenticates on 401."""
        import httpx

        # First call returns 401, second returns success
        response_401 = MagicMock()
        response_401.status_code = 401
        response_401.raise_for_status.side_effect = httpx.HTTPStatusError(
            "401", request=MagicMock(), response=response_401
        )

        response_ok = MagicMock()
        response_ok.status_code = 200
        response_ok.json.return_value = {"status": 1}
        response_ok.raise_for_status = MagicMock()

        with patch.object(provider._client, "request", side_effect=[response_401, response_ok]):
            with patch.object(provider, "_authenticate") as mock_auth:
                result = provider._request("GET", "/test")
                assert mock_auth.call_count >= 2  # Initial + re-auth


# ──────────────────────────────────────────────────────────────────────────────
# 3. Serviceability / Quote tests
# ──────────────────────────────────────────────────────────────────────────────

class TestServiceability:
    def test_get_quote_success(self, provider, pickup_address, drop_address):
        """Successful quote returns normalized data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": {
                "available_courier_companies": [
                    {
                        "courier_company_id": 123,
                        "courier_name": "Test Courier",
                        "rate": 45.0,
                        "estimated_delivery_days": 3,
                    }
                ]
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_request", return_value=mock_response):
            quote = provider.get_quote(pickup_address, drop_address, 1.0)
            assert quote.serviceable is True
            assert quote.delivery_fee == 45.0
            assert quote.eta_minutes == 3 * 24 * 60  # 3 days in minutes
            assert "Test Courier" in quote.estimated_delivery_text

    def test_get_quote_not_serviceable(self, provider, pickup_address, drop_address):
        """No available couriers returns not serviceable."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": {"available_courier_companies": []}
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_request", return_value=mock_response):
            quote = provider.get_quote(pickup_address, drop_address, 1.0)
            assert quote.serviceable is False

    def test_get_quote_defaults_weight(self, provider, pickup_address, drop_address):
        """Zero weight defaults to 1.0 kg."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": {"available_courier_companies": []}
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_request", return_value=mock_response) as mock_req:
            provider.get_quote(pickup_address, drop_address, 0)
            call_args = mock_req.call_args
            assert call_args[1]["params"]["weight"] == 1.0


# ──────────────────────────────────────────────────────────────────────────────
# 4. Order Creation tests
# ──────────────────────────────────────────────────────────────────────────────

class TestOrderCreation:
    def test_create_delivery_success(self, provider, pickup_address, drop_address):
        """Successful order creation returns delivery result."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "order_id": 123456,
            "shipment_id": 789012,
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_request", return_value=mock_response):
            result = provider.create_delivery(
                pickup_address, drop_address, 1.0, "ORDER-TEST-001",
                length_cm=20, breadth_cm=15, height_cm=10,
            )
            assert result.provider == "shiprocket"
            assert result.provider_delivery_id == "123456"
            assert result.status == DELIVERY_STATUS_CREATED

    def test_create_delivery_includes_dimensions(self, provider, pickup_address, drop_address):
        """Order creation includes package dimensions."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"order_id": 123, "shipment_id": 456}
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_request", return_value=mock_response) as mock_req:
            provider.create_delivery(
                pickup_address, drop_address, 2.0, "ORDER-TEST-002",
                length_cm=30, breadth_cm=20, height_cm=10,
            )
            call_args = mock_req.call_args
            json_data = call_args[1]["json"]
            assert json_data["weight"] == 2.0
            assert json_data["length"] == 30
            assert json_data["breadth"] == 20
            assert json_data["height"] == 10

    def test_create_delivery_requires_dimensions(self, provider, pickup_address, drop_address):
        """Order creation requires all dimensions."""
        with pytest.raises(DeliveryProviderError):
            provider.create_delivery(
                pickup_address, drop_address, 1.0, "ORDER-TEST-003"
            )

    def test_create_delivery_failure_raises_error(self, provider, pickup_address, drop_address):
        """API failure raises DeliveryProviderError."""
        import httpx as _httpx
        mock_response = MagicMock()
        mock_response.status_code = 422
        http_error = _httpx.HTTPStatusError(
            "422", request=MagicMock(), response=mock_response
        )

        with patch.object(provider, "_request", side_effect=http_error):
            with pytest.raises(DeliveryProviderError):
                provider.create_delivery(
                    pickup_address, drop_address, 1.0, "ORDER-TEST-FAIL"
                )


# ──────────────────────────────────────────────────────────────────────────────
# 5. AWB Assignment tests
# ──────────────────────────────────────────────────────────────────────────────

class TestAWBAssignment:
    def test_assign_awb_success(self, provider):
        """Successful AWB assignment returns AWB code."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "response": {
                "data": {
                    "awb_code": "1234567890",
                    "courier_name": "Test Courier",
                }
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_request", return_value=mock_response):
            result = provider.assign_awb(789012, 123)
            assert result["awb_code"] == "1234567890"
            assert result["courier_name"] == "Test Courier"


# ──────────────────────────────────────────────────────────────────────────────
# 6. Tracking tests
# ──────────────────────────────────────────────────────────────────────────────

class TestTracking:
    def test_get_status_delivered(self, provider):
        """Tracking returns DELIVERED status."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "tracking_data": {
                "tracking_data": [
                    {
                        "date": "2026-08-31 12:00:00",
                        "location": "Pune Hub",
                        "activity": "Delivered",
                        "status": "6",
                    }
                ]
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_request", return_value=mock_response):
            status = provider.get_status("1234567890")
            assert status.status == DELIVERY_STATUS_DELIVERED
            assert status.current_location == "Pune Hub"

    def test_get_status_out_for_delivery(self, provider):
        """Tracking returns OUT_FOR_DELIVERY status."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "tracking_data": {
                "tracking_data": [
                    {
                        "date": "2026-08-31 10:00:00",
                        "location": "Mumbai",
                        "activity": "Out for delivery",
                        "status": "38",
                    }
                ]
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_request", return_value=mock_response):
            status = provider.get_status("1234567890")
            assert status.status == DELIVERY_STATUS_OUT_FOR_DELIVERY

    def test_get_status_no_entries(self, provider):
        """Tracking with no entries returns CREATED status."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "tracking_data": {"tracking_data": []}
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_request", return_value=mock_response):
            status = provider.get_status("1234567890")
            assert status.status == DELIVERY_STATUS_CREATED

    def test_get_status_inferred_from_activity(self, provider):
        """Status is inferred from activity text when code is unmapped."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "tracking_data": {
                "tracking_data": [
                    {
                        "date": "2026-08-31 09:00:00",
                        "location": "Mumbai",
                        "activity": "Package picked up from seller",
                        "status": "99",  # Unknown code
                    }
                ]
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_request", return_value=mock_response):
            status = provider.get_status("1234567890")
            assert status.status == DELIVERY_STATUS_PICKED_UP


# ──────────────────────────────────────────────────────────────────────────────
# 7. Cancellation tests
# ──────────────────────────────────────────────────────────────────────────────

class TestCancellation:
    def test_cancel_delivery_success(self, provider):
        """Successful cancellation returns True."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_request", return_value=mock_response):
            assert provider.cancel_delivery("123456") is True

    def test_cancel_delivery_failure_returns_false(self, provider):
        """Cancellation failure returns False."""
        with patch.object(provider, "_request", side_effect=Exception("error")):
            assert provider.cancel_delivery("123456") is False


# ──────────────────────────────────────────────────────────────────────────────
# 8. Webhook validation tests
# ──────────────────────────────────────────────────────────────────────────────

class TestWebhookValidation:
    def test_validate_webhook_valid_key(self):
        """Valid API key passes validation."""
        with patch.dict(os.environ, {"SHIPROCKET_WEBHOOK_SECRET": "my-secret"}):
            assert ShiprocketDeliveryProvider.validate_webhook(
                {"awb": "123"}, "my-secret"
            ) is True

    def test_validate_webhook_invalid_key(self):
        """Invalid API key fails validation."""
        with patch.dict(os.environ, {"SHIPROCKET_WEBHOOK_SECRET": "my-secret"}):
            assert ShiprocketDeliveryProvider.validate_webhook(
                {"awb": "123"}, "wrong-key"
            ) is False

    def test_validate_webhook_empty_payload(self):
        """Empty payload fails validation."""
        assert ShiprocketDeliveryProvider.validate_webhook({}, "key") is False

    def test_validate_webhook_no_secret_configured(self):
        """No secret configured means any key is accepted."""
        with patch.dict(os.environ, {"SHIPROCKET_WEBHOOK_SECRET": ""}):
            assert ShiprocketDeliveryProvider.validate_webhook(
                {"awb": "123"}, "any-key"
            ) is True


# ──────────────────────────────────────────────────────────────────────────────
# 9. Status mapping tests
# ──────────────────────────────────────────────────────────────────────────────

class TestStatusMapping:
    def test_delivered_maps_correctly(self):
        assert SHIPROCKET_STATUS_MAP["6"][0] == DELIVERY_STATUS_DELIVERED

    def test_out_for_delivery_maps_correctly(self):
        assert SHIPROCKET_STATUS_MAP["38"][0] == DELIVERY_STATUS_OUT_FOR_DELIVERY

    def test_picked_up_maps_correctly(self):
        assert SHIPROCKET_STATUS_MAP["2"][0] == DELIVERY_STATUS_PICKED_UP

    def test_cancelled_maps_correctly(self):
        assert SHIPROCKET_STATUS_MAP["9"][0] == DELIVERY_STATUS_CANCELLED

    def test_unknown_status_returns_none(self):
        assert SHIPROCKET_STATUS_MAP.get("999", (None,))[0] is None

    def test_map_webhook_status(self):
        assert ShiprocketDeliveryProvider.map_webhook_status("6") == DELIVERY_STATUS_DELIVERED
        assert ShiprocketDeliveryProvider.map_webhook_status("38") == DELIVERY_STATUS_OUT_FOR_DELIVERY
        assert ShiprocketDeliveryProvider.map_webhook_status("999") is None


# ──────────────────────────────────────────────────────────────────────────────
# 10. Provider interface compliance
# ──────────────────────────────────────────────────────────────────────────────

class TestProviderInterface:
    def test_implements_interface(self, provider):
        assert isinstance(provider, DeliveryProvider)

    def test_name_is_shiprocket(self, provider):
        assert provider.name == "shiprocket"

    def test_display_name(self, provider):
        assert provider.display_name == "Shiprocket"


# ──────────────────────────────────────────────────────────────────────────────
# 11. Configuration validation
# ──────────────────────────────────────────────────────────────────────────────

class TestConfiguration:
    def test_missing_email_raises_error(self):
        """Missing email raises error on credential check."""
        with patch.dict(os.environ, {"SHIPROCKET_API_EMAIL": "", "SHIPROCKET_API_PASSWORD": "pass"}):
            p = ShiprocketDeliveryProvider()
            with pytest.raises(DeliveryProviderError):
                p._get_credentials()

    def test_missing_password_raises_error(self):
        """Missing password raises error on credential check."""
        with patch.dict(os.environ, {"SHIPROCKET_API_EMAIL": "user@test.com", "SHIPROCKET_API_PASSWORD": ""}):
            p = ShiprocketDeliveryProvider()
            with pytest.raises(DeliveryProviderError):
                p._get_credentials()

    def test_create_delivery_rejects_missing_weight(self, provider, pickup_address, drop_address):
        """Order creation rejects missing weight."""
        with pytest.raises(DeliveryProviderError) as exc_info:
            provider.create_delivery(pickup_address, drop_address, 0, "ORDER-T")
        assert "weight" in str(exc_info.value).lower()

    def test_create_delivery_rejects_missing_length(self, provider, pickup_address, drop_address):
        """Order creation rejects missing length."""
        with pytest.raises(DeliveryProviderError) as exc_info:
            provider.create_delivery(
                pickup_address, drop_address, 1.0, "ORDER-T",
                length_cm=None, breadth_cm=10, height_cm=10,
            )
        assert "length" in str(exc_info.value).lower()

    def test_create_delivery_rejects_missing_breadth(self, provider, pickup_address, drop_address):
        """Order creation rejects missing breadth."""
        with pytest.raises(DeliveryProviderError) as exc_info:
            provider.create_delivery(
                pickup_address, drop_address, 1.0, "ORDER-T",
                length_cm=20, breadth_cm=None, height_cm=10,
            )
        assert "breadth" in str(exc_info.value).lower() or "width" in str(exc_info.value).lower()

    def test_create_delivery_rejects_missing_height(self, provider, pickup_address, drop_address):
        """Order creation rejects missing height."""
        with pytest.raises(DeliveryProviderError) as exc_info:
            provider.create_delivery(
                pickup_address, drop_address, 1.0, "ORDER-T",
                length_cm=20, breadth_cm=15, height_cm=None,
            )
        assert "height" in str(exc_info.value).lower()

    def test_create_delivery_rejects_zero_dimensions(self, provider, pickup_address, drop_address):
        """Order creation rejects zero dimensions."""
        with pytest.raises(DeliveryProviderError):
            provider.create_delivery(
                pickup_address, drop_address, 1.0, "ORDER-T",
                length_cm=0, breadth_cm=0, height_cm=0,
            )

    def test_provider_switch_demo_to_shiprocket(self):
        """Provider switch between demo and shiprocket."""
        with patch.dict(os.environ, {"DELIVERY_PROVIDER": "demo"}):
            from services.delivery.service import get_provider
            assert get_provider().name == "demo"
        with patch.dict(os.environ, {"DELIVERY_PROVIDER": "shiprocket"}):
            from services.delivery.service import get_provider
            assert get_provider().name == "shiprocket"

    def test_missing_shiprocket_credentials_raises_clear_error(self):
        """Missing Shiprocket credentials raises clear error."""
        saved_email = os.environ.pop("SHIPROCKET_API_EMAIL", None)
        saved_pass = os.environ.pop("SHIPROCKET_API_PASSWORD", None)
        try:
            with patch.dict(os.environ, {"DELIVERY_PROVIDER": "shiprocket"}):
                from services.delivery.service import get_provider
                p = get_provider()
                with pytest.raises(DeliveryProviderError) as exc_info:
                    p._authenticate()
                assert "credentials" in str(exc_info.value).lower()
        finally:
            if saved_email is not None:
                os.environ["SHIPROCKET_API_EMAIL"] = saved_email
            if saved_pass is not None:
                os.environ["SHIPROCKET_API_PASSWORD"] = saved_pass


# ──────────────────────────────────────────────────────────────────────────────
# 12. Demo provider still works (regression)
# ──────────────────────────────────────────────────────────────────────────────

class TestPreviewPayload:
    def test_preview_returns_payload(self, provider, pickup_address, drop_address):
        """Preview returns the order payload without making API calls."""
        with patch.dict(os.environ, {"SHIPROCKET_PICKUP_LOCATION": "Primary"}):
            result = provider.preview_order_payload(
                pickup_address, drop_address, 1.0, "ORDER-PREVIEW-001",
                order_amount=500, length_cm=20, breadth_cm=15, height_cm=10,
            )
            assert result["preview"] is True
            payload = result["payload"]
            assert payload["order_id"] == "ORDER-PREVIEW-001"
            assert payload["weight"] == 1.0
            assert payload["length"] == 20.0
            assert payload["breadth"] == 15.0
            assert payload["height"] == 10.0
            assert payload["pickup_location"] == "Primary"
            assert payload["payment_method"] == "Prepaid"
            assert payload["sub_total"] == 500

    def test_preview_rejects_missing_weight(self, provider, pickup_address, drop_address):
        with patch.dict(os.environ, {"SHIPROCKET_PICKUP_LOCATION": "Primary"}):
            with pytest.raises(DeliveryProviderError):
                provider.preview_order_payload(
                    pickup_address, drop_address, 0, "ORDER-T",
                    length_cm=20, breadth_cm=15, height_cm=10,
                )

    def test_preview_rejects_missing_dimensions(self, provider, pickup_address, drop_address):
        with patch.dict(os.environ, {"SHIPROCKET_PICKUP_LOCATION": "Primary"}):
            with pytest.raises(DeliveryProviderError):
                provider.preview_order_payload(
                    pickup_address, drop_address, 1.0, "ORDER-T",
                )

    def test_preview_rejects_missing_pickup_location(self, provider, pickup_address, drop_address):
        saved = os.environ.pop("SHIPROCKET_PICKUP_LOCATION", None)
        try:
            with pytest.raises(DeliveryProviderError) as exc_info:
                provider.preview_order_payload(
                    pickup_address, drop_address, 1.0, "ORDER-T",
                    length_cm=20, breadth_cm=15, height_cm=10,
                )
            assert "pickup" in str(exc_info.value).lower()
        finally:
            if saved is not None:
                os.environ["SHIPROCKET_PICKUP_LOCATION"] = saved

    def test_preview_does_not_make_api_call(self, provider, pickup_address, drop_address):
        """Preview must NOT call the Shiprocket API."""
        with patch.dict(os.environ, {"SHIPROCKET_PICKUP_LOCATION": "Primary"}):
            with patch.object(provider, '_request') as mock_request:
                provider.preview_order_payload(
                    pickup_address, drop_address, 1.0, "ORDER-T",
                    length_cm=20, breadth_cm=15, height_cm=10,
                )
                mock_request.assert_not_called()


class TestDemoProviderStillWorks:
    def test_demo_provider_loads(self):
        """Demo provider can still be instantiated."""
        from services.delivery.mock_provider import DemoDeliveryProvider
        demo = DemoDeliveryProvider()
        assert demo.name == "demo"
        assert demo.display_name == "Demo delivery"

    def test_demo_provider_get_quote(self):
        """Demo provider still returns quotes."""
        from services.delivery.mock_provider import DemoDeliveryProvider
        demo = DemoDeliveryProvider()
        pickup = Address.from_dict({"pin_code": "400001", "city": "Mumbai"})
        drop = Address.from_dict({"pin_code": "411001", "city": "Pune"})
        quote = demo.get_quote(pickup, drop, 1.0)
        assert quote.serviceable is True
        assert quote.delivery_fee == 59.0  # 49 + 10*1

    def test_service_provider_factory(self):
        """get_provider() returns correct provider based on env."""
        with patch.dict(os.environ, {"DELIVERY_PROVIDER": "demo"}):
            from services.delivery.service import get_provider
            p = get_provider()
            assert p.name == "demo"

        with patch.dict(os.environ, {"DELIVERY_PROVIDER": "shiprocket"}):
            from services.delivery.service import get_provider
            p = get_provider()
            assert p.name == "shiprocket"

    def test_unknown_provider_raises_error(self):
        """Unknown provider name raises ValueError."""
        with patch.dict(os.environ, {"DELIVERY_PROVIDER": "unknown"}):
            from services.delivery.service import get_provider
            with pytest.raises(ValueError, match="Unknown delivery provider"):
                get_provider()
