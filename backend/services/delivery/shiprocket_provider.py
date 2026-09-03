"""
Shiprocket delivery provider implementation.

Connects to the Shiprocket API for real courier services.
Requires SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD env vars.

Reference: https://apidocs.shiprocket.in/
Date verified: 2026-08-31
Base URL: https://apiv2.shiprocket.in/v1/external

Endpoints used:
- POST /auth/login                          — Authentication
- GET  /courier/serviceability/             — Rate/serviceability check
- POST /orders/create/adhoc                 — Create order
- POST /courier/assign/awb                  — Assign AWB to shipment
- POST /courier/generate/pickup             — Schedule pickup
- GET  /courier/track/awb/{awb_code}        — Track by AWB
- POST /orders/cancel                       — Cancel order

Security:
- Credentials are NEVER exposed to frontend
- JWT token cached in memory only, never persisted
- Token refreshed automatically on expiry
- Re-authenticates on 401
"""

import os
import time
import logging
from typing import Optional, Dict, Any, List

import httpx

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
)
from .provider import DeliveryProvider, DeliveryProviderError, DeliveryNotServiceableError

logger = logging.getLogger(__name__)

SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external"

# Shiprocket tracking status codes → our internal statuses
# Source: Shiprocket API documentation (verified 2026-08-31)
SHIPROCKET_STATUS_MAP = {
    # Status code: (internal_status, description)
    "1":  (None,                    "Shipment info received"),
    "2":  (DELIVERY_STATUS_PICKED_UP, "Shipment picked up"),
    "6":  (DELIVERY_STATUS_DELIVERED, "Delivered"),
    "7":  (DELIVERY_STATUS_CANCELLED, "RTO initiated"),
    "8":  (None,                    "Undelivered"),
    "9":  (DELIVERY_STATUS_CANCELLED, "Cancelled"),
    "10": (DELIVERY_STATUS_CANCELLED, "Returned"),
    "13": (None,                    "Delayed"),
    "18": (None,                    "Reached destination hub"),
    "38": (DELIVERY_STATUS_OUT_FOR_DELIVERY, "Out for delivery"),
    "47": (None,                    "EDD delayed"),
    "52": (None,                    "Reached destination city"),
}


