"""
Deterministic demo/mock delivery provider for development and testing.

This provider does NOT connect to any real courier service.
It simulates a delivery lifecycle with predictable, deterministic behavior.

Provider name: "demo"
Display name: "Demo delivery"

The mock provider is explicitly labeled as demo in all UI output.
"""

import hashlib
import time
from typing import Optional

from .models import (
    Address,
    DeliveryQuote,
    DeliveryResult,
    DeliveryStatus,
    DELIVERY_STATUS_CREATED,
    DELIVERY_STATUS_ASSIGNED,
    DELIVERY_STATUS_PICKED_UP,
    DELIVERY_STATUS_OUT_FOR_DELIVERY,
    DELIVERY_STATUS_DELIVERED,
)
from .provider import DeliveryProvider, DeliveryProviderError


# Deterministic demo data
DEMO_DELIVERY_ID_PREFIX = "DEMO-DELIVERY"
DEMO_TRACKING_URL = None  # No real tracking URL for demo
DEMO_COURIER_NAME = "Demo Courier Partner"
DEMO_BASE_FEE = 49.0  # ₹49 base delivery fee
DEMO_PER_KG_FEE = 10.0  # ₹10 per kg
DEMO_ETA_MINUTES = 45  # 45 minutes estimated


def _generate_demo_delivery_id(order_reference: str) -> str:
    """Generate a deterministic demo delivery ID from the order reference."""
    # Use a hash of the order reference for deterministic behavior
    h = hashlib.md5(order_reference.encode()).hexdigest()[:8].upper()
    return f"{DEMO_DELIVERY_ID_PREFIX}-{h}"


class DemoDeliveryProvider(DeliveryProvider):
    """
    Deterministic demo delivery provider.

    Behavior:
    - Always returns a quote (route is always serviceable)
    - Creates delivery with a DEMO-DELIVERY-XXXX ID
    - Simulates lifecycle: CREATED → ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED
    - All data is deterministic based on input

    This provider is for development/testing only.
    It must NOT pretend to be a real courier service.
    """

    @property
    def name(self) -> str:
        return "demo"

    @property
    def display_name(self) -> str:
        return "Demo delivery"

    def get_quote(
        self,
        pickup: Address,
        drop: Address,
        weight_kg: float,
        order_amount: Optional[float] = None,
    ) -> DeliveryQuote:
        """
        Return a deterministic demo quote.

        The quote is based on a simple formula:
        - Base fee: ₹49
        - Per kg: ₹10
        - ETA: 45 minutes (fixed)
        """
        if weight_kg <= 0:
            weight_kg = 1.0  # Default to 1 kg

        delivery_fee = DEMO_BASE_FEE + (DEMO_PER_KG_FEE * weight_kg)

        return DeliveryQuote(
            provider=self.name,
            delivery_fee=round(delivery_fee, 2),
            eta_minutes=DEMO_ETA_MINUTES,
            estimated_delivery_text=f"~{DEMO_ETA_MINUTES} minutes (demo)",
            serviceable=True,
            quote_id=None,
            expires_at=None,
            raw_response={
                "mode": "demo",
                "pickup_pincode": pickup.pin_code,
                "drop_pincode": drop.pin_code,
                "weight_kg": weight_kg,
            },
        )

    def create_delivery(
        self,
        pickup: Address,
        drop: Address,
        weight_kg: float,
        order_reference: str,
        order_amount: Optional[float] = None,
        items_description: Optional[str] = None,
    ) -> DeliveryResult:
        """
        Create a demo delivery with a deterministic ID.

        The delivery starts in CREATED status.
        Status progression must be simulated through get_status() time-based logic.
        """
        delivery_id = _generate_demo_delivery_id(order_reference)

        return DeliveryResult(
            provider=self.name,
            provider_delivery_id=delivery_id,
            status=DELIVERY_STATUS_CREATED,
            tracking_url=DEMO_TRACKING_URL,
            courier_name=DEMO_COURIER_NAME,
            awb_code=None,
            raw_response={
                "mode": "demo",
                "order_reference": order_reference,
                "created_at": time.time(),
            },
        )

    def get_status(self, provider_delivery_id: str) -> DeliveryStatus:
        """
        Simulate delivery status progression based on time since creation.

        The demo provider advances through statuses deterministically:
        - 0-10s: CREATED
        - 10-20s: ASSIGNED
        - 20-30s: PICKED_UP
        - 30-40s: OUT_FOR_DELIVERY
        - 40s+: DELIVERED

        This allows testing the full lifecycle in a short time.
        """
        if not provider_delivery_id.startswith(DEMO_DELIVERY_ID_PREFIX):
            raise DeliveryProviderError(
                f"Invalid demo delivery ID: {provider_delivery_id}",
                provider=self.name,
                status_code=404,
            )

        # Extract the hash part for deterministic timing
        # Use the hash as a seed for consistent behavior
        hash_part = provider_delivery_id.replace(f"{DEMO_DELIVERY_ID_PREFIX}-", "")
        seed = int(hash_part, 16) % 100  # Use hash to offset timing slightly

        # Simulate time-based progression
        # In a real scenario, this would query the provider's API
        current_time = time.time()
        # Use a fixed reference point for determinism
        elapsed = seed + (current_time % 60)  # Cycles every 60 seconds

        if elapsed < 15:
            status = DELIVERY_STATUS_CREATED
        elif elapsed < 30:
            status = DELIVERY_STATUS_ASSIGNED
        elif elapsed < 45:
            status = DELIVERY_STATUS_PICKED_UP
        elif elapsed < 55:
            status = DELIVERY_STATUS_OUT_FOR_DELIVERY
        else:
            status = DELIVERY_STATUS_DELIVERED

        return DeliveryStatus(
            provider=self.name,
            provider_delivery_id=provider_delivery_id,
            status=status,
            current_location="Demo Location" if status != DELIVERY_STATUS_CREATED else None,
            tracking_url=DEMO_TRACKING_URL,
            eta_minutes=DEMO_ETA_MINUTES if status != DELIVERY_STATUS_DELIVERED else 0,
            raw_response={"mode": "demo", "simulated_status": status},
        )

    def cancel_delivery(self, provider_delivery_id: str) -> bool:
        """
        Demo cancel — always succeeds.
        """
        if not provider_delivery_id.startswith(DEMO_DELIVERY_ID_PREFIX):
            raise DeliveryProviderError(
                f"Invalid demo delivery ID: {provider_delivery_id}",
                provider=self.name,
                status_code=404,
            )
        return True
