"""
Delivery service — coordinates provider calls with order status updates.

This service is the single entry point for all delivery operations.
It does NOT directly interact with the database — that is handled
by the Supabase RPC functions. This service provides the logic
that those functions call.
"""

import os
import logging
from typing import Optional, Dict, Any

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
    DELIVERY_STATUS_CANCELLED,
    DELIVERY_STATUS_FAILED,
    DELIVERY_TO_ORDER_STATUS_MAP,
)
from .provider import DeliveryProvider, DeliveryProviderError

logger = logging.getLogger(__name__)


def get_provider() -> DeliveryProvider:
    """
    Get the active delivery provider based on DELIVERY_PROVIDER env var.

    Returns:
        DeliveryProvider instance

    Raises:
        ValueError: If provider name is unknown
    """
    provider_name = os.environ.get("DELIVERY_PROVIDER", "demo").lower().strip()

    if provider_name == "demo":
        from .mock_provider import DemoDeliveryProvider
        return DemoDeliveryProvider()
    elif provider_name == "shiprocket":
        from .shiprocket_provider import ShiprocketDeliveryProvider
        return ShiprocketDeliveryProvider()
    else:
        raise ValueError(f"Unknown delivery provider: {provider_name}")


def get_quote(
    pickup_address: Dict[str, str],
    drop_address: Dict[str, str],
    weight_kg: float = 1.0,
    order_amount: Optional[float] = None,
) -> DeliveryQuote:
    """
    Get a delivery quote from the active provider.

    Args:
        pickup_address: Seller's address as dict
        drop_address: Buyer's delivery address as dict
        weight_kg: Package weight (default 1.0 kg)
        order_amount: Order total (optional)

    Returns:
        DeliveryQuote
    """
    provider = get_provider()
    pickup = Address.from_dict(pickup_address)
    drop = Address.from_dict(drop_address)

    logger.info(
        f"[DeliveryService] Getting quote from {provider.name}: "
        f"{pickup.pin_code} → {drop.pin_code}, {weight_kg}kg"
    )

    quote = provider.get_quote(pickup, drop, weight_kg, order_amount)

    logger.info(
        f"[DeliveryService] Quote received: ₹{quote.delivery_fee}, "
        f"ETA {quote.eta_minutes}min, serviceable={quote.serviceable}"
    )

    return quote


def create_delivery(
    pickup_address: Dict[str, str],
    drop_address: Dict[str, str],
    order_reference: str,
    weight_kg: float = 1.0,
    order_amount: Optional[float] = None,
    items_description: Optional[str] = None,
    length_cm: Optional[float] = None,
    breadth_cm: Optional[float] = None,
    height_cm: Optional[float] = None,
    pickup_location: Optional[str] = None,
) -> DeliveryResult:
    """
    Create a delivery with the active provider.

    Args:
        pickup_address: Seller's address as dict
        drop_address: Buyer's delivery address as dict
        order_reference: Our order ID for reference
        weight_kg: Package weight (default 1.0 kg)
        order_amount: Order total (optional)
        items_description: Item description (optional)
        length_cm: Package length in cm (optional, for Shiprocket)
        breadth_cm: Package breadth in cm (optional, for Shiprocket)
        height_cm: Package height in cm (optional, for Shiprocket)
        pickup_location: Pickup location name (optional, for Shiprocket)

    Returns:
        DeliveryResult
    """
    provider = get_provider()
    pickup = Address.from_dict(pickup_address)
    drop = Address.from_dict(drop_address)

    logger.info(
        f"[DeliveryService] Creating delivery with {provider.name}: "
        f"order={order_reference}, {pickup.pin_code} → {drop.pin_code}"
    )

    # Pass extra kwargs for Shiprocket provider
    kwargs = {}
    if hasattr(provider, 'create_delivery'):
        import inspect
        sig = inspect.signature(provider.create_delivery)
        if 'length_cm' in sig.parameters:
            kwargs['length_cm'] = length_cm
        if 'breadth_cm' in sig.parameters:
            kwargs['breadth_cm'] = breadth_cm
        if 'height_cm' in sig.parameters:
            kwargs['height_cm'] = height_cm
        if 'pickup_location' in sig.parameters:
            kwargs['pickup_location'] = pickup_location

    result = provider.create_delivery(
        pickup, drop, weight_kg, order_reference, order_amount, items_description,
        **kwargs,
    )

    logger.info(
        f"[DeliveryService] Delivery created: {result.provider_delivery_id}, "
        f"status={result.status}, courier={result.courier_name}"
    )

    return result


