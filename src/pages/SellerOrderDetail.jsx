import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Package, Loader2, MapPin, CheckCircle, Clock, XCircle,
  Info, User, Truck, PackageCheck,
} from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchSellerOrderById, dbRowToOrder, updateOrderStatus,
  ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_STATUS_TIMELINE,
  getNextSellerAction, getRejectAction,
} from '../lib/orderService'
import {
  fetchDeliveryByOrderId, dbRowToDelivery, createDelivery, updateDeliveryStatus,
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

export default function SellerOrderDetail() {
  const { orderId } = useParams()
  const { user, sellerProfile } = useAuth()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updating, setUpdating] = useState(false)
  const [delivery, setDelivery] = useState(null)
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [packageWeight, setPackageWeight] = useState('')
  const [packageLength, setPackageLength] = useState('')
  const [packageBreadth, setPackageBreadth] = useState('')
  const [packageHeight, setPackageHeight] = useState('')
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showCreateDeliveryDialog, setShowCreateDeliveryDialog] = useState(false)
  const [showMarkDeliveredDialog, setShowMarkDeliveredDialog] = useState(false)

  const loadOrder = async () => {
    if (!orderId) return
    const { data, error: fetchErr } = await fetchSellerOrderById(orderId)
    if (data) {
      setOrder(dbRowToOrder(data))
    } else {
      setError(fetchErr || 'Order not found')
    }
  }

  const loadDelivery = async () => {
    if (!orderId) return
    const { data } = await fetchDeliveryByOrderId(orderId)
    setDelivery(data ? dbRowToDelivery(data) : null)
  }

  useEffect(() => {
    if (!orderId) return
    setLoading(true)
    Promise.all([loadOrder(), loadDelivery()]).finally(() => setLoading(false))
  }, [orderId])

  const handleStatusUpdate = async (newStatus) => {
    if (updating || !order) return
    setUpdating(true)
    setError(null)

    try {
      const { error: updateErr } = await updateOrderStatus(order.id, newStatus)
      if (updateErr) throw new Error(updateErr)
      await Promise.all([loadOrder(), loadDelivery()])
    } catch (err) {
      setError(err.message)
    } finally {
      setUpdating(false)
    }
  }

  // Delivery handlers
  const handleCreateDelivery = async () => {
    if (deliveryLoading || !order || delivery) return
    setShowCreateDeliveryDialog(false)

    const provider = import.meta.env.VITE_DELIVERY_PROVIDER || 'demo'

    // Validate package details for real providers
    if (provider === 'shiprocket') {
      if (!packageWeight || parseFloat(packageWeight) <= 0) {
        setError('Package weight is required for Shiprocket deliveries')
        return
      }
      if (!packageLength || parseFloat(packageLength) <= 0.5) {
        setError('Package length is required (must be > 0.5 cm)')
        return
      }
      if (!packageBreadth || parseFloat(packageBreadth) <= 0.5) {
        setError('Package breadth/width is required (must be > 0.5 cm)')
        return
      }
      if (!packageHeight || parseFloat(packageHeight) <= 0.5) {
        setError('Package height is required (must be > 0.5 cm)')
        return
      }
    }

    setDeliveryLoading(true)
    setError(null)

    try {
      const pickupAddr = order.deliveryAddress || {} // Seller uses their profile address
      const dropAddr = order.deliveryAddress || {}

      const options = {}
      if (provider === 'shiprocket') {
        options.weightKg = parseFloat(packageWeight)
        options.lengthCm = parseFloat(packageLength)
        options.breadthCm = parseFloat(packageBreadth)
        options.heightCm = parseFloat(packageHeight)
        options.pickupLocation = sellerProfile?.shiprocketPickupLocation || null
      }

      const { data, error: createErr } = await createDelivery(
        order.id,
        pickupAddr,
        dropAddr,
        options.weightKg || 1.0,
        options,
      )
      if (createErr) throw new Error(createErr)
      await loadDelivery()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeliveryLoading(false)
    }
  }

  const handleSimulateDelivery = async (newStatus) => {
    if (deliveryLoading || !delivery) return
    setDeliveryLoading(true)
    setError(null)

    try {
      const { error: updateErr } = await updateDeliveryStatus(delivery.id, newStatus)
      if (updateErr) throw new Error(updateErr)
      await Promise.all([loadOrder(), loadDelivery()])
    } catch (err) {
      setError(err.message)
    } finally {
      setDeliveryLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    )
  }

  if (error && !order) {
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
            Back to Orders
          </Link>
        </div>
      </div>
    )
  }

  const statusColor = ORDER_STATUS_COLORS[order.status] || ''
  const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status
  const currentTimelineIndex = ORDER_STATUS_TIMELINE.indexOf(order.status)
  const isCancelled = order.status === 'CANCELLED' || order.status === 'REJECTED'
  const timelineIndex = isCancelled ? -1 : currentTimelineIndex

  const nextAction = getNextSellerAction(order.status)
  const rejectAction = getRejectAction(order.status)

  const firstItem = order.items?.[0]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        to="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Orders
      </Link>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">
          {error}
        </div>
      )}

      {/* Order header */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Order #{order.id.slice(0, 8)}</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            {order.deliveryAddress && (
              <p className="text-xs text-neutral-400 mt-0.5">
                Delivery to: {order.deliveryAddress.city}, {order.deliveryAddress.state}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Actions */}
          {(nextAction || rejectAction) && (
            <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-neutral-900 mb-4">Actions</h2>
              <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                {nextAction && (
                  <button
                    onClick={() => handleStatusUpdate(nextAction.next)}
                    disabled={updating}
                    className={`px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                      nextAction.color === 'success'
                        ? 'bg-success-600 text-white hover:bg-success-700 focus:ring-success-500'
                        : nextAction.color === 'warning'
                          ? 'bg-warning-600 text-white hover:bg-warning-700 focus:ring-warning-500'
                          : 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500'
                    }`}
                  >
                    {updating && <Loader2 className="h-4 w-4 animate-spin" />}
                    {nextAction.label}
                  </button>
                )}
                {rejectAction && (
                  <button
                    onClick={() => setShowRejectDialog(true)}
                    disabled={updating}
                    className="px-5 py-2.5 border-2 border-danger-300 text-danger-600 rounded-lg text-sm font-semibold hover:bg-danger-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-danger-500 focus:ring-offset-2"
                  >
                    {updating && <Loader2 className="h-4 w-4 animate-spin" />}
                    {rejectAction.label}
                  </button>
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-2">
                {order.status === 'PENDING' && 'Accept to confirm the order, or reject if you cannot fulfill it.'}
                {order.status === 'ACCEPTED' && 'Mark as preparing when you start packaging the order.'}
                {order.status === 'PREPARING' && 'Mark as ready when the package is prepared for pickup.'}
              </p>
            </div>
          )}

          {/* Delivery Panel */}
          {order.status === 'READY_FOR_PICKUP' && (
            <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-neutral-900 mb-4">
                <Truck className="h-4 w-4 inline mr-1.5" />
                Delivery
              </h2>

              {delivery ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">
                        {delivery.provider === 'demo' ? 'Demo delivery' : 'Shiprocket'}
                      </p>
                      <p className="text-xs text-neutral-500">
                        ID: {delivery.providerDeliveryId || '—'}
                      </p>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${
                      DELIVERY_STATUS_COLORS[delivery.status] || ''
                    }`}>
                      {DELIVERY_STATUS_LABELS[delivery.status] || delivery.status}
                    </span>
                  </div>

                  {delivery.deliveryFee != null && (
                    <p className="text-sm text-neutral-600">
                      Delivery fee: ₹{delivery.deliveryFee.toFixed(2)}
                    </p>
                  )}
                  {delivery.etaMinutes != null && delivery.status !== 'DELIVERED' && (
                    <p className="text-sm text-neutral-600">
                      ETA: ~{delivery.etaMinutes} minutes
                    </p>
                  )}
                  {delivery.courierName && (
                    <p className="text-sm text-neutral-600">
                      Courier: {delivery.courierName}
                    </p>
                  )}
                  {delivery.awbCode && (
                    <p className="text-sm text-neutral-600">
                      AWB: {delivery.awbCode}
                    </p>
                  )}
                  {delivery.trackingUrl && (
                    <a
                      href={delivery.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary-600 hover:text-primary-700 underline"
                    >
                      Track shipment →
                    </a>
                  )}

                  {/* Demo lifecycle simulation buttons */}
                  {delivery.provider === 'demo' && delivery.status !== 'DELIVERED' && delivery.status !== 'CANCELLED' && (
                    <div className="pt-2 border-t border-neutral-200">
                      <p className="text-xs text-neutral-500 mb-2">Simulate delivery progress (demo):</p>
                      <div className="flex flex-wrap gap-2">
                        {delivery.status === 'CREATED' && (
                          <button
                            onClick={() => handleSimulateDelivery('ASSIGNED')}
                            disabled={deliveryLoading}
                            className="px-3 py-1.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 disabled:opacity-50"
                          >
                            {deliveryLoading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : 'Assign Rider'}
                          </button>
                        )}
                        {delivery.status === 'ASSIGNED' && (
                          <button
                            onClick={() => handleSimulateDelivery('PICKED_UP')}
                            disabled={deliveryLoading}
                            className="px-3 py-1.5 text-xs font-medium bg-success-100 text-success-700 rounded-lg hover:bg-success-200 disabled:opacity-50"
                          >
                            {deliveryLoading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : 'Mark Picked Up'}
                          </button>
                        )}
                        {delivery.status === 'PICKED_UP' && (
                          <button
                            onClick={() => handleSimulateDelivery('OUT_FOR_DELIVERY')}
                            disabled={deliveryLoading}
                            className="px-3 py-1.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 disabled:opacity-50"
                          >
                            {deliveryLoading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : 'Out for Delivery'}
                          </button>
                        )}
                        {delivery.status === 'OUT_FOR_DELIVERY' && (
                          <button
                            onClick={() => setShowMarkDeliveredDialog(true)}
                            disabled={deliveryLoading}
                            className="px-3 py-1.5 text-xs font-medium bg-success-100 text-success-700 rounded-lg hover:bg-success-200 disabled:opacity-50"
                          >
                            {deliveryLoading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : 'Mark Delivered'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-neutral-500">
                    No delivery created yet.
                  </p>

                  {/* Package details — required for Shiprocket, optional for demo */}
                  {(() => {
                    const provider = import.meta.env.VITE_DELIVERY_PROVIDER || 'demo'
                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-neutral-700 mb-1">
                              Package weight (kg) {provider === 'shiprocket' && <span className="text-danger-600">*</span>}
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              value={packageWeight}
                              onChange={(e) => setPackageWeight(e.target.value)}
                              placeholder="e.g. 1.0"
                              className="w-full px-3 py-1.5 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-neutral-700 mb-1">
                              Length (cm) {provider === 'shiprocket' && <span className="text-danger-600">*</span>}
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min="0.5"
                              value={packageLength}
                              onChange={(e) => setPackageLength(e.target.value)}
                              placeholder="e.g. 20"
                              className="w-full px-3 py-1.5 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-neutral-700 mb-1">
                              Width (cm) {provider === 'shiprocket' && <span className="text-danger-600">*</span>}
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min="0.5"
                              value={packageBreadth}
                              onChange={(e) => setPackageBreadth(e.target.value)}
                              placeholder="e.g. 15"
                              className="w-full px-3 py-1.5 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-neutral-700 mb-1">
                              Height (cm) {provider === 'shiprocket' && <span className="text-danger-600">*</span>}
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min="0.5"
                              value={packageHeight}
                              onChange={(e) => setPackageHeight(e.target.value)}
                              placeholder="e.g. 10"
                              className="w-full px-3 py-1.5 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                          </div>
                        </div>
                        {provider === 'shiprocket' && (
                          <p className="text-xs text-warning-600">
                            Package dimensions are required for real Shiprocket shipments.
                            These are shipping package dimensions, not legal metrology quantities.
                          </p>
                        )}
                      </div>
                    )
                  })()}

                  <button
                    onClick={() => setShowCreateDeliveryDialog(true)}
                    disabled={deliveryLoading}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {deliveryLoading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                    ) : (
                      <><PackageCheck className="h-4 w-4" /> Create Delivery</>
                    )}
                  </button>
                  <p className="text-xs text-neutral-400">
                    {(() => {
                      const provider = import.meta.env.VITE_DELIVERY_PROVIDER || 'demo'
                      return provider === 'shiprocket'
                        ? 'Shiprocket will be used for real courier delivery.'
                        : 'Demo provider will be used. No real courier will be assigned.'
                    })()}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Order Timeline */}
          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-neutral-900 mb-4">Order Timeline</h2>

            {isCancelled ? (
              <div className="flex items-center gap-3 p-4 bg-neutral-50 rounded-lg border border-neutral-200">
                <XCircle className="h-5 w-5 text-neutral-500" />
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    Order {order.status === 'CANCELLED' ? 'Cancelled' : 'Rejected'}
                  </p>
                  <p className="text-xs text-neutral-500">
                    This order will not be fulfilled.
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

          {/* Buyer delivery address */}
          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-neutral-900 mb-3">
              <User className="h-4 w-4 inline mr-1.5" />
              Delivery Address
            </h2>
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
              <h2 className="text-base font-semibold text-neutral-900 mb-3">Buyer Note</h2>
              <p className="text-sm text-neutral-700">{order.buyerNote}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {/* Order summary */}
          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-neutral-900 mb-4">Order Summary</h2>

            {/* Product */}
            {firstItem && (
              <div className="flex gap-3 mb-4">
                <div className="w-12 h-12 bg-neutral-50 rounded-lg overflow-hidden flex-shrink-0">
                  {firstItem.imagePathSnapshot ? (
                    <img
                      src={firstItem.imagePathSnapshot}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="h-5 w-5 text-neutral-300" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">
                    {firstItem.productNameSnapshot}
                  </p>
                  <p className="text-xs text-neutral-500">
                    Qty: {firstItem.quantity}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-3 text-sm border-t border-neutral-200 pt-4">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span>
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
          </div>

          {/* Screening snapshot */}
          {firstItem?.screeningScoreSnapshot != null && (
            <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-neutral-900 mb-3">Screening Snapshot</h2>
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <p className="text-sm text-neutral-600">Score at order time:</p>
                <p className={`text-lg font-bold ${
                  firstItem.screeningScoreSnapshot >= 70 ? 'text-success-700' : 'text-danger-700'
                }`}>
                  {firstItem.screeningScoreSnapshot}%
                </p>
              </div>
            </div>
          )}

          {/* Prototype notice */}
          <div className="p-3 rounded-lg bg-warning-50 border border-warning-100">
            <p className="text-xs text-warning-700">
              <Info className="h-3.5 w-3.5 inline mr-1" />
              Payment verification and courier integration are not yet implemented. This is prototype functionality.
            </p>
          </div>
        </div>
      </div>

      {/* Reject Order Confirmation Dialog */}
      <ConfirmDialog
        open={showRejectDialog}
        onClose={() => setShowRejectDialog(false)}
        onConfirm={() => {
          setShowRejectDialog(false)
          handleStatusUpdate(rejectAction?.next)
        }}
        title="Reject this order?"
        description={`Order #${order.id.slice(0, 8)} — ${firstItem?.productNameSnapshot || 'Product'} (Qty: ${firstItem?.quantity || 1})`}
        warningText="This will mark the order as rejected. The buyer will be notified."
        confirmLabel="Reject Order"
        confirmVariant="danger"
        loading={updating}
      />

      {/* Create Delivery Confirmation Dialog */}
      <ConfirmDialog
        open={showCreateDeliveryDialog}
        onClose={() => setShowCreateDeliveryDialog(false)}
        onConfirm={handleCreateDelivery}
        title="Create shipment?"
        description={`Order #${order.id.slice(0, 8)} — ${firstItem?.productNameSnapshot || 'Product'}`}
        warningText={(() => {
          const provider = import.meta.env.VITE_DELIVERY_PROVIDER || 'demo'
          return provider === 'shiprocket'
            ? 'A real Shiprocket shipment will be created. This action cannot be undone.'
            : 'A demo delivery will be created for testing purposes. No real courier will be assigned.'
        })()}
        confirmLabel="Create Delivery"
        confirmVariant="primary"
        loading={deliveryLoading}
      />

      {/* Mark Delivered Confirmation Dialog */}
      <ConfirmDialog
        open={showMarkDeliveredDialog}
        onClose={() => setShowMarkDeliveredDialog(false)}
        onConfirm={() => {
          setShowMarkDeliveredDialog(false)
          handleSimulateDelivery('DELIVERED')
        }}
        title="Mark as delivered?"
        description={`Order #${order.id.slice(0, 8)} — ${firstItem?.productNameSnapshot || 'Product'}`}
        warningText="This will mark the order as delivered and notify the buyer."
        confirmLabel="Mark Delivered"
        confirmVariant="warning"
        loading={deliveryLoading}
      />
    </div>
  )
}