class ShiprocketDeliveryProvider(DeliveryProvider):
    """
    Shiprocket delivery provider.

    Connects to the Shiprocket API for real courier services.
    Requires API credentials in environment variables:
    - SHIPROCKET_API_EMAIL
    - SHIPROCKET_API_PASSWORD

    Token is cached in memory and refreshed automatically.
    """

    def __init__(self):
        self._token: Optional[str] = None
        self._token_expiry: float = 0
        self._client = httpx.Client(timeout=30.0)

    @property
    def name(self) -> str:
        return "shiprocket"

    @property
    def display_name(self) -> str:
        return "Shiprocket"

    # ──────────────────────────────────────────────────────
    # Authentication
    # ──────────────────────────────────────────────────────

    def _get_credentials(self) -> tuple:
        """
        Get API credentials from environment.

        Returns (email, password) or raises if not configured.
        Never logs credential values.
        """
        email = os.environ.get("SHIPROCKET_API_EMAIL", "")
        password = os.environ.get("SHIPROCKET_API_PASSWORD", "")
        if not email or not password:
            raise DeliveryProviderError(
                "Shiprocket API credentials not configured. "
                "Set SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD.",
                provider=self.name,
                status_code=500,
            )
        return email, password

    def _authenticate(self, force: bool = False) -> str:
        """
        Authenticate with Shiprocket and get a bearer token.

        Token is valid for 10 days (240 hours).
        We cache it and refresh after 200 hours to be safe.
        On 401, we force re-authentication.

        Never logs the token value.
        """
        if not force and self._token and time.time() < self._token_expiry:
            return self._token

        email, password = self._get_credentials()

        try:
            logger.info("[Shiprocket] Authenticating...")
            response = self._client.post(
                f"{SHIPROCKET_BASE_URL}/auth/login",
                json={"email": email, "password": password},
            )
            response.raise_for_status()
            data = response.json()
            self._token = data.get("token", "")
            # Token valid for 10 days; refresh after 200 hours (~8.3 days)
            self._token_expiry = time.time() + (200 * 3600)
            logger.info("[Shiprocket] Authentication successful")
            return self._token
        except httpx.HTTPStatusError as e:
            logger.error(f"[Shiprocket] Authentication failed: {e.response.status_code}")
            raise DeliveryProviderError(
                f"Shiprocket authentication failed (HTTP {e.response.status_code}). "
                "Check SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD.",
                provider=self.name,
                status_code=401,
            )
        except DeliveryProviderError:
            raise
        except httpx.TimeoutException:
            logger.error("[Shiprocket] Authentication timed out")
            raise DeliveryProviderError(
                "Shiprocket authentication timed out",
                provider=self.name,
                status_code=504,
            )
        except Exception as e:
            logger.error(f"[Shiprocket] Authentication error: {type(e).__name__}")
            raise DeliveryProviderError(
                f"Shiprocket connection error during authentication",
                provider=self.name,
                status_code=500,
            )

    def _headers(self) -> Dict[str, str]:
        """Get authorization headers."""
        token = self._authenticate()
        return {"Authorization": f"Bearer {token}"}

    def _request(
        self,
        method: str,
        path: str,
        retry_on_401: bool = True,
        **kwargs,
    ) -> httpx.Response:
        """
        Make an authenticated request with automatic 401 re-auth.

        On 401, forces re-authentication and retries once.
        Never logs tokens or credentials.
        """
        url = f"{SHIPROCKET_BASE_URL}{path}"
        try:
            response = self._client.request(
                method, url, headers=self._headers(), **kwargs
            )
            if response.status_code == 401 and retry_on_401:
                logger.info("[Shiprocket] Got 401, re-authenticating...")
                self._authenticate(force=True)
                response = self._client.request(
                    method, url, headers=self._headers(), **kwargs
                )
            response.raise_for_status()
            return response
        except httpx.TimeoutException:
            logger.error(f"[Shiprocket] Request timed out: {method} {path}")
            raise DeliveryProviderError(
                f"Shiprocket request timed out",
                provider=self.name,
                status_code=504,
            )
        except httpx.HTTPStatusError:
            raise
        except DeliveryProviderError:
            raise
        except Exception as e:
            logger.error(f"[Shiprocket] Request error: {type(e).__name__}")
            raise DeliveryProviderError(
                f"Shiprocket connection error",
                provider=self.name,
                status_code=500,
            )

    # ──────────────────────────────────────────────────────
    # Serviceability / Quote
    # ──────────────────────────────────────────────────────

    def get_quote(
        self,
        pickup: Address,
        drop: Address,
        weight_kg: float,
        order_amount: Optional[float] = None,
    ) -> DeliveryQuote:
        """
        Get courier serviceability and rates from Shiprocket.

        Endpoint: GET /courier/serviceability/

        Required: pickup_postcode, delivery_postcode, weight
        Returns available courier companies with rates and ETAs.
        """
        if weight_kg is None or weight_kg <= 0:
            weight_kg = 1.0  # Default only for serviceability check (not for order creation)

        params = {
            "pickup_postcode": pickup.pin_code,
            "delivery_postcode": drop.pin_code,
            "weight": weight_kg,
            "cod": 0,  # COD not implemented yet
        }

        try:
            logger.info(
                f"[Shiprocket] Checking serviceability: "
                f"{pickup.pin_code} → {drop.pin_code}, {weight_kg}kg"
            )
            response = self._request("GET", "/courier/serviceability/", params=params)
            data = response.json()

            available_couriers = data.get("data", {}).get(
                "available_courier_companies", []
            )

            if not available_couriers:
                logger.warning("[Shiprocket] No couriers available for this route")
                return DeliveryQuote(
                    provider=self.name,
                    delivery_fee=0,
                    eta_minutes=0,
                    estimated_delivery_text="Not available for this route",
                    serviceable=False,
                    raw_response=data,
                )

            # Use the first (best rated) courier
            best = available_couriers[0]
            rate = float(best.get("rate", 0))
            etd_days = best.get("estimated_delivery_days", 0)
            courier_name = best.get("courier_name", "Unknown")
            courier_id = best.get("courier_company_id")

            eta_minutes = (etd_days or 0) * 24 * 60  # Convert days to minutes

            logger.info(
                f"[Shiprocket] Quote: ₹{rate}, {etd_days} days, "
                f"courier={courier_name}"
            )

            return DeliveryQuote(
                provider=self.name,
                delivery_fee=rate,
                eta_minutes=eta_minutes,
                estimated_delivery_text=(
                    f"~{etd_days} days via {courier_name}" if etd_days else "TBD"
                ),
                serviceable=True,
                quote_id=str(courier_id) if courier_id else None,
                raw_response=data,
            )

        except DeliveryProviderError:
            raise
        except httpx.HTTPStatusError as e:
            logger.error(f"[Shiprocket] Serviceability check failed: {e.response.status_code}")
            raise DeliveryProviderError(
                f"Shiprocket serviceability check failed (HTTP {e.response.status_code})",
                provider=self.name,
                status_code=e.response.status_code,
            )
        except Exception as e:
            logger.error(f"[Shiprocket] Serviceability error: {type(e).__name__}")
            raise DeliveryProviderError(
                f"Shiprocket connection error during serviceability check",
                provider=self.name,
                status_code=500,
            )

    # ──────────────────────────────────────────────────────
    # Order Creation
    # ──────────────────────────────────────────────────────

    def create_delivery(
        self,
        pickup: Address,
        drop: Address,
        weight_kg: float,
        order_reference: str,
        order_amount: Optional[float] = None,
        items_description: Optional[str] = None,
        length_cm: Optional[float] = None,
        breadth_cm: Optional[float] = None,
        height_cm: Optional[float] = None,
        pickup_location: Optional[str] = None,
    ) -> DeliveryResult:
        """
        Create an order on Shiprocket.

        Endpoint: POST /orders/create/adhoc

        Requires:
        - Unique order_id
        - Valid pickup location (pre-configured in Shiprocket)
        - Package weight and dimensions
        - Customer billing/shipping info
        """
        if weight_kg is None or weight_kg <= 0:
            raise DeliveryProviderError(
                "Package weight is required for Shiprocket deliveries. "
                "The seller must provide the actual shipping weight.",
                provider=self.name,
                status_code=422,
            )

        # Shiprocket requires dimensions > 0.5cm
        # Do NOT use fake defaults — reject if missing
        if not length_cm or length_cm <= 0.5:
            raise DeliveryProviderError(
                "Package length is required for Shiprocket deliveries (must be > 0.5 cm). "
                "The seller must provide actual package dimensions.",
                provider=self.name,
                status_code=422,
            )
        if not breadth_cm or breadth_cm <= 0.5:
            raise DeliveryProviderError(
                "Package breadth/width is required for Shiprocket deliveries (must be > 0.5 cm). "
                "The seller must provide actual package dimensions.",
                provider=self.name,
                status_code=422,
            )
        if not height_cm or height_cm <= 0.5:
            raise DeliveryProviderError(
                "Package height is required for Shiprocket deliveries (must be > 0.5 cm). "
                "The seller must provide actual package dimensions.",
                provider=self.name,
                status_code=422,
            )

        length = float(length_cm)
        breadth = float(breadth_cm)
        height = float(height_cm)

        location = pickup_location or os.environ.get(
            "SHIPROCKET_PICKUP_LOCATION", ""
        )
        if not location:
            raise DeliveryProviderError(
                "SHIPROCKET_PICKUP_LOCATION is not configured. "
                "Set it in .env or on the seller profile.",
                provider=self.name,
                status_code=500,
            )

        # Use trusted order_amount (derived from listing_price, not from frontend)
        # order_amount must be > 0 for real Shiprocket orders
        selling_price = int(order_amount) if order_amount and order_amount > 0 else 0
        sub_total = selling_price  # For single-item orders, sub_total = selling_price

        # Build order data
        # Billing = buyer's delivery address
        # Shipping = buyer's delivery address (same as billing)
        order_data = {
            "order_id": order_reference[:50],  # Max 50 chars
            "order_date": time.strftime("%Y-%m-%d"),
            "pickup_location": location,
            "billing_customer_name": drop.full_name.split()[0] if drop.full_name else "",
            "billing_address": drop.address_line or "",
            "billing_city": drop.city or "",
            "billing_pincode": int(drop.pin_code) if drop.pin_code and drop.pin_code.isdigit() else 0,
            "billing_state": drop.state or "",
            "billing_country": "India",
            "billing_phone": int(drop.phone) if drop.phone and drop.phone.isdigit() else 0,
            "shipping_is_billing": True,
            "order_items": [
                {
                    "name": items_description or "LegalCheck AI Product",
                    "sku": order_reference[:50],
                    "units": 1,
                    "selling_price": selling_price,
                }
            ],
            "weight": weight_kg,
            "length": length,
            "breadth": breadth,
            "height": height,
            "payment_method": "Prepaid",  # COD not implemented
            "sub_total": sub_total,
        }

        try:
            logger.info(
                f"[Shiprocket] Creating order: {order_reference}, "
                f"{weight_kg}kg, {length}x{breadth}x{height}cm"
            )
            response = self._request(
                "POST", "/orders/create/adhoc", json=order_data
            )
            data = response.json()

            sr_order_id = data.get("order_id")
            shipment_id = data.get("shipment_id")

            if not sr_order_id:
                raise DeliveryProviderError(
                    "Shiprocket order creation returned no order ID",
                    provider=self.name,
                )

            logger.info(
                f"[Shiprocket] Order created: sr_order_id={sr_order_id}, "
                f"shipment_id={shipment_id}"
            )

            return DeliveryResult(
                provider=self.name,
                provider_delivery_id=str(sr_order_id),
                status=DELIVERY_STATUS_CREATED,
                tracking_url=None,
                courier_name=None,
                awb_code=None,
                raw_response={
                    "sr_order_id": sr_order_id,
                    "shipment_id": shipment_id,
                },
            )

        except DeliveryProviderError:
            raise
        except httpx.HTTPStatusError as e:
            error_body = ""
            try:
                error_body = e.response.text
            except Exception:
                pass
            logger.error(
                f"[Shiprocket] Order creation failed: {e.response.status_code}"
            )
            raise DeliveryProviderError(
                f"Shiprocket order creation failed (HTTP {e.response.status_code})",
                provider=self.name,
                status_code=e.response.status_code,
            )
        except Exception as e:
            logger.error(f"[Shiprocket] Order creation error: {type(e).__name__}")
            raise DeliveryProviderError(
                f"Shiprocket connection error during order creation",
                provider=self.name,
                status_code=500,
            )

    # ──────────────────────────────────────────────────────
    # AWB Assignment
    # ──────────────────────────────────────────────────────

    def assign_awb(
        self, shipment_id: int, courier_id: int
    ) -> Dict[str, Any]:
        """
        Assign AWB to a shipment.

        Endpoint: POST /courier/assign/awb

        Returns dict with awb_code and courier_name.
        """
        try:
            logger.info(
                f"[Shiprocket] Assigning AWB: shipment={shipment_id}, "
                f"courier={courier_id}"
            )
            response = self._request(
                "POST",
                "/courier/assign/awb",
                json={"shipment_id": shipment_id, "courier_id": courier_id},
            )
            data = response.json()

            awb_data = data.get("response", {}).get("data", {})
            awb_code = awb_data.get("awb_code")
            courier_name = awb_data.get("courier_name")

            logger.info(
                f"[Shiprocket] AWB assigned: {awb_code}, courier={courier_name}"
            )

            return {
                "awb_code": str(awb_code) if awb_code else None,
                "courier_name": courier_name,
                "raw_response": data,
            }

        except DeliveryProviderError:
            raise
        except httpx.HTTPStatusError as e:
            logger.error(f"[Shiprocket] AWB assignment failed: {e.response.status_code}")
            raise DeliveryProviderError(
                f"Shiprocket AWB assignment failed (HTTP {e.response.status_code})",
                provider=self.name,
                status_code=e.response.status_code,
            )
        except Exception as e:
            logger.error(f"[Shiprocket] AWB assignment error: {type(e).__name__}")
            raise DeliveryProviderError(
                f"Shiprocket connection error during AWB assignment",
                provider=self.name,
                status_code=500,
            )

    # ──────────────────────────────────────────────────────
    # Pickup Generation
    # ──────────────────────────────────────────────────────

    def generate_pickup(self, shipment_id: int) -> bool:
        """
        Generate pickup for a shipment.

        Endpoint: POST /courier/generate/pickup

        Returns True if pickup was scheduled successfully.
        """
        try:
            logger.info(f"[Shiprocket] Generating pickup: shipment={shipment_id}")
            response = self._request(
                "POST",
                "/courier/generate/pickup",
                json={"shipment_id": shipment_id},
            )
            data = response.json()
            status = data.get("response", {}).get("data", {}).get("status")
            success = str(status) == "1"
            logger.info(f"[Shiprocket] Pickup result: success={success}")
            return success

        except DeliveryProviderError:
            raise
        except Exception as e:
            logger.error(f"[Shiprocket] Pickup generation error: {type(e).__name__}")
            return False

    # ──────────────────────────────────────────────────────
    # Tracking
    # ──────────────────────────────────────────────────────

    def get_status(self, provider_delivery_id: str) -> DeliveryStatus:
        """
        Track shipment via AWB.

        Endpoint: GET /courier/track/awb/{awb_code}

        The provider_delivery_id here should be the AWB code.
        """
        try:
            logger.info(f"[Shiprocket] Tracking AWB: {provider_delivery_id}")
            response = self._request(
                "GET", f"/courier/track/awb/{provider_delivery_id}"
            )
            data = response.json()

            tracking_data = data.get("tracking_data", {})
            entries = tracking_data.get("tracking_data", [])

            if not entries:
                return DeliveryStatus(
                    provider=self.name,
                    provider_delivery_id=provider_delivery_id,
                    status=DELIVERY_STATUS_CREATED,
                    current_location=None,
                    tracking_url=None,
                    eta_minutes=None,
                    raw_response=data,
                )

            # Get the most recent tracking entry
            latest = entries[0]
            sr_status = str(latest.get("status", ""))
            location = latest.get("location", "")
            activity = latest.get("activity", "")

            # Map Shiprocket status to our internal status
            internal_status, _ = SHIPROCKET_STATUS_MAP.get(
                sr_status, (None, "Unknown")
            )

            # If no mapping found, try to infer from activity text
            if internal_status is None:
                activity_lower = (activity or "").lower()
                if "delivered" in activity_lower:
                    internal_status = DELIVERY_STATUS_DELIVERED
                elif "out for delivery" in activity_lower or "out_for_delivery" in activity_lower:
                    internal_status = DELIVERY_STATUS_OUT_FOR_DELIVERY
                elif "picked up" in activity_lower:
                    internal_status = DELIVERY_STATUS_PICKED_UP
                elif "cancelled" in activity_lower or "rto" in activity_lower:
                    internal_status = DELIVERY_STATUS_CANCELLED
                else:
                    internal_status = DELIVERY_STATUS_ASSIGNED

            etd = tracking_data.get("etd")

            return DeliveryStatus(
                provider=self.name,
                provider_delivery_id=provider_delivery_id,
                status=internal_status,
                current_location=location or None,
                tracking_url=None,
                eta_minutes=None,
                raw_response=data,
            )

        except DeliveryProviderError:
            raise
        except httpx.HTTPStatusError as e:
            logger.error(f"[Shiprocket] Tracking failed: {e.response.status_code}")
            raise DeliveryProviderError(
                f"Shiprocket tracking failed (HTTP {e.response.status_code})",
                provider=self.name,
                status_code=e.response.status_code,
            )
        except Exception as e:
            logger.error(f"[Shiprocket] Tracking error: {type(e).__name__}")
            raise DeliveryProviderError(
                f"Shiprocket connection error during tracking",
                provider=self.name,
                status_code=500,
            )

    # ──────────────────────────────────────────────────────
    # Preview (dry-run — no API call)
    # ──────────────────────────────────────────────────────

    def preview_order_payload(
        self,
        pickup: Address,
        drop: Address,
        weight_kg: float,
        order_reference: str,
        order_amount: Optional[float] = None,
        items_description: Optional[str] = None,
        length_cm: Optional[float] = None,
        breadth_cm: Optional[float] = None,
        height_cm: Optional[float] = None,
        pickup_location: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Preview the order payload that would be sent to Shiprocket.
        Does NOT make any API call. Returns the sanitized payload for review.
        """
        if weight_kg is None or weight_kg <= 0:
            raise DeliveryProviderError(
                "Package weight is required", provider=self.name, status_code=422,
            )
        if not length_cm or length_cm <= 0.5:
            raise DeliveryProviderError(
                "Package length is required (must be > 0.5 cm)", provider=self.name, status_code=422,
            )
        if not breadth_cm or breadth_cm <= 0.5:
            raise DeliveryProviderError(
                "Package breadth is required (must be > 0.5 cm)", provider=self.name, status_code=422,
            )
        if not height_cm or height_cm <= 0.5:
            raise DeliveryProviderError(
                "Package height is required (must be > 0.5 cm)", provider=self.name, status_code=422,
            )

        location = pickup_location or os.environ.get("SHIPROCKET_PICKUP_LOCATION", "")
        if not location:
            raise DeliveryProviderError(
                "SHIPROCKET_PICKUP_LOCATION is not configured. "
                "Set it in .env to match a pickup location in your Shiprocket account.",
                provider=self.name, status_code=500,
            )

        # Build preview payload (same as create_delivery but returned, not sent)
        payload = {
            "order_id": order_reference[:50],
            "order_date": time.strftime("%Y-%m-%d"),
            "pickup_location": location,
            "billing_customer_name": (drop.full_name or "").split()[0],
            "billing_address": drop.address_line or "",
            "billing_city": drop.city or "",
            "billing_pincode": int(drop.pin_code) if drop.pin_code and drop.pin_code.isdigit() else 0,
            "billing_state": drop.state or "",
            "billing_country": "India",
            "billing_phone": int(drop.phone) if drop.phone and drop.phone.isdigit() else 0,
            "shipping_is_billing": True,
            "order_items": [{
                "name": items_description or "LegalCheck AI Product",
                "sku": order_reference[:50],
                "units": 1,
                "selling_price": int(order_amount) if order_amount and order_amount > 0 else 0,
            }],
            "weight": float(weight_kg),
            "length": float(length_cm),
            "breadth": float(breadth_cm),
            "height": float(height_cm),
            "payment_method": "Prepaid",
            "sub_total": int(order_amount) if order_amount and order_amount > 0 else 0,
        }

        return {
            "preview": True,
            "payload": payload,
            "warnings": [],
        }

    # ──────────────────────────────────────────────────────
    # Cancellation
    # ──────────────────────────────────────────────────────

    def cancel_delivery(self, provider_delivery_id: str) -> bool:
        """
        Cancel an order on Shiprocket.

        Endpoint: POST /orders/cancel
        """
        try:
            logger.info(f"[Shiprocket] Cancelling order: {provider_delivery_id}")
            response = self._request(
                "POST",
                "/orders/cancel",
                json={"ids": [int(provider_delivery_id)]},
            )
            logger.info("[Shiprocket] Order cancelled")
            return True

        except DeliveryProviderError:
            raise
        except Exception as e:
            logger.error(f"[Shiprocket] Cancel error: {type(e).__name__}")
            return False

    # ──────────────────────────────────────────────────────
    # Webhook Validation
    # ──────────────────────────────────────────────────────

    @staticmethod
    def validate_webhook(
        payload: Dict[str, Any],
        received_api_key: Optional[str] = None,
    ) -> bool:
        """
        Validate a webhook request from Shiprocket.

        Shiprocket sends tracking updates via webhook with:
        - x-api-key header for authentication
        - JSON body with tracking data

        Returns True if the webhook is valid.
        """
        if not payload:
            logger.warning("[Shiprocket] Empty webhook payload")
            return False

        expected_key = os.environ.get("SHIPROCKET_WEBHOOK_SECRET", "")
        if expected_key and received_api_key != expected_key:
            logger.warning("[Shiprocket] Invalid webhook API key")
            return False

        return True

    @staticmethod
    def map_webhook_status(sr_status: str) -> Optional[str]:
        """
        Map a Shiprocket webhook status to our internal status.

        Returns None if the status is not recognized (no update needed).
        """
        return SHIPROCKET_STATUS_MAP.get(sr_status, (None, "Unknown"))[0]
