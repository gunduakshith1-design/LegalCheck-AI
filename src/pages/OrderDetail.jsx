import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import BuyerOrderDetail from './BuyerOrderDetail'
import SellerOrderDetail from './SellerOrderDetail'

/**
 * OrderDetail — role-aware wrapper.
 * Shows buyer or seller order detail based on the user's role.
 * Both roles use the same /orders/:orderId route.
 */
export default function OrderDetail() {
  const { profile } = useAuth()
  const role = profile?.role || 'buyer'

  if (role === 'seller') {
    return <SellerOrderDetail />
  }

  return <BuyerOrderDetail />
}
