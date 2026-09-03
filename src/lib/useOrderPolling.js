import { useEffect, useRef, useCallback } from 'react'
import { useNotifications } from '../contexts/NotificationContext'
import { supabase } from './supabase'

const POLL_INTERVAL_MS = 30_000 // 30 seconds
const STORAGE_KEY_PREFIX = 'legalcheck_last_seen_'

/**
 * useOrderPolling — polls the orders table for new orders and status changes.
 *
 * For sellers: detects new PENDING orders from buyers.
 * For buyers: detects status changes on their orders.
 *
 * Uses localStorage to track the last seen timestamp per user,
 * so notifications survive page refreshes within the same browser.
 */
export function useOrderPolling(userId, role) {
  const { addNotification } = useNotifications()
  const lastSeenRef = useRef(null)
  const isFirstPoll = useRef(true)

  // Load last seen timestamp from localStorage
  useEffect(() => {
    if (!userId) return
    const key = `${STORAGE_KEY_PREFIX}${userId}`
    const stored = localStorage.getItem(key)
    lastSeenRef.current = stored ? new Date(stored) : new Date()
  }, [userId])

  const poll = useCallback(async () => {
    if (!supabase || !userId || !role) return

    const lastSeen = lastSeenRef.current
    if (!lastSeen) return

    try {
      if (role === 'seller') {
        // Check for new orders placed by buyers for this seller
        const { data: newOrders, error } = await supabase
          .from('orders')
          .select('id, status, created_at, buyer_user_id, delivery_address')
          .eq('seller_user_id', userId)
          .eq('status', 'PENDING')
          .gt('created_at', lastSeen.toISOString())
          .order('created_at', { ascending: false })

        if (error || !newOrders || newOrders.length === 0) return

        // Get product names for each order
        for (const order of newOrders) {
          const { data: items } = await supabase
            .from('order_items')
            .select('product_name_snapshot, quantity')
            .eq('order_id', order.id)
            .limit(1)

          const item = items?.[0]
          const productName = item?.product_name_snapshot || 'Product'
          const quantity = item?.quantity || 1
          const buyerCity = order.delivery_address?.city || 'Unknown city'

          if (!isFirstPoll.current) {
            addNotification({
              type: 'new_order',
              title: 'New Order Received',
              message: `${productName} × ${quantity} from ${buyerCity}`,
              orderId: order.id,
            })
          }
        }
      } else if (role === 'buyer') {
        // Check for status changes on buyer's orders
        const { data: updatedOrders, error } = await supabase
          .from('orders')
          .select('id, status, updated_at')
          .eq('buyer_user_id', userId)
          .not('status', 'eq', 'PENDING')
          .gt('updated_at', lastSeen.toISOString())

        if (error || !updatedOrders || updatedOrders.length === 0) return

        const STATUS_MESSAGES = {
          ACCEPTED: 'Your order has been accepted',
          PREPARING: 'Your order is being prepared',
          READY_FOR_PICKUP: 'Your order is ready for pickup',
          OUT_FOR_DELIVERY: 'Your order is out for delivery',
          DELIVERED: 'Your order has been delivered',
          REJECTED: 'Your order was rejected',
          CANCELLED: 'Your order was cancelled',
        }

        if (!isFirstPoll.current) {
          for (const order of updatedOrders) {
            const message = STATUS_MESSAGES[order.status]
            if (message) {
              addNotification({
                type: 'order_update',
                title: 'Order Update',
                message: `${message} (#${order.id.slice(0, 8)})`,
                orderId: order.id,
              })
            }
          }
        }
      }

      // Update last seen timestamp
      lastSeenRef.current = new Date()
      if (userId) {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, lastSeenRef.current.toISOString())
      }

      // After first poll, enable notifications
      isFirstPoll.current = false
    } catch (err) {
      console.warn('[useOrderPolling] Poll error:', err)
    }
  }, [userId, role, addNotification])

  useEffect(() => {
    if (!userId || !role) return

    // Initial poll (silent — no notifications on first run)
    poll()

    // Set up interval
    const interval = setInterval(poll, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [userId, role, poll])
}
