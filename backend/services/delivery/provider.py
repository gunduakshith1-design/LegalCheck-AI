"""
Abstract base class for delivery providers.

All delivery providers (demo, shiprocket, porter, etc.) must implement this interface.
The application should only interact with DeliveryProvider, never with provider-specific code.
"""

from abc import ABC, abstractmethod
from typing import Optional

from .models import Address, DeliveryQuote, DeliveryResult, DeliveryStatus


class DeliveryProvider(ABC):
    """
    Abstract delivery provider interface.

    Implementations must be stateless — all provider-specific state
    (tokens, sessions) should be managed internally.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier (e.g., 'demo', 'shiprocket', 'porter')."""
        ...

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable provider name for UI display."""
        ...

    @abstractmethod
    def get_quote(
        self,
        pickup: Address,
        drop: Address,
        weight_kg: float,
        order_amount: Optional[float] = None,
    ) -> DeliveryQuote:
        """
        Get a delivery quote for the given route.

        Args:
            pickup: Seller/pickup address
            drop: Buyer/delivery address
            weight_kg: Package weight in kilograms
            order_amount: Order total (for COD calculations, optional)

        Returns:
            DeliveryQuote with pricing and ETA

        Raises:
            DeliveryProviderError: If the provider is unavailable or the route is not serviceable
        """
        ...

    @abstractmethod
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
        Create a delivery order with the provider.

        Args:
            pickup: Seller/pickup address
            drop: Buyer/delivery address
            weight_kg: Package weight in kilograms
            order_reference: Our internal order ID for reference
            order_amount: Order total (optional)
            items_description: Description of items being shipped (optional)

        Returns:
            DeliveryResult with provider delivery ID and initial status

        Raises:
            DeliveryProviderError: If creation fails
        """
        ...

    @abstractmethod
    def get_status(self, provider_delivery_id: str) -> DeliveryStatus:
        """
        Get the current status of a delivery.

        Args:
            provider_delivery_id: The provider's delivery/shipment ID

        Returns:
            DeliveryStatus with current state

        Raises:
            DeliveryProviderError: If status check fails
        """
        ...

    @abstractmethod
    def cancel_delivery(self, provider_delivery_id: str) -> bool:
        """
        Cancel a delivery.

        Args:
            provider_delivery_id: The provider's delivery/shipment ID

        Returns:
            True if cancellation was successful

        Raises:
            DeliveryProviderError: If cancellation fails
        """
        ...


class DeliveryProviderError(Exception):
    """Base exception for delivery provider errors."""

    def __init__(self, message: str, provider: str = "unknown", status_code: int = 500):
        super().__init__(message)
        self.provider = provider
        self.status_code = status_code


class DeliveryNotServiceableError(DeliveryProviderError):
    """Raised when a route is not serviceable by the provider."""

    def __init__(self, provider: str = "unknown"):
        super().__init__(
            "Delivery is not available for this route",
            provider=provider,
            status_code=422,
        )


class DeliveryCreationError(DeliveryProviderError):
    """Raised when delivery creation fails."""

    def __init__(self, message: str = "Failed to create delivery", provider: str = "unknown"):
        super().__init__(message, provider=provider, status_code=500)
