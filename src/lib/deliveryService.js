import { supabase } from './supabase'

/**
 * Delivery Service — Supabase operations for delivery management.
 *
 * All delivery creation and status updates go through
 * SECURITY DEFINER functions. This service handles the client-side
 * queries and function calls.
 */

// ---------------------------------------------------------------------------
// Delivery status constants
// ---------------------------------------------------------------------------

export const DELIVERY_STATUS = {
  QUOTE_AVAILABLE: 'QUOTE_AVAILABLE',
  CREATED: 'CREATED',
  ASSIGNED: 'ASSIGNED',
  PICKED_UP: 'PICKED_UP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
}

export const DELIVERY_STATUS_LABELS = {
  QUOTE_AVAILABLE: 'Quote Available',
  CREATED: 'Delivery Created',
  ASSIGNED: 'Rider Assigned',
  PICKED_UP: 'Picked Up',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
}

export const DELIVERY_STATUS_COLORS = {
  QUOTE_AVAILABLE: 'bg-primary-100 text-primary-700 border border-primary-200',
  CREATED: 'bg-warning-100 text-warning-700 border border-warning-200',
  ASSIGNED: 'bg-primary-100 text-primary-700 border border-primary-200',
  PICKED_UP: 'bg-success-100 text-success-700 border border-success-200',
  OUT_FOR_DELIVERY: 'bg-primary-100 text-primary-700 border border-primary-200',
  DELIVERED: 'bg-success-100 text-success-800 border border-success-200',
  CANCELLED: 'bg-neutral-100 text-neutral-600 border border-neutral-200',
  FAILED: 'bg-danger-100 text-danger-700 border border-danger-200',
}

// ---------------------------------------------------------------------------
// Fetch delivery for an order
// ---------------------------------------------------------------------------

/**
 * Fetch the delivery record for a specific order.
 * RLS ensures buyer/seller can only see their own.
 */
export async function fetchDeliveryByOrderId(orderId) {
  if (!supabase || !orderId) return { data: null, error: null }

  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .eq('order_id', orderId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return { data: null, error: null }
    console.error('[DeliveryService] fetchDeliveryByOrderId failed:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// Create delivery (seller action)
// ---------------------------------------------------------------------------

/**
 * Create a delivery for an order in READY_FOR_PICKUP status.
 * For demo provider: generates deterministic delivery ID locally.
 * For shiprocket: calls backend to create real order, then stores result.
 */
export async function createDelivery(orderId, pickupAddress, dropAddress, weightKg = 1.0, options = {}) {
  if (!supabase || !orderId) return { data: null, error: 'Supabase not configured' }

  // Get the active provider from env (frontend knows this for display only)
  const provider = import.meta.env.VITE_DELIVERY_PROVIDER || 'demo'

  // For demo provider, generate a deterministic delivery ID
  let providerDeliveryId = null
  let status = 'CREATED'
  let deliveryFee = null
  let etaMinutes = null
  let courierName = null
  let providerPayload = null
  let trackingUrl = null
  let awbCode = null
  let providerOrderId = null
  let providerShipmentId = null
  let lengthCm = options.lengthCm || null
  let breadthCm = options.breadthCm || null
  let heightCm = options.heightCm || null
  let pickupLocation = options.pickupLocation || null

  if (provider === 'demo') {
    // Demo provider: deterministic ID and simulated data
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(orderId)
    )
    const hashHex = Array.from(new Uint8Array(hash))
      .slice(0, 4)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
    providerDeliveryId = `DEMO-DELIVERY-${hashHex}`
    deliveryFee = 49 + (10 * weightKg)
    etaMinutes = 45
    courierName = 'Demo Courier Partner'
    status = 'CREATED'
  }
  // Shiprocket: the frontend does NOT create the order directly.
  // The order is created via the backend API which has the credentials.
  // For now, we store the result from the backend response.
  // The backend call would have been made before this function.
  else if (provider === 'shiprocket' && options.backendResult) {
    const br = options.backendResult
    providerDeliveryId = br.provider_delivery_id || null
    providerOrderId = br.sr_order_id || null
    providerShipmentId = br.shipment_id || null
    deliveryFee = br.delivery_fee || null
    etaMinutes = br.eta_minutes || null
    courierName = br.courier_name || null
    trackingUrl = br.tracking_url || null
    awbCode = br.awb_code || null
    providerPayload = br.raw_response || null
    status = 'CREATED'
  }

  const { data, error } = await supabase.rpc('create_delivery', {
    p_order_id: orderId,
    p_provider: provider,
    p_provider_delivery_id: providerDeliveryId,
    p_status: status,
    p_pickup_address: pickupAddress || {},
    p_drop_address: dropAddress || {},
    p_delivery_fee: deliveryFee,
    p_eta_minutes: etaMinutes,
    p_tracking_url: trackingUrl,
    p_courier_name: courierName,
    p_awb_code: awbCode,
    p_provider_payload: providerPayload,
    p_weight_kg: weightKg,
  })

  if (error) {
    console.error('[DeliveryService] createDelivery failed:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// Update delivery status (seller action for demo)
// ---------------------------------------------------------------------------

/**
 * Update delivery status. For demo provider, seller simulates the lifecycle.
 */
export async function updateDeliveryStatus(deliveryId, newStatus, options = {}) {
  if (!supabase || !deliveryId) return { data: null, error: 'Supabase not configured' }

  const { data, error } = await supabase.rpc('update_delivery_status', {
    p_delivery_id: deliveryId,
    p_new_status: newStatus,
    p_tracking_url: options.trackingUrl || null,
    p_courier_name: options.courierName || null,
    p_awb_code: options.awbCode || null,
    p_provider_payload: options.providerPayload || null,
  })

  if (error) {
    console.error('[DeliveryService] updateDeliveryStatus failed:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// Row → camelCase helpers
// ---------------------------------------------------------------------------

export function dbRowToDelivery(row) {
  if (!row) return null
  return {
    id: row.id,
    orderId: row.order_id,
    provider: row.provider,
    providerDeliveryId: row.provider_delivery_id,
    status: row.status,
    pickupAddress: row.pickup_address,
    dropAddress: row.drop_address,
    deliveryFee: row.delivery_fee != null ? Number(row.delivery_fee) : null,
    etaMinutes: row.eta_minutes,
    trackingUrl: row.tracking_url,
    courierName: row.courier_name,
    awbCode: row.awb_code,
    providerPayload: row.provider_payload,
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
    providerOrderId: row.provider_order_id || null,
    providerShipmentId: row.provider_shipment_id || null,
    lengthCm: row.length_cm != null ? Number(row.length_cm) : null,
    breadthCm: row.breadth_cm != null ? Number(row.breadth_cm) : null,
    heightCm: row.height_cm != null ? Number(row.height_cm) : null,
    pickupLocation: row.pickup_location || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
