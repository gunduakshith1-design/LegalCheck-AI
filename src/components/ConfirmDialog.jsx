import React, { useEffect, useRef, useCallback } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'

/**
 * ConfirmDialog — accessible confirmation dialog for dangerous/irreversible actions.
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - onConfirm: () => void | Promise<void>
 * - title: string
 * - description: string (shown below title)
 * - confirmLabel: string (button text, e.g. "Reject Order")
 * - confirmVariant: 'danger' | 'warning' | 'primary' (default: 'danger')
 * - loading: boolean (disables buttons during async action)
 * - warningText: string (optional, shown in amber box, e.g. "This action cannot be undone.")
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
  loading = false,
  warningText,
}) {
  const dialogRef = useRef(null)
  const confirmBtnRef = useRef(null)
  const previousFocusRef = useRef(null)

  // Track which element had focus before the dialog opened
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement
      // Focus the confirm button after mount (or the dialog for safety)
      requestAnimationFrame(() => {
        confirmBtnRef.current?.focus()
      })
    } else if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
      previousFocusRef.current.focus()
      previousFocusRef.current = null
    }
  }, [open])

  // Escape key closes
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && !loading) {
      e.stopPropagation()
      onClose()
    }
    // Trap focus within dialog
    if (e.key === 'Tab' && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
  }, [loading, onClose])

  if (!open) return null

  const variantClasses = {
    danger: 'bg-danger-600 text-white hover:bg-danger-700 focus:ring-danger-500',
    warning: 'bg-warning-600 text-white hover:bg-warning-700 focus:ring-warning-500',
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={loading ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        onKeyDown={handleKeyDown}
        className="relative bg-white rounded-xl shadow-2xl border border-neutral-200 w-full max-w-md p-4 sm:p-6 space-y-3 sm:space-y-4 animate-in fade-in zoom-in-95 duration-150 mx-2 sm:mx-0"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-3 right-3 p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon + Title */}
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center ${
            confirmVariant === 'danger' ? 'bg-danger-100' :
            confirmVariant === 'warning' ? 'bg-warning-100' :
            'bg-primary-100'
          }`}>
            <AlertTriangle className={`h-4 w-4 sm:h-5 sm:w-5 ${
              confirmVariant === 'danger' ? 'text-danger-600' :
              confirmVariant === 'warning' ? 'text-warning-600' :
              'text-primary-600'
            }`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="confirm-dialog-title" className="text-sm sm:text-base font-semibold text-neutral-900">
              {title}
            </h3>
          </div>
        </div>

        {/* Description */}
        {description && (
          <p id="confirm-dialog-desc" className="text-sm text-neutral-600 pl-[40px] sm:pl-[52px]">
            {description}
          </p>
        )}

        {/* Warning box */}
        {warningText && (
          <div className={`ml-[40px] sm:ml-[52px] p-3 rounded-lg text-xs ${
            confirmVariant === 'danger' ? 'bg-danger-50 text-danger-700 border border-danger-100' :
            confirmVariant === 'warning' ? 'bg-warning-50 text-warning-700 border border-warning-100' :
            'bg-primary-50 text-primary-700 border border-primary-100'
          }`}>
            {warningText}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pl-[40px] sm:pl-[52px]">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 ${variantClasses[confirmVariant] || variantClasses.danger}`}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
