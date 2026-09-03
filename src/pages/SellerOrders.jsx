import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Package, ShoppingBag, Filter, Bell } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'
import { fetchSellerOrders, dbRowToOrder, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../lib/orderService'
import AnimatedListItem from '../components/AnimatedListItem'

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All Orders' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'PREPARING', label: 'Preparing' },
  { value: 'READY_FOR_PICKUP', label: 'Ready' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
]

export default function SellerOrders() {
  const { user } = useAuth()
  const { notifications } = useNotifications()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Track which order IDs are from recent notifications
  const notifiedOrderIds = new Set(
    notifications
      .filter(n => n.type === 'new_order' && !n.read)
      .map(n => n.orderId)
  )

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)

    fetchSellerOrders(user.id)
      .then(({ data, error: fetchErr }) => {
        if (fetchErr) {
          setError(fetchErr)
        } else {
          setOrders(data.map(dbRowToOrder))
        }
        setLoading(false)
      })
  }, [user?.id])

  const filteredOrders = statusFilter === 'ALL'
    ? orders
    : orders.filter((o) => o.status === statusFilter)

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Incoming Orders</h1>
            <p className="text-neutral-600 mt-1">
              Manage orders from buyers
            </p>
          </div>
          {notifiedOrderIds.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 border border-primary-200 rounded-lg">
              <Bell className="h-4 w-4 text-primary-600" />
              <span className="text-sm font-medium text-primary-700">
                {notifiedOrderIds.size} new order{notifiedOrderIds.size !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">
          {error}
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((filter) => {
          const count = filter.value === 'ALL'
            ? orders.length
            : orders.filter((o) => o.status === filter.value).length
          return (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === filter.value
                  ? 'bg-primary-100 text-primary-700 border border-primary-200'
                  : 'bg-neutral-100 text-neutral-600 border border-neutral-200 hover:bg-neutral-200'
              }`}
            >
              {filter.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Orders list */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center shadow-sm">
          <ShoppingBag className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-1">
            {statusFilter === 'ALL' ? 'No orders yet' : `No ${statusFilter.toLowerCase()} orders`}
          </h3>
          <p className="text-sm text-neutral-500">
            {statusFilter === 'ALL'
              ? 'When buyers place orders, they will appear here.'
              : 'Try a different filter.'
            }
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-neutral-200 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">Order</th>
                  <th className="px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden sm:table-cell">Qty</th>
                  <th className="px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden sm:table-cell">Total</th>
                  <th className="px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredOrders.map((order, idx) => {
                  const firstItem = order.items?.[0]
                  const statusColor = ORDER_STATUS_COLORS[order.status] || ''
                  const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status

                  return (
                    <AnimatedListItem key={order.id} index={idx}>
                    <tr
                      className={`transition-colors ${
                        notifiedOrderIds.has(order.id)
                          ? 'bg-primary-50 hover:bg-primary-100'
                          : 'hover:bg-neutral-50'
                      }`
                    }>
                      <td className="px-6 py-4">
                        <Link
                          to={`/orders/${order.id}`}
                          className="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1.5"
                        >
                          #{order.id.slice(0, 8)}
                          {notifiedOrderIds.has(order.id) && (
                            <span className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0" />
                          )}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-neutral-50 rounded overflow-hidden flex-shrink-0">
                            {firstItem?.imagePathSnapshot ? (
                              <img
                                src={firstItem.imagePathSnapshot}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="h-4 w-4 text-neutral-300" />
                              </div>
                            )}
                          </div>
                          <span className="text-sm text-neutral-900 truncate max-w-[200px]">
                            {firstItem?.productNameSnapshot || 'Product'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600 hidden sm:table-cell">
                        {firstItem?.quantity || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-neutral-900 hidden sm:table-cell">
                        {order.totalAmount != null
                          ? `₹${order.totalAmount.toFixed(2)}`
                          : 'Pending'
                        }
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-neutral-500 hidden md:table-cell">
                        {new Date(order.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                    </AnimatedListItem>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
