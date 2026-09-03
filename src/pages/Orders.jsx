import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import BuyerOrders from './BuyerOrders'
import SellerOrders from './SellerOrders'

/**
 * Orders — role-aware wrapper.
 * Shows buyer's "My Orders" or seller's "Incoming Orders" based on role.
 * Both roles use the same /orders route.
 */
export default function Orders() {
  const { profile } = useAuth()
  const role = profile?.role || 'buyer'

  if (role === 'seller') {
    return <SellerOrders />
  }

  return <BuyerOrders />
}
