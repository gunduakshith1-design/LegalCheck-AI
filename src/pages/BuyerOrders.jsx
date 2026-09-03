import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Package, ShoppingBag, Store as StoreIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { fetchBuyerOrders, dbRowToOrder, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../lib/orderService'
import AnimatedListItem from '../components/AnimatedListItem'

export default function BuyerOrders() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)

    fetchBuyerOrders(user.id)
      .then(({ data, error: fetchErr }) => {
        if (fetchErr) {
          setError(fetchErr)
        } else {
          setOrders(data.map(dbRowToOrder))
        }
        setLoading(false)
      })
  }, [user?.id])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-900">My Orders</h1>
        <p className="text-neutral-600 mt-1">
          Track your orders and delivery status
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">
          {error}
        </div>
      )}

      {/* Orders list */}
      {orders.length === 0 ? (
        <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center shadow-sm">
          <ShoppingBag className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-1">No orders yet</h3>
          <p className="text-sm text-neutral-500 mb-4">
            Browse stores and place your first order to see it here.
          </p>
          <Link
            to="/stores"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            <StoreIcon className="h-4 w-4" />
            Browse Stores
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm">
          <div className="divide-y divide-neutral-200">
            {orders.map((order, idx) => {
              const firstItem = order.items?.[0]
              const statusColor = ORDER_STATUS_COLORS[order.status] || ''
              const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status

              return (
                <AnimatedListItem key={order.id} index={idx}>
                <Link
                  to={`/orders/${order.id}`}
                  className="px-6 py-4 hover:bg-neutral-50 transition-colors block"
                >
                  <div className="flex items-center gap-4">
                    {/* Product image */}
                    <div className="w-12 h-12 bg-neutral-50 rounded-lg overflow-hidden flex-shrink-0">
                      {firstItem?.imagePathSnapshot ? (
                        <img
                          src={firstItem.imagePathSnapshot}
                          alt={firstItem.productNameSnapshot}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-5 w-5 text-neutral-300" />
                        </div>
                      )}
                    </div>

                    {/* Order info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-neutral-900 truncate">
                          {firstItem?.productNameSnapshot || 'Product'}
                        </h3>
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        Order #{order.id.slice(0, 8)} · {new Date(order.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>

                    {/* Quantity + Total + Status */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-medium text-neutral-900">
                          Qty: {firstItem?.quantity || '—'}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {order.totalAmount != null
                            ? `₹${order.totalAmount.toFixed(2)}`
                            : 'Price pending'
                          }
                        </p>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                </Link>
                </AnimatedListItem>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
