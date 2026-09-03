import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store, ShoppingCart, Loader2, AlertCircle, ShieldCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import GlassSurface from '../components/GlassSurface'

const roles = [
  {
    id: 'seller',
    title: 'Seller',
    description: 'Register your shop, screen products, and manage your store inventory.',
    icon: Store,
    iconBg: 'bg-primary-50',
    iconColor: 'text-primary-600',
    selectedBorder: 'border-primary-500 ring-2 ring-primary-100',
    hoverBorder: 'hover:border-primary-300',
  },
  {
    id: 'buyer',
    title: 'Buyer',
    description: 'Browse stores, view product screening information, and place orders.',
    icon: ShoppingCart,
    iconBg: 'bg-success-50',
    iconColor: 'text-success-600',
    selectedBorder: 'border-success-500 ring-2 ring-success-100',
    hoverBorder: 'hover:border-success-300',
  },
]

export default function SelectRole() {
  const { setRole, user, error, clearError } = useAuth()
  const navigate = useNavigate()
  const [selecting, setSelecting] = useState(null)
  const [localError, setLocalError] = useState(null)

  const handleSelect = async (roleId) => {
    setSelecting(roleId)
    setLocalError(null)
    clearError()

    const success = await setRole(roleId)
    if (success) {
      navigate('/', { replace: true })
    } else {
      setLocalError(error || 'Failed to save role. Please try again.')
      setSelecting(null)
    }
  }

  const displayError = localError || error

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-2xl">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary-600 mb-3">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Choose your role</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Select how you'll use LegalCheck AI. You can change this later.
          </p>
          {user?.email && (
            <p className="mt-1 text-xs text-neutral-400">
              Signed in as {user.email}
            </p>
          )}
        </div>

        {/* Error banner */}
        {displayError && (
          <div className="mb-6 flex items-start gap-3 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm max-w-md mx-auto">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <p className="flex-1">{displayError}</p>
            <button
              onClick={() => { setLocalError(null); clearError() }}
              className="text-danger-400 hover:text-danger-600 flex-shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {/* Role cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {roles.map((role) => {
            const Icon = role.icon
            const isSelecting = selecting === role.id
            const isDisabled = selecting !== null

            return (
              <GlassSurface
                key={role.id}
                width="100%"
                height="auto"
                borderRadius={12}
                backgroundOpacity={0.02}
                saturation={1}
                className="w-full"
                style={{ padding: 0 }}
              >
              <button
                onClick={() => handleSelect(role.id)}
                disabled={isDisabled}
                className={`group relative bg-white/90 rounded-xl border border-neutral-200 p-6 text-left transition-all duration-200 shadow-sm w-full ${role.hoverBorder} hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${role.iconBg} mb-4`}>
                  <Icon className={`h-6 w-6 ${role.iconColor}`} />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900">{role.title}</h3>
                <p className="mt-2 text-sm text-neutral-500 leading-relaxed">{role.description}</p>
                <div className="mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-900 text-white text-sm font-medium group-hover:bg-primary-600 transition-colors">
                  {isSelecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    'Continue'
                  )}
                </div>
              </button>
              </GlassSurface>
            )
          })}
        </div>
      </div>
    </div>
  )
}
