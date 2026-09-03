"""
Tests for the delivery provider abstraction and demo provider.

These tests verify:
1. Demo provider deterministic behavior
2. Provider interface compliance
3. Quote generation
4. Delivery lifecycle simulation
5. Error handling
"""

import hashlib
import pytest
from unittest.mock import patch, MagicMock

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
    DELIVERY_TO_ORDER_STATUS_MAP,
)
from services.delivery.provider import DeliveryProvider, DeliveryProviderError
from services.delivery.mock_provider import DemoDeliveryProvider, _generate_demo_delivery_id


# ---------------------------------------------------------------------------
# Address model tests
# ---------------------------------------------------------------------------

class TestAddress:
    def test_from_dict(self):
        addr = Address.from_dict({
            "full_name": "Test User",
            "phone": "9876543210",
            "address_line": "123 Test Street",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pin_code": "400001",
        })
        assert addr.full_name == "Test User"
        assert addr.phone == "9876543210"
        assert addr.pin_code == "400001"

    def test_from_dict_defaults(self):
        addr = Address.from_dict({})
        assert addr.full_name == ""
        assert addr.pin_code == ""


# ---------------------------------------------------------------------------
# Demo provider tests
# ---------------------------------------------------------------------------

class TestDemoDeliveryProvider:
    def setup_method(self):
        self.provider = DemoDeliveryProvider()

    def test_provider_name(self):
        assert self.provider.name == "demo"

    def test_provider_display_name(self):
        assert self.provider.display_name == "Demo delivery"

    def test_implements_interface(self):
        assert isinstance(self.provider, DeliveryProvider)

    def test_get_quote_deterministic(self):
        pickup = Address.from_dict({
            "full_name": "Seller", "phone": "9876543210",
            "address_line": "Shop 1", "city": "Mumbai",
            "state": "Maharashtra", "pin_code": "400001",
        })
        drop = Address.from_dict({
            "full_name": "Buyer", "phone": "9876543211",
            "address_line": "Home 1", "city": "Pune",
            "state": "Maharashtra", "pin_code": "411001",
        })

        quote1 = self.provider.get_quote(pickup, drop, 1.0)
        quote2 = self.provider.get_quote(pickup, drop, 1.0)

        assert quote1.delivery_fee == quote2.delivery_fee
        assert quote1.eta_minutes == quote2.eta_minutes
        assert quote1.serviceable is True
        assert quote1.provider == "demo"

    def test_get_quote_fee_calculation(self):
        pickup = Address.from_dict({
            "full_name": "Seller", "phone": "9876543210",
            "address_line": "Shop 1", "city": "Mumbai",
            "state": "Maharashtra", "pin_code": "400001",
        })
        drop = Address.from_dict({
            "full_name": "Buyer", "phone": "9876543211",
            "address_line": "Home 1", "city": "Pune",
            "state": "Maharashtra", "pin_code": "411001",
        })

        # Base fee ₹49 + ₹10/kg * 2kg = ₹69
        quote = self.provider.get_quote(pickup, drop, 2.0)
        assert quote.delivery_fee == 69.0

        # Base fee ₹49 + ₹10/kg * 0.5kg = ₹54
        quote = self.provider.get_quote(pickup, drop, 0.5)
        assert quote.delivery_fee == 54.0

    def test_get_quote_zero_weight_defaults_to_1kg(self):
        pickup = Address.from_dict({
            "full_name": "Seller", "phone": "9876543210",
            "address_line": "Shop 1", "city": "Mumbai",
            "state": "Maharashtra", "pin_code": "400001",
        })
        drop = Address.from_dict({
            "full_name": "Buyer", "phone": "9876543211",
            "address_line": "Home 1", "city": "Pune",
            "state": "Maharashtra", "pin_code": "411001",
        })

        quote = self.provider.get_quote(pickup, drop, 0.0)
        assert quote.delivery_fee == 59.0  # 49 + 10*1

    def test_create_delivery(self):
        pickup = Address.from_dict({
            "full_name": "Seller", "phone": "9876543210",
            "address_line": "Shop 1", "city": "Mumbai",
            "state": "Maharashtra", "pin_code": "400001",
        })
        drop = Address.from_dict({
            "full_name": "Buyer", "phone": "9876543211",
            "address_line": "Home 1", "city": "Pune",
            "state": "Maharashtra", "pin_code": "411001",
        })

        result = self.provider.create_delivery(pickup, drop, 1.0, "ORDER-123")

        assert result.provider == "demo"
        assert result.provider_delivery_id.startswith("DEMO-DELIVERY-")
        assert result.status == DELIVERY_STATUS_CREATED
        assert result.courier_name == "Demo Courier Partner"

    def test_create_delivery_deterministic_id(self):
        pickup = Address.from_dict({
            "full_name": "Seller", "phone": "9876543210",
            "address_line": "Shop 1", "city": "Mumbai",
            "state": "Maharashtra", "pin_code": "400001",
        })
        drop = Address.from_dict({
            "full_name": "Buyer", "phone": "9876543211",
            "address_line": "Home 1", "city": "Pune",
            "state": "Maharashtra", "pin_code": "411001",
        })

        result1 = self.provider.create_delivery(pickup, drop, 1.0, "ORDER-456")
        result2 = self.provider.create_delivery(pickup, drop, 1.0, "ORDER-456")

        # Same order reference → same delivery ID
        assert result1.provider_delivery_id == result2.provider_delivery_id

    def test_get_status_invalid_id(self):
        with pytest.raises(DeliveryProviderError):
            self.provider.get_status("INVALID-ID")

    def test_cancel_delivery(self):
        assert self.provider.cancel_delivery("DEMO-DELIVERY-TEST1234") is True

    def test_cancel_delivery_invalid_id(self):
        with pytest.raises(DeliveryProviderError):
            self.provider.cancel_delivery("INVALID-ID")


