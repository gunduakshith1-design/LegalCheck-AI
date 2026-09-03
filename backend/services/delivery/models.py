"""
Delivery data models for the provider abstraction layer.

These are internal dataclasses — NOT database models.
They define the interface between the delivery service and providers.
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any


@dataclass
class Address:
    """Standardized address for pickup/drop."""
    full_name: str
    phone: str
    address_line: str
    city: str
    state: str
    pin_code: str

    @classmethod
    def from_dict(cls, d: Dict[str, str]) -> "Address":
        return cls(
            full_name=d.get("full_name", ""),
            phone=d.get("phone", ""),
            address_line=d.get("address_line", ""),
            city=d.get("city", ""),
            state=d.get("state", ""),
            pin_code=d.get("pin_code", ""),
        )


@dataclass
class DeliveryQuote:
    """Quote from a delivery provider."""
    provider: str
    delivery_fee: float
    eta_minutes: int
    estimated_delivery_text: str  # e.g., "2-3 days" or "30-45 min"
    serviceable: bool
    quote_id: Optional[str] = None  # provider-specific quote reference
    expires_at: Optional[str] = None  # ISO timestamp if quote expires
    raw_response: Optional[Dict[str, Any]] = None  # provider-specific data


@dataclass
class DeliveryResult:
    """Result of creating a delivery."""
    provider: str
    provider_delivery_id: str  # external ID from provider
    status: str  # CREATED, ASSIGNED, etc.
    tracking_url: Optional[str] = None
    courier_name: Optional[str] = None
    awb_code: Optional[str] = None  # airway bill number if applicable
    raw_response: Optional[Dict[str, Any]] = None


@dataclass
class DeliveryStatus:
    """Current status of a delivery."""
    provider: str
    provider_delivery_id: str
    status: str
    current_location: Optional[str] = None
    tracking_url: Optional[str] = None
    eta_minutes: Optional[int] = None
    raw_response: Optional[Dict[str, Any]] = None


# Status constants
DELIVERY_STATUS_QUOTE = "QUOTE_AVAILABLE"
DELIVERY_STATUS_CREATED = "CREATED"
DELIVERY_STATUS_ASSIGNED = "ASSIGNED"
DELIVERY_STATUS_PICKED_UP = "PICKED_UP"
DELIVERY_STATUS_OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY"
DELIVERY_STATUS_DELIVERED = "DELIVERED"
DELIVERY_STATUS_CANCELLED = "CANCELLED"
DELIVERY_STATUS_FAILED = "FAILED"

# Delivery status → Order status mapping
# When delivery reaches these statuses, the order status should also update
DELIVERY_TO_ORDER_STATUS_MAP = {
    DELIVERY_STATUS_OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
    DELIVERY_STATUS_DELIVERED: "DELIVERED",
}
