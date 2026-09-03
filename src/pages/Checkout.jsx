import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Package, Loader2, MapPin, Minus, Plus,
  ShoppingBag, AlertTriangle, CheckCircle, Info, CreditCard,
  Truck, ClipboardCheck, Shield,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { fetchPublicProduct, dbRowToPublicProduct } from '../lib/storeService'
import { placeOrder } from '../lib/orderService'

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa',
  'Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
  'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland',
  'Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Delhi','Jammu & Kashmir','Ladakh','Chandigarh','Puducherry',
]

const INITIAL_ADDRESS = {
  full_name: '',
  phone: '',
  address_line: '',
  city: '',
  state: '',
  pin_code: '',
}

const STEPS = [
  { key: 'details', label: 'Delivery Details', icon: Truck },
  { key: 'review', label: 'Review Order', icon: ClipboardCheck },
]

function StepIndicator({ currentStep }) {
  const currentIdx = STEPS.findIndex(s => s.key === currentStep)
  return (
    <nav aria-label="Checkout progress" className="flex items-center gap-2 mb-6">
      {STEPS.map((step, idx) => {
        const Icon = step.icon
        const isCompleted = idx < currentIdx
        const isCurrent = idx === currentIdx
        return (
          <React.Fragment key={step.key}>
            {idx > 0 && (
              <div className={`hidden sm:block flex-1 h-px ${isCompleted ? 'bg-success-400' : 'bg-neutral-200'}`} />
            )}
            <div className="flex items-center gap-2" aria-current={isCurrent ? 'step' : undefined}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-medium ${
                isCompleted ? 'bg-success-100 text-success-700' :
                isCurrent ? 'bg-primary-100 text-primary-700' :
                'bg-neutral-100 text-neutral-400'
              }`}>
                {isCompleted ? <CheckCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-sm font-medium hidden sm:inline ${
                isCurrent ? 'text-primary-700' : isCompleted ? 'text-success-700' : 'text-neutral-400'
              }`}>
                {step.label}
              </span>
            </div>
          </React.Fragment>
        )
      })}
    </nav>
  )
}