# ---------------------------------------------------------------------------
# Demo ID generation tests
# ---------------------------------------------------------------------------

class TestDemoDeliveryId:
    def test_generates_correctly(self):
        id1 = _generate_demo_delivery_id("ORDER-001")
        assert id1.startswith("DEMO-DELIVERY-")
        assert len(id1) == len("DEMO-DELIVERY-") + 8

    def test_deterministic(self):
        id1 = _generate_demo_delivery_id("ORDER-001")
        id2 = _generate_demo_delivery_id("ORDER-001")
        assert id1 == id2

    def test_different_orders_different_ids(self):
        id1 = _generate_demo_delivery_id("ORDER-001")
        id2 = _generate_demo_delivery_id("ORDER-002")
        assert id1 != id2


# ---------------------------------------------------------------------------
# Status mapping tests
# ---------------------------------------------------------------------------

class TestStatusMapping:
    def test_out_for_delivery_maps_to_order_status(self):
        assert DELIVERY_TO_ORDER_STATUS_MAP["OUT_FOR_DELIVERY"] == "OUT_FOR_DELIVERY"

    def test_delivered_maps_to_order_status(self):
        assert DELIVERY_TO_ORDER_STATUS_MAP["DELIVERED"] == "DELIVERED"

    def test_created_does_not_map(self):
        assert "CREATED" not in DELIVERY_TO_ORDER_STATUS_MAP

    def test_cancelled_does_not_map(self):
        assert "CANCELLED" not in DELIVERY_TO_ORDER_STATUS_MAP


# ---------------------------------------------------------------------------
# Provider factory tests
# ---------------------------------------------------------------------------

class TestProviderFactory:
    def test_get_provider_demo(self):
        with patch.dict('os.environ', {'DELIVERY_PROVIDER': 'demo'}):
            from services.delivery.service import get_provider
            provider = get_provider()
            assert provider.name == "demo"

    def test_get_provider_unknown(self):
        with patch.dict('os.environ', {'DELIVERY_PROVIDER': 'unknown'}):
            from services.delivery.service import get_provider
            with pytest.raises(ValueError, match="Unknown delivery provider"):
                get_provider()
