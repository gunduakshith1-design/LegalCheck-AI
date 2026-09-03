import React, { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bell, X, CheckCircle, Package, ShoppingBag } from 'lucide-react'
import { useNotifications } from '../contexts/NotificationContext'

/**
 * NotificationBell — shows unread notification count and dropdown list.
 * Used in the sidebar/nav for sellers and buyers.
 */
export default function NotificationBell({ compact = false }) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, removeNotification } = useNotifications()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleToggle = () => {
    setOpen(prev => !prev)
    if (!open && unreadCount > 0) {
      // Don't auto-mark all as read — let user dismiss individually
    }
  }

  const handleNotificationClick = (notif) => {
    markAsRead(notif.id)
    setOpen(false)
  }

  const getIcon = (type) => {
    switch (type) {
      case 'new_order': return <ShoppingBag className="h-4 w-4 text-primary-600" />
      case 'order_update': return <Package className="h-4 w-4 text-success-600" />
      default: return <Bell className="h-4 w-4 text-neutral-500" />
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className={`relative p-2 rounded-lg transition-colors ${
          open ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700'
        }`}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-danger-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-[20rem] max-h-96 bg-white rounded-lg border border-neutral-200 shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
            <h3 className="text-sm font-semibold text-neutral-900">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-neutral-400 hover:text-neutral-600 rounded"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="overflow-y-auto max-h-80">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
                <p className="text-sm text-neutral-500">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`px-4 py-3 border-b border-neutral-100 hover:bg-neutral-50 transition-colors ${
                    !notif.read ? 'bg-primary-50/50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-neutral-900 truncate">{notif.title}</p>
                        {!notif.read && (
                          <span className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5 truncate">{notif.message}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {formatTimeAgo(notif.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Link
                        to={`/orders/${notif.orderId}`}
                        onClick={() => handleNotificationClick(notif)}
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium whitespace-nowrap"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => removeNotification(notif.id)}
                        className="p-1 text-neutral-400 hover:text-neutral-600 rounded"
                        aria-label="Dismiss notification"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function formatTimeAgo(date) {
  if (!(date instanceof Date)) return ''
  const now = new Date()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}