def get_delivery_status(provider_delivery_id: str) -> DeliveryStatus:
    """
    Get the current status of a delivery.

    Args:
        provider_delivery_id: Provider's delivery ID

    Returns:
        DeliveryStatus
    """
    provider = get_provider()

    logger.info(f"[DeliveryService] Checking status: {provider.name}/{provider_delivery_id}")

    status = provider.get_status(provider_delivery_id)

    logger.info(f"[DeliveryService] Status: {status.status}")

    return status


def cancel_delivery(provider_delivery_id: str) -> bool:
    """
    Cancel a delivery.

    Args:
        provider_delivery_id: Provider's delivery ID

    Returns:
        True if successful
    """
    provider = get_provider()

    logger.info(f"[DeliveryService] Cancelling: {provider.name}/{provider_delivery_id}")

    success = provider.cancel_delivery(provider_delivery_id)

    logger.info(f"[DeliveryService] Cancel result: {success}")

    return success


def map_delivery_to_order_status(delivery_status: str) -> Optional[str]:
    """
    Map a delivery status to the corresponding order status.

    Returns the order status if the delivery status triggers an order update,
    or None if no order update is needed.
    """
    return DELIVERY_TO_ORDER_STATUS_MAP.get(delivery_status)


def assign_awb(shipment_id: int, courier_id: int) -> Dict[str, Any]:
    """
    Assign AWB to a shipment (Shiprocket only).

    Args:
        shipment_id: Shiprocket shipment ID
        courier_id: Shiprocket courier company ID

    Returns:
        Dict with awb_code and courier_name

    Raises:
        DeliveryProviderError if not supported or fails
    """
    provider = get_provider()

    if not hasattr(provider, 'assign_awb'):
        raise DeliveryProviderError(
            f"Provider '{provider.name}' does not support AWB assignment",
            provider=provider.name,
            status_code=501,
        )

    logger.info(
        f"[DeliveryService] Assigning AWB: shipment={shipment_id}, "
        f"courier={courier_id}"
    )

    result = provider.assign_awb(shipment_id, courier_id)

    logger.info(
        f"[DeliveryService] AWB assigned: {result.get('awb_code')}, "
        f"courier={result.get('courier_name')}"
    )

    return result


def generate_pickup(shipment_id: int) -> bool:
    """
    Generate pickup for a shipment (Shiprocket only).

    Args:
        shipment_id: Shiprocket shipment ID

    Returns:
        True if successful
    """
    provider = get_provider()

    if not hasattr(provider, 'generate_pickup'):
        raise DeliveryProviderError(
            f"Provider '{provider.name}' does not support pickup generation",
            provider=provider.name,
            status_code=501,
        )

    logger.info(f"[DeliveryService] Generating pickup: shipment={shipment_id}")

    success = provider.generate_pickup(shipment_id)

    logger.info(f"[DeliveryService] Pickup result: {success}")

    return success


def validate_webhook_payload(
    payload: Dict[str, Any],
    provider: str,
    received_api_key: Optional[str] = None,
) -> bool:
    """
    Validate a webhook payload from a delivery provider.

    Args:
        payload: The webhook request body
        provider: Provider name
        received_api_key: API key received in the webhook header

    Returns:
        True if payload is valid and authenticated
    """
    if not payload:
        logger.warning(f"[DeliveryService] Empty webhook payload from {provider}")
        return False

    if provider == "shiprocket":
        from .shiprocket_provider import ShiprocketDeliveryProvider
        return ShiprocketDeliveryProvider.validate_webhook(payload, received_api_key)
    elif provider == "demo":
        # Demo provider doesn't send real webhooks
        logger.info(f"[DeliveryService] Demo provider webhook received (simulated)")
        return True

    logger.warning(f"[DeliveryService] Unknown webhook provider: {provider}")
    return False