export default function Checkout() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [quantity, setQuantity] = useState(1)
  const [address, setAddress] = useState(INITIAL_ADDRESS)
  const [buyerNote, setBuyerNote] = useState('')
  const [step, setStep] = useState('details')
  const [placing, setPlacing] = useState(false)
  const [orderResult, setOrderResult] = useState(null)
  const [addressErrors, setAddressErrors] = useState({})

  useEffect(() => {
    if (!productId) return
    setLoading(true)
    fetchPublicProduct(productId).then(({ data, error: fetchErr }) => {
      if (data) {
        setProduct(dbRowToPublicProduct(data))
      } else {
        setError(fetchErr || 'Product not found or not currently listed.')
      }
      setLoading(false)
    })
  }, [productId])

  const validateAddress = () => {
    const errors = {}
    if (!address.full_name.trim()) errors.full_name = 'Full name is required'
    if (!address.phone.trim()) errors.phone = 'Phone number is required'
    else if (!/^[6-9]\d{9}$/.test(address.phone.trim())) errors.phone = 'Enter a valid 10-digit Indian mobile number'
    if (!address.address_line.trim()) errors.address_line = 'Address is required'
    if (!address.city.trim()) errors.city = 'City is required'
    if (!address.state.trim()) errors.state = 'State is required'
    if (!address.pin_code.trim()) errors.pin_code = 'PIN code is required'
    else if (!/^\d{6}$/.test(address.pin_code.trim())) errors.pin_code = 'Enter a valid 6-digit PIN code'
    setAddressErrors(errors)
    return Object.keys(errors).length === 0
  }

  const isEligible = product && product.screeningScore != null && product.screeningScore >= 70

  const handleProceedToReview = (e) => {
    e.preventDefault()
    if (!validateAddress()) return
    setStep('review')
  }

  const handlePlaceOrder = async () => {
    if (placing) return
    setPlacing(true)
    setError(null)

    try {
      const { data, error: orderErr } = await placeOrder(
        productId,
        quantity,
        address,
        buyerNote.trim() || null,
      )
      if (orderErr) throw new Error(orderErr)
      setOrderResult(data)
      setStep('success')
    } catch (err) {
      console.error('[Checkout] Place order failed:', err)
      setError(err.message)
    } finally {
      setPlacing(false)
    }
  }

  const subtotal = product?.listingPrice != null ? product.listingPrice * quantity : null
  const hasMrp = product?.mrp != null && product.mrp > 0
  const sellingBelowMrp = hasMrp && product.listingPrice != null && product.listingPrice < product.mrp
  const mrpSaving = sellingBelowMrp ? (product.mrp - product.listingPrice) * quantity : null

  // Loading
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    )
  }

  // Error loading product
  if (error && !product) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center shadow-sm">
          <Package className="h-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-1">Product not available</h3>
          <p className="text-sm text-neutral-500 mb-4">{error}</p>
          <Link
            to="/stores"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Browse Stores
          </Link>
        </div>
      </div>
    )
  }

  // Product not eligible
  if (product && !isEligible) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center shadow-sm">
          <AlertTriangle className="h-12 w-12 text-warning-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-1">Currently unavailable for ordering</h3>
          <p className="text-sm text-neutral-500 mb-4">
            This product does not meet the screening threshold required for ordering.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to={`/stores/${product.storeId}/products/${productId}`}
              className="px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-50"
            >
              View Screening Report
            </Link>
            <Link
              to={product.storeId ? `/stores/${product.storeId}` : '/stores'}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
            >
              Back to Store
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Success screen
  if (step === 'success' && orderResult) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-8 sm:p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-success-100 rounded-full mx-auto mb-4 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-success-600" />
          </div>
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">Order Placed Successfully!</h2>
          <p className="text-sm text-neutral-500 mb-6">
            Your order has been placed and is awaiting seller confirmation.
          </p>

          {/* Order details card */}
          <div className="max-w-md mx-auto text-left p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Order ID</span>
              <span className="font-mono text-neutral-900 text-xs">{orderResult.order_id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Product</span>
              <span className="font-medium text-neutral-900 truncate max-w-[200px]">{product.productName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Quantity</span>
              <span className="font-medium text-neutral-900">{quantity}</span>
            </div>
            {subtotal != null && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Subtotal</span>
                <span className="font-medium text-neutral-900">₹{subtotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Delivery Fee</span>
              <span className="text-warning-700 text-xs">To be confirmed</span>
            </div>
            <div className="flex justify-between text-sm border-t border-neutral-200 pt-2">
              <span className="text-neutral-500">Order Status</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
                PENDING
              </span>
            </div>
          </div>

          {/* Payment notice */}
          <div className="max-w-md mx-auto p-3 rounded-lg bg-warning-50 border border-warning-100 mb-6">
            <p className="text-xs text-warning-700">
              <CreditCard className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
              Payment integration will be added in the production release. No payment has been collected.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/orders"
              className="w-full sm:w-auto px-6 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 text-center"
            >
              View Order
            </Link>
            <Link
              to={product.storeId ? `/stores/${product.storeId}` : '/stores'}
              className="w-full sm:w-auto px-6 py-2.5 border border-neutral-300 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-50 text-center"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        to={product.storeId ? `/stores/${product.storeId}/products/${productId}` : '/stores'}
        className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium"
      >
        <ArrowLeft className="h-4 w-4" />
        {step === 'review' ? 'Back to Edit' : 'Back to Product'}
      </Link>

      {/* Step indicator */}
      <StepIndicator currentStep={step} />

      {/* Header */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-900">
          {step === 'review' ? 'Review Your Order' : 'Checkout'}
        </h1>
        <p className="text-neutral-600 mt-1">
          {step === 'review' ? 'Confirm your order details before placing' : 'Complete your order details'}
        </p>
      </div>

      {/* Order error */}
      {error && (
        <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm" role="alert">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Product card */}
          <div className="bg-white rounded-lg border border-neutral-200 p-5 shadow-sm">
            <div className="flex gap-4">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-neutral-50 rounded-lg overflow-hidden flex-shrink-0">
                {product.imagePath ? (
                  <img src={product.imagePath} alt={product.productName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-6 w-6 text-neutral-300" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-neutral-900 truncate">{product.productName}</h3>
                {product.storeId && (
                  <p className="text-xs text-neutral-500 mt-0.5">
                    From: {product.shopName}
                  </p>
                )}
                {product.screeningScore != null && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      product.screeningScore >= 70
                        ? 'bg-success-50 text-success-700 border border-success-200'
                        : 'bg-danger-50 text-danger-700 border border-danger-200'
                    }`}>
                      Screened · {Math.round(product.screeningScore)}%
                    </span>
                  </div>
                )}
                {/* Price display */}
                <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                  {product.listingPrice != null && (
                    <span className="text-lg font-semibold text-neutral-900">₹{product.listingPrice.toFixed(2)}</span>
                  )}
                  {hasMrp && (
                    <span className="text-sm text-neutral-400 line-through">MRP ₹{product.mrp.toFixed(2)}</span>
                  )}
                  {sellingBelowMrp && (
                    <span className="text-xs font-medium text-success-700 bg-success-50 px-1.5 py-0.5 rounded">
                      Save ₹{(product.mrp - product.listingPrice).toFixed(0)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quantity */}
          <div className="bg-white rounded-lg border border-neutral-200 p-5 shadow-sm">
            <h2 className="text-base font-semibold text-neutral-900 mb-3">Quantity</h2>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={step === 'review' || quantity <= 1}
                aria-label="Decrease quantity"
                className="w-10 h-10 rounded-lg border border-neutral-300 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-12 text-center text-lg font-semibold text-neutral-900" aria-live="polite">{quantity}</span>
              <button
                onClick={() => setQuantity(Math.min(10, quantity + 1))}
                disabled={step === 'review' || quantity >= 10}
                aria-label="Increase quantity"
                className="w-10 h-10 rounded-lg border border-neutral-300 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-4 w-4" />
              </button>
              <span className="text-xs text-neutral-400">Max 10</span>
            </div>
          </div>

          {/* Delivery Address — Details step */}
          {step !== 'review' && (
            <form onSubmit={handleProceedToReview} className="bg-white rounded-lg border border-neutral-200 p-5 shadow-sm space-y-4">
              <h2 className="text-base font-semibold text-neutral-900">Delivery Address</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="full_name" className="block text-sm font-medium text-neutral-700 mb-1">Full Name *</label>
                  <input
                    id="full_name"
                    type="text"
                    value={address.full_name}
                    onChange={(e) => setAddress({ ...address, full_name: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      addressErrors.full_name ? 'border-danger-400' : 'border-neutral-300'
                    }`}
                    placeholder="Receiver's full name"
                    aria-required="true"
                    aria-invalid={!!addressErrors.full_name}
                  />
                  {addressErrors.full_name && (
                    <p className="text-xs text-danger-600 mt-1" role="alert">{addressErrors.full_name}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-neutral-700 mb-1">Phone *</label>
                  <input
                    id="phone"
                    type="tel"
                    value={address.phone}
                    onChange={(e) => setAddress({ ...address, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      addressErrors.phone ? 'border-danger-400' : 'border-neutral-300'
                    }`}
                    placeholder="10-digit mobile number"
                    maxLength={10}
                    aria-required="true"
                    aria-invalid={!!addressErrors.phone}
                  />
                  {addressErrors.phone && (
                    <p className="text-xs text-danger-600 mt-1" role="alert">{addressErrors.phone}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="address_line" className="block text-sm font-medium text-neutral-700 mb-1">Address Line *</label>
                <input
                  id="address_line"
                  type="text"
                  value={address.address_line}
                  onChange={(e) => setAddress({ ...address, address_line: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    addressErrors.address_line ? 'border-danger-400' : 'border-neutral-300'
                  }`}
                  placeholder="House/Flat no., Street, Locality"
                  aria-required="true"
                  aria-invalid={!!addressErrors.address_line}
                />
                {addressErrors.address_line && (
                  <p className="text-xs text-danger-600 mt-1" role="alert">{addressErrors.address_line}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-neutral-700 mb-1">City *</label>
                  <input
                    id="city"
                    type="text"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      addressErrors.city ? 'border-danger-400' : 'border-neutral-300'
                    }`}
                    placeholder="City"
                    aria-required="true"
                    aria-invalid={!!addressErrors.city}
                  />
                  {addressErrors.city && (
                    <p className="text-xs text-danger-600 mt-1" role="alert">{addressErrors.city}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-neutral-700 mb-1">State *</label>
                  <select
                    id="state"
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      addressErrors.state ? 'border-danger-400' : 'border-neutral-300'
                    }`}
                    aria-required="true"
                    aria-invalid={!!addressErrors.state}
                  >
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  {addressErrors.state && (
                    <p className="text-xs text-danger-600 mt-1" role="alert">{addressErrors.state}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="pin_code" className="block text-sm font-medium text-neutral-700 mb-1">PIN Code *</label>
                  <input
                    id="pin_code"
                    type="text"
                    value={address.pin_code}
                    onChange={(e) => setAddress({ ...address, pin_code: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      addressErrors.pin_code ? 'border-danger-400' : 'border-neutral-300'
                    }`}
                    placeholder="6-digit PIN"
                    maxLength={6}
                    aria-required="true"
                    aria-invalid={!!addressErrors.pin_code}
                  />
                  {addressErrors.pin_code && (
                    <p className="text-xs text-danger-600 mt-1" role="alert">{addressErrors.pin_code}</p>
                  )}
                </div>
              </div>

              {/* Buyer note */}
              <div>
                <label htmlFor="buyer_note" className="block text-sm font-medium text-neutral-700 mb-1">
                  Note to Seller <span className="text-neutral-400">(optional)</span>
                </label>
                <textarea
                  id="buyer_note"
                  value={buyerNote}
                  onChange={(e) => setBuyerNote(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Any special instructions for delivery..."
                  maxLength={500}
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 flex items-center gap-2"
                >
                  Review Order
                </button>
              </div>
            </form>
          )}

          {/* Review step: address summary */}
          {step === 'review' && (
            <div className="bg-white rounded-lg border border-neutral-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-neutral-900">Delivery Address</h2>
                <button
                  onClick={() => setStep('details')}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                >
                  Edit
                </button>
              </div>
              <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 text-sm text-neutral-700 space-y-1">
                <p className="font-medium text-neutral-900">{address.full_name}</p>
                <p>{address.address_line}</p>
                <p>{address.city}, {address.state} — {address.pin_code}</p>
                <p>Phone: {address.phone}</p>
              </div>

              {buyerNote.trim() && (
                <div>
                  <p className="text-xs font-medium text-neutral-500 mb-1">Note to Seller</p>
                  <p className="text-sm text-neutral-700">{buyerNote}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Order summary sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-neutral-200 p-5 shadow-sm lg:sticky lg:top-8">
            <h2 className="text-base font-semibold text-neutral-900 mb-4">Order Summary</h2>

            <div className="space-y-3 text-sm">
              {/* Unit price */}
              <div className="flex justify-between text-neutral-600">
                <span>Unit Price</span>
                <span className="font-medium text-neutral-900">
                  {product.listingPrice != null ? `₹${product.listingPrice.toFixed(2)}` : 'To be confirmed'}
                </span>
              </div>

              {/* MRP */}
              {hasMrp && (
                <div className="flex justify-between text-neutral-500">
                  <span>Printed MRP</span>
                  <span className="line-through">₹{product.mrp.toFixed(2)}</span>
                </div>
              )}

              {/* Savings */}
              {sellingBelowMrp && (
                <div className="flex justify-between text-success-700">
                  <span>Savings</span>
                  <span className="font-medium">-₹{(product.mrp - product.listingPrice).toFixed(2)} per unit</span>
                </div>
              )}

              {/* Quantity */}
              <div className="flex justify-between text-neutral-600">
                <span>Quantity</span>
                <span className="font-medium text-neutral-900">{quantity}</span>
              </div>

              {/* Subtotal */}
              <div className="border-t border-neutral-200 pt-3">
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-900">Subtotal</span>
                  <span className="font-semibold text-neutral-900">
                    {subtotal != null ? `₹${subtotal.toFixed(2)}` : 'To be confirmed'}
                  </span>
                </div>
              </div>

              {/* Delivery fee */}
              <div className="flex justify-between text-neutral-600">
                <span className="flex items-center gap-1">
                  <Truck className="h-3.5 w-3.5" />
                  Delivery Fee
                </span>
                <span className="text-warning-700 text-xs font-medium">To be confirmed</span>
              </div>
            </div>

            {/* Delivery fee explanation */}
            <div className="mt-3 p-2.5 rounded-lg bg-neutral-50 border border-neutral-200">
              <p className="text-xs text-neutral-500">
                Final delivery charges are confirmed when the seller arranges shipping.
              </p>
            </div>

            {/* Payment notice */}
            <div className="mt-3 p-2.5 rounded-lg bg-warning-50 border border-warning-100">
              <p className="text-xs text-warning-700">
                <CreditCard className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                Payment integration will be added in the production release. No payment is collected at this time.
              </p>
            </div>

            {/* Screening disclaimer */}
            <div className="mt-3 p-2.5 rounded-lg bg-blue-50 border border-blue-100">
              <p className="text-xs text-blue-700">
                <Shield className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                This product meets the prototype screening threshold. The screening score is not a legal certification.
              </p>
            </div>

            {/* Place Order button — review step only */}
            {step === 'review' && (
              <button
                onClick={handlePlaceOrder}
                disabled={placing}
                className="mt-4 w-full px-4 py-3 bg-success-600 text-white rounded-lg text-sm font-semibold hover:bg-success-700 focus:outline-none focus:ring-2 focus:ring-success-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {placing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Placing Order...
                  </>
                ) : (
                  <>
                    <ShoppingBag className="h-4 w-4" />
                    Place Order
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
