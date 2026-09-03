import { supabase } from './supabase'

/**
 * Order Service — Supabase operations for the ordering system.
 *
 * Buyer operations use place_order() SECURITY DEFINER function.
 * Seller operations use update_order_status() SECURITY DEFINER function.
 * Direct queries are RLS-protected.
 */

// ---------------------------------------------------------------------------
// Buyer: Place an order
// ---------------------------------------------------------------------------

/**
 * Place an order for a listed product.
 * Server-side validation enforces: auth, product exists, listing LISTED,
 * screening_score >= 70, valid quantity, address fields.
 *
 * @param {string} productId - The product to order
 * @param {number} quantity - Number of units
 * @param {object} deliveryAddress - { full_name, phone, address_line, city, state, pin_code }
 * @param {string|null} buyerNote - Optional note
 * @returns {{ data, error }}
 */
export async function placeOrder(productId, quantity, deliveryAddress, buyerNote = null) {
  if (!supabase) return { data: null, error: 'Supabase not configured' }

  const { data, error } = await supabase.rpc('place_order', {
    p_product_id: productId,
    p_quantity: quantity,
    p_delivery_address: deliveryAddress,
    p_buyer_note: buyerNote,
  })

  if (error) {
    console.error('[OrderService] placeOrder failed:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// Buyer: Fetch my orders
// ---------------------------------------------------------------------------

/**
 * Fetch all orders for the current buyer, newest first.
 * Returns orders with order_items joined.
 */
export async function fetchBuyerOrders(userId) {
  if (!supabase || !userId) return { data: [], error: null }

  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (*)
    `)
    .eq('buyer_user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[OrderService] fetchBuyerOrders failed:', error)
    return { data: [], error: error.message }
  }

  return { data: data || [], error: null }
}

/**
 * Fetch a single order by ID (RLS ensures buyer ownership).
 */
export async function fetchBuyerOrderById(orderId) {
  if (!supabase || !orderId) return { data: null, error: null }

  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (*)
    `)
    .eq('id', orderId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return { data: null, error: 'Order not found' }
    console.error('[OrderService] fetchBuyerOrderById failed:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// Buyer: Cancel an order
// ---------------------------------------------------------------------------

/**
 * Cancel a pending order (buyer can cancel while status = PENDING).
 */
export async function cancelOrder(orderId) {
  if (!supabase || !orderId) return { data: null, error: 'Supabase not configured' }

  const { data, error } = await supabase.rpc('cancel_order', {
    p_order_id: orderId,
  })

  if (error) {
    console.error('[OrderService] cancelOrder failed:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// Seller: Fetch incoming orders
// ---------------------------------------------------------------------------

/**
 * Fetch all orders for the current seller (as store owner), newest first.
 */
export async function fetchSellerOrders(sellerUserId) {
  if (!supabase || !sellerUserId) return { data: [], error: null }

  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (*)
    `)
    .eq('seller_user_id', sellerUserId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[OrderService] fetchSellerOrders failed:', error)
    return { data: [], error: error.message }
  }

  return { data: data || [], error: null }
}

/**
 * Fetch a single order by ID for the seller (RLS ensures seller ownership).
 */
export async function fetchSellerOrderById(orderId) {
  if (!supabase || !orderId) return { data: null, error: null }

  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (*)
    `)
    .eq('id', orderId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return { data: null, error: 'Order not found' }
    console.error('[OrderService] fetchSellerOrderById failed:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// Seller: Update order status
// ---------------------------------------------------------------------------

/**
 * Update an order's status (seller only, valid transitions enforced server-side).
 */
export async function updateOrderStatus(orderId, newStatus) {
  if (!supabase || !orderId || !newStatus) return { data: null, error: 'Missing parameters' }

  const { data, error } = await supabase.rpc('update_order_status', {
    p_order_id: orderId,
    p_new_status: newStatus,
  })

  if (error) {
    console.error('[OrderService] updateOrderStatus failed:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// Helpers: Fetch store info for orders (buyer sees seller shop name)
// ---------------------------------------------------------------------------

/**
 * Fetch seller profile info to display shop name in order views.
 */
export async function fetchSellerShopInfo(sellerUserId) {
  if (!supabase || !sellerUserId) return null

  const { data, error } = await supabase
    .from('seller_profiles')
    .select('shop_name, city, state, phone')
    .eq('user_id', sellerUserId)
    .single()

  if (error) return null
  return data
}

// ---------------------------------------------------------------------------
// Row → camelCase helpers
// ---------------------------------------------------------------------------

export function dbRowToOrder(row) {
  if (!row) return null
  return {
    id: row.id,
    buyerUserId: row.buyer_user_id,
    sellerUserId: row.seller_user_id,
    status: row.status,
    unitPrice: row.unit_price != null ? Number(row.unit_price) : null,
    pricePending: row.price_pending,
    deliveryFee: row.delivery_fee != null ? Number(row.delivery_fee) : null,
    totalAmount: row.total_amount != null ? Number(row.total_amount) : null,
    deliveryAddress: row.delivery_address,
    buyerNote: row.buyer_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (row.order_items || []).map(dbRowToOrderItem),
  }
}

export function dbRowToOrderItem(row) {
  if (!row) return null
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    listingId: row.listing_id,
    quantity: row.quantity,
    unitPrice: row.unit_price != null ? Number(row.unit_price) : null,
    productNameSnapshot: row.product_name_snapshot,
    screeningScoreSnapshot: row.screening_score_snapshot != null
      ? Number(row.screening_score_snapshot)
      : null,
    imagePathSnapshot: row.image_path_snapshot,
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// Status display helpers
// ---------------------------------------------------------------------------

export const ORDER_STATUS_LABELS = {
  PENDING: 'Order Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY_FOR_PICKUP: 'Ready for Pickup',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
}

export const ORDER_STATUS_COLORS = {
  PENDING: 'bg-primary-100 text-primary-700 border border-primary-200',
  ACCEPTED: 'bg-success-100 text-success-700 border border-success-200',
  PREPARING: 'bg-warning-100 text-warning-700 border border-warning-200',
  READY_FOR_PICKUP: 'bg-success-100 text-success-700 border border-success-200',
  OUT_FOR_DELIVERY: 'bg-primary-100 text-primary-700 border border-primary-200',
  DELIVERED: 'bg-success-100 text-success-800 border border-success-200',
  CANCELLED: 'bg-neutral-100 text-neutral-600 border border-neutral-200',
  REJECTED: 'bg-danger-100 text-danger-700 border border-danger-200',
}

export const ORDER_STATUS_TIMELINE = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
]

/**
 * Get the next valid status transition for a seller.
 * Returns null if no valid transition exists.
 */
export function getNextSellerAction(currentStatus) {
  const transitions = {
    PENDING: { next: 'ACCEPTED', label: 'Accept Order', color: 'success' },
    ACCEPTED: { next: 'PREPARING', label: 'Mark Preparing', color: 'warning' },
    PREPARING: { next: 'READY_FOR_PICKUP', label: 'Mark Ready for Pickup', color: 'success' },
    READY_FOR_PICKUP: { next: 'OUT_FOR_DELIVERY', label: 'Mark Out for Delivery', color: 'primary' },
    OUT_FOR_DELIVERY: { next: 'DELIVERED', label: 'Mark Delivered', color: 'success' },
  }
  return transitions[currentStatus] || null
}

/**
 * Get reject action for pending orders.
 */
export function getRejectAction(currentStatus) {
  if (currentStatus === 'PENDING') {
    return { next: 'REJECTED', label: 'Reject Order', color: 'danger' }
  }
  return null
}
