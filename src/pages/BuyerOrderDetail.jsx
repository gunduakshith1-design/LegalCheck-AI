import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Package, Loader2, MapPin, CheckCircle, Clock, XCircle,
  Info, ShoppingBag, Truck,
} from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchBuyerOrderById, dbRowToOrder, cancelOrder, fetchSellerShopInfo,
  ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_STATUS_TIMELINE,
} from '../lib/orderService'
import { generateOrderBill } from '../lib/orderBill'
import {
  fetchDeliveryByOrderId, dbRowToDelivery,
  DELIVERY_STATUS_LABELS, DELIVERY_STATUS_COLORS,
} from '../lib/deliveryService'
import Stepper from '../components/Stepper'

const TIMELINE_ICONS = {
  PENDING: Clock,
  ACCEPTED: CheckCircle,
  PREPARING: Package,
  READY_FOR_PICKUP: CheckCircle,
  OUT_FOR_DELIVERY: Truck,
  DELIVERED: CheckCircle,
}

export default function BuyerOrderDetail() {
  const { orderId } = useParams()
  const { user } = useAuth()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [delivery, setDelivery] = useState(null)
  const [sellerInfo, setSellerInfo] = useState(null)
  const [generatingBill, setGeneratingBill] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  useEffect(() => {
    if (!orderId) return
    setLoading(true)

    Promise.all([
      fetchBuyerOrderById(orderId),
      fetchDeliveryByOrderId(orderId),
    ]).then(([orderResult, deliveryResult]) => {
      if (orderResult.data) {
        const o = dbRowToOrder(orderResult.data)
        setOrder(o)
        // Fetch seller shop name
        if (o?.sellerUserId) {
          fetchSellerShopInfo(o.sellerUserId).then(info => setSellerInfo(info))
        }
      } else {
        setError(orderResult.error || 'Order not found')
      }
      if (deliveryResult.data) {
        setDelivery(dbRowToDelivery(deliveryResult.data))
      }
      setLoading(false)
    })
  }, [orderId])

  const handleDownloadBill = () => {
    if (!order) return
    setGeneratingBill(true)
    try {
      generateOrderBill(order, delivery, sellerInfo)
    } catch (err) {
      console.error('[BuyerOrderDetail] Bill generation failed:', err)
      setError('Failed to generate order bill. Please try again.')
    } finally {
      setGeneratingBill(false)
    }
  }

  const handleCancel = async () => {
    if (cancelling || !order) return
    setCancelling(true)
    try {
      const { error: cancelErr } = await cancelOrder(order.id)
      if (cancelErr) throw new Error(cancelErr)
      setShowCancelDialog(false)
      // Refresh the order
      const { data: refreshed } = await fetchBuyerOrderById(order.id)
      if (refreshed) setOrder(dbRowToOrder(refreshed))
    } catch (err) {
      setError(err.message)
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center shadow-sm">
          <Package className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-1">Order not found</h3>
          <p className="text-sm text-neutral-500 mb-4">{error}</p>
          <Link
            to="/orders"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            <ArrowLeft className="h-4 w-4" />
            My Orders
          </Link>
        </div>
      </div>
    )
  }

  const statusColor = ORDER_STATUS_COLORS[order.status] || ''
  const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status
  const currentTimelineIndex = ORDER_STATUS_TIMELINE.indexOf(order.status)
  const isCancelled = order.status === 'CANCELLED' || order.status === 'REJECTED'
  const canCancel = order.status === 'PENDING'

  // Find timeline index: cancelled/rejected are terminal states
  const timelineIndex = isCancelled ? -1 : currentTimelineIndex

  const firstItem = order.items?.[0]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        to="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium"
      >
        <ArrowLeft className="h-4 w-4" />
        My Orders
      </Link>

      {/* Order header */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Order Details</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Order #{order.id.slice(0, 8)} · Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadBill}
              disabled={generatingBill}
              className="px-3 py-1.5 border border-neutral-300 text-neutral-700 rounded-lg text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 flex items-center gap-1.5"
            >
              {generatingBill ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Download Order Bill
            </button>
            <span className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium ${statusColor}`}>
              {statusLabel}
            </span>
            {canCancel && (
              <button
                onClick={() => setShowCancelDialog(true)}
                disabled={cancelling}
                className="px-3 py-1.5 border border-danger-300 text-danger-600 rounded-lg text-xs font-medium hover:bg-danger-50 disabled:opacity-50 flex items-center gap-1"
              >
                {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                Cancel
              </button>
            )}

            {/* Cancel Order Confirmation Dialog */}
            <ConfirmDialog
              open={showCancelDialog}
              onClose={() => setShowCancelDialog(false)}
              onConfirm={handleCancel}
              title="Cancel this order?"
              description={`Order #${order.id.slice(0, 8)} — ${firstItem?.productNameSnapshot || 'Product'}`}
              warningText="This will mark the order as cancelled. The seller will be notified."
              confirmLabel="Cancel Order"
              confirmVariant="danger"
              loading={cancelling}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Timeline */}
          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-neutral-900 mb-4">Order Status</h2>

            {isCancelled ? (
              <div className="flex items-center gap-3 p-4 bg-neutral-50 rounded-lg border border-neutral-200">
                <XCircle className="h-5 w-5 text-neutral-500" />
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    Order {order.status === 'CANCELLED' ? 'Cancelled' : 'Rejected'}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {order.status === 'CANCELLED'
                      ? 'This order was cancelled and will not be fulfilled.'
                      : 'This order was rejected by the seller.'
                    }
                  </p>
                </div>
              </div>
            ) : (
              <Stepper
                steps={ORDER_STATUS_TIMELINE.map((s) => ({
                  label: ORDER_STATUS_LABELS[s] || s,
                }))}
                currentStep={timelineIndex >= 0 ? timelineIndex : 0}
              />
            )}
          </div>

          {/* Product details */}
          {firstItem && (
            <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-neutral-900 mb-4">Product</h2>
              <div className="flex gap-4">
                <div className="w-16 h-16 bg-neutral-50 rounded-lg overflow-hidden flex-shrink-0">
                  {firstItem.imagePathSnapshot ? (
                    <img
                      src={firstItem.imagePathSnapshot}
                      alt={firstItem.productNameSnapshot}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="h-6 w-6 text-neutral-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-neutral-900">{firstItem.productNameSnapshot}</p>
                  <p className="text-sm text-neutral-500 mt-0.5">
                    Quantity: {firstItem.quantity}
                  </p>
                  {firstItem.screeningScoreSnapshot != null && (
                    <p className="text-xs text-neutral-400 mt-1">
                      Screening score at time of order: {firstItem.screeningScoreSnapshot}%
                    </p>
                  )}
                  {firstItem.unitPrice != null ? (
                    <p className="text-sm font-medium text-neutral-900 mt-1">
                      ₹{firstItem.unitPrice.toFixed(2)} × {firstItem.quantity} = ₹{(firstItem.unitPrice * firstItem.quantity).toFixed(2)}
                    </p>
                  ) : (
                    <p className="text-sm text-warning-600 mt-1">Price: To be confirmed</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Delivery address */}
          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-neutral-900 mb-3">Delivery Address</h2>
            {order.deliveryAddress ? (
              <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 text-sm text-neutral-700 space-y-1">
                <p className="font-medium text-neutral-900">{order.deliveryAddress.full_name}</p>
                <p>{order.deliveryAddress.address_line}</p>
                <p>{order.deliveryAddress.city}, {order.deliveryAddress.state} — {order.deliveryAddress.pin_code}</p>
                <p>Phone: {order.deliveryAddress.phone}</p>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No delivery address recorded.</p>
            )}
          </div>

          {/* Buyer note */}
          {order.buyerNote && (
            <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-neutral-900 mb-3">Note to Seller</h2>
              <p className="text-sm text-neutral-700">{order.buyerNote}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm sticky top-8">
            <h2 className="text-base font-semibold text-neutral-900 mb-4">Order Summary</h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal ({firstItem?.quantity || 0} items)</span>
                <span className="font-medium text-neutral-900">
                  {firstItem?.unitPrice != null
                    ? `₹${(firstItem.unitPrice * firstItem.quantity).toFixed(2)}`
                    : 'To be confirmed'
                  }
                </span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Delivery Fee</span>
                <span className="font-medium text-neutral-900">
                  {order.deliveryFee != null ? `₹${order.deliveryFee.toFixed(2)}` : 'To be confirmed'}
                </span>
              </div>
              <div className="border-t border-neutral-200 pt-3">
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-900">Total</span>
                  <span className="font-semibold text-neutral-900">
                    {order.totalAmount != null ? `₹${order.totalAmount.toFixed(2)}` : 'To be confirmed'}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment notice */}
            <div className="mt-4 p-3 rounded-lg bg-warning-50 border border-warning-100">
              <p className="text-xs text-warning-700">
                <Info className="h-3.5 w-3.5 inline mr-1" />
                Payment is not yet implemented in this prototype.
              </p>
            </div>

            {/* Delivery status */}
            {delivery ? (
              <div className="mt-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-neutral-700">
                    <Truck className="h-3.5 w-3.5 inline mr-1" />
                    {delivery.provider === 'demo' ? 'Demo delivery' : 'Shiprocket'}
                  </p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    DELIVERY_STATUS_COLORS[delivery.status] || ''
                  }`}>
                    {DELIVERY_STATUS_LABELS[delivery.status] || delivery.status}
                  </span>
                </div>
                {delivery.etaMinutes != null && delivery.status !== 'DELIVERED' && (
                  <p className="text-xs text-neutral-500 mt-1">
                    ETA: ~{delivery.etaMinutes} minutes
                  </p>
                )}
                {delivery.courierName && (
                  <p className="text-xs text-neutral-500">
                    Courier: {delivery.courierName}
                  </p>
                )}
                {delivery.awbCode && (
                  <p className="text-xs text-neutral-500">
                    Tracking: {delivery.awbCode}
                  </p>
                )}
                {delivery.trackingUrl && (
                  <a
                    href={delivery.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary-600 hover:text-primary-700 underline"
                  >
                    Track shipment →
                  </a>
                )}
                {delivery.deliveryFee != null && (
                  <p className="text-xs text-neutral-500">
                    Delivery fee: ₹{delivery.deliveryFee.toFixed(2)}
                  </p>
                )}
              </div>
            ) : order.status === 'READY_FOR_PICKUP' ? (
              <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-xs text-blue-700">
                  <Truck className="h-3.5 w-3.5 inline mr-1" />
                  Seller is preparing your delivery.
                </p>
              </div>
            ) : (
              <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-xs text-blue-700">
                  <Truck className="h-3.5 w-3.5 inline mr-1" />
                  Delivery information will appear here once the order is ready for pickup.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
