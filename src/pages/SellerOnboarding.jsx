import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Store, User, MapPin, CheckCircle, ArrowRight, ArrowLeft,
  Loader2, AlertCircle, Info, Truck, ShieldCheck, Sparkles,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  BUSINESS_TYPES, VERIFICATION_TYPES,
  fetchSellerProfile, upsertSellerProfile, dbRowToProfile,
} from '../lib/sellerProfile'

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa',
  'Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
  'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland',
  'Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Delhi','Jammu & Kashmir','Ladakh','Chandigarh','Puducherry',
]

const STEPS = [
  { key: 'shop', label: 'Shop', icon: Store },
  { key: 'seller', label: 'Seller', icon: User },
  { key: 'pickup', label: 'Pickup', icon: MapPin },
  { key: 'ready', label: 'Ready', icon: CheckCircle },
]

function StepIndicator({ currentIdx }) {
  return (
    <nav aria-label="Onboarding progress" className="flex items-center gap-1 sm:gap-2 mb-8">
      {STEPS.map((step, idx) => {
        const Icon = step.icon
        const isCompleted = idx < currentIdx
        const isCurrent = idx === currentIdx
        const isPending = idx > currentIdx
        return (
          <React.Fragment key={step.key}>
            {idx > 0 && (
              <div className={`hidden sm:block flex-1 h-px ${isCompleted ? 'bg-success-400' : 'bg-neutral-200'}`} />
            )}
            <div className="flex items-center gap-1.5 sm:gap-2" aria-current={isCurrent ? 'step' : undefined}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-medium transition-colors ${
                isCompleted ? 'bg-success-100 text-success-700' :
                isCurrent ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-200' :
                'bg-neutral-100 text-neutral-400'
              }`}>
                {isCompleted ? <CheckCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-xs sm:text-sm font-medium ${
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

function FieldLabel({ label, required, error }) {
  return (
    <label className="block text-sm font-medium text-neutral-700 mb-1">
      {label}
      {required && <span className="text-danger-500 ml-0.5">*</span>}
      {error && <span className="text-danger-500 ml-2 text-xs font-normal">{error}</span>}
    </label>
  )
}

function InputField({ label, field, type = 'text', value, onChange, error, placeholder, maxLength, required, disabled }) {
  return (
    <div>
      <FieldLabel label={label} required={required} error={error} />
      <input
        type={type}
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors outline-none ${
          error ? 'border-danger-300 bg-danger-50' :
          'border-neutral-300 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
        } disabled:bg-neutral-50 disabled:cursor-default`}
      />
    </div>
  )
}

function SelectField({ label, field, value, onChange, error, options, placeholder, required, disabled }) {
  return (
    <div>
      <FieldLabel label={label} required={required} error={error} />
      <select
        value={value || ''}
        onChange={onChange}
        disabled={disabled}
        className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors outline-none ${
          error ? 'border-danger-300 bg-danger-50' :
          'border-neutral-300 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
        } disabled:bg-neutral-50 disabled:cursor-default`}
      >
        <option value="">{placeholder || 'Select'}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

export default function SellerOnboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [errors, setErrors] = useState({})

  // Form values — preloaded from existing profile
  const [values, setValues] = useState({
    shopName: '',
    businessType: '',
    ownerName: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    shiprocketPickupLocation: '',
  })

  // Load existing profile data on mount
  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    fetchSellerProfile(user.id).then((row) => {
      if (row) {
        const p = dbRowToProfile(row)
        setValues({
          shopName: p.shopName || '',
          businessType: p.businessType || '',
          ownerName: p.ownerName || '',
          phone: p.phone || '',
          address: p.address || '',
          city: p.city || '',
          state: p.state || '',
          pincode: p.pincode || '',
          shiprocketPickupLocation: p.shiprocketPickupLocation || '',
        })
        // If profile already has all required fields, skip to ready step
        if (p.shopName && p.ownerName && p.businessType && p.address && p.city && p.state && p.pincode && p.phone) {
          setStep(3)
        }
      }
      setLoading(false)
    })
  }, [user?.id])

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
    if (errors[field]) setErrors((err) => { const n = { ...err }; delete n[field]; return n })
  }

  // Step validation
  const validateStep = (stepIdx) => {
    const errs = {}
    if (stepIdx === 0) {
      if (!values.shopName.trim()) errs.shopName = 'Shop name is required'
      if (!values.businessType) errs.businessType = 'Business type is required'
    } else if (stepIdx === 1) {
      if (!values.ownerName.trim()) errs.ownerName = 'Owner name is required'
      if (!values.phone.trim()) errs.phone = 'Phone number is required'
      else if (!/^\d{10}$/.test(values.phone.trim())) errs.phone = 'Enter a valid 10-digit number'
    } else if (stepIdx === 2) {
      if (!values.address.trim()) errs.address = 'Address is required'
      if (!values.city.trim()) errs.city = 'City is required'
      if (!values.state) errs.state = 'State is required'
      if (!values.pincode.trim()) errs.pincode = 'PIN code is required'
      else if (!/^\d{6}$/.test(values.pincode.trim())) errs.pincode = 'Enter a valid 6-digit PIN'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleNext = () => {
    if (!validateStep(step)) return
    if (step < STEPS.length - 1) setStep(step + 1)
  }

  const handleBack = () => {
    if (step > 0) setStep(step - 1)
  }

  const handleSaveAndContinue = async () => {
    if (saving) return
    setServerError(null)
    setSaving(true)

    try {
      const { error } = await upsertSellerProfile(user.id, values)
      if (error) throw new Error(error)
      // Navigate to dashboard after saving
      navigate('/', { replace: true })
    } catch (err) {
      setServerError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSkipToScan = () => {
    navigate('/scan', { replace: true })
  }

  // Completeness check
  const completeness = {
    shop: !!(values.shopName && values.businessType),
    seller: !!(values.ownerName && values.phone),
    pickup: !!(values.address && values.city && values.state && values.pincode),
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary-600 mb-3">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">Set Up Your Shop</h1>
          <p className="text-sm text-neutral-500 mt-1">Quick setup to start selling on LegalCheck AI</p>
        </div>

        {/* Step Indicator */}
        <StepIndicator currentIdx={step} />

        {/* Error */}
        {serverError && (
          <div className="mb-6 flex items-start gap-3 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <p className="flex-1">{serverError}</p>
            <button onClick={() => setServerError(null)} className="text-danger-400 hover:text-danger-600">✕</button>
          </div>
        )}

        {/* Step Content */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6 sm:p-8">

          {/* ── Step 0: Welcome / Shop Details ── */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Store className="h-5 w-5 text-primary-600" />
                  <h2 className="text-lg font-semibold text-neutral-900">Shop Details</h2>
                </div>
                <p className="text-sm text-neutral-500">
                  Tell us about your shop so buyers can find you.
                </p>
              </div>

              <InputField
                label="Shop / Business Name"
                field="shopName"
                value={values.shopName}
                onChange={set('shopName')}
                error={errors.shopName}
                placeholder="e.g. Sharma General Store"
                required
              />

              <SelectField
                label="Business Type"
                field="businessType"
                value={values.businessType}
                onChange={set('businessType')}
                error={errors.businessType}
                options={BUSINESS_TYPES}
                placeholder="Select business type"
                required
              />
            </div>
          )}

          {/* ── Step 1: Seller Details ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-5 w-5 text-primary-600" />
                  <h2 className="text-lg font-semibold text-neutral-900">Your Details</h2>
                </div>
                <p className="text-sm text-neutral-500">
                  Contact information for order coordination.
                </p>
              </div>

              <InputField
                label="Owner / Contact Name"
                field="ownerName"
                value={values.ownerName}
                onChange={set('ownerName')}
                error={errors.ownerName}
                placeholder="e.g. Rajesh Sharma"
                required
              />

              <InputField
                label="Contact Phone"
                field="phone"
                type="tel"
                value={values.phone}
                onChange={set('phone')}
                error={errors.phone}
                placeholder="10-digit mobile number"
                maxLength={10}
                required
              />
            </div>
          )}

          {/* ── Step 2: Pickup / Location ── */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="h-5 w-5 text-primary-600" />
                  <h2 className="text-lg font-semibold text-neutral-900">Pickup Location</h2>
                </div>
                <p className="text-sm text-neutral-500">
                  Where will orders be picked up from? This must be a valid location where you can hand over packages.
                </p>
              </div>

              <InputField
                label="Shop Address"
                field="address"
                value={values.address}
                onChange={set('address')}
                error={errors.address}
                placeholder="Street address, landmark, area"
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <InputField
                  label="City"
                  field="city"
                  value={values.city}
                  onChange={set('city')}
                  error={errors.city}
                  placeholder="City"
                  required
                />
                <SelectField
                  label="State"
                  field="state"
                  value={values.state}
                  onChange={set('state')}
                  error={errors.state}
                  options={INDIAN_STATES.map(s => ({ value: s, label: s }))}
                  placeholder="Select state"
                  required
                />
                <InputField
                  label="PIN Code"
                  field="pincode"
                  value={values.pincode}
                  onChange={set('pincode')}
                  error={errors.pincode}
                  placeholder="6-digit PIN"
                  maxLength={6}
                  required
                />
              </div>

              {/* Shiprocket pickup — optional, explained */}
              <div className="pt-2 border-t border-neutral-100">
                <div className="flex items-start gap-2 mb-3 p-3 rounded-lg bg-primary-50 border border-primary-100">
                  <Truck className="h-4 w-4 text-primary-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-primary-700">
                    Required for real courier deliveries via Shiprocket. For demo deliveries, you can skip this.
                  </p>
                </div>
                <InputField
                  label="Shiprocket Pickup Location Name"
                  field="shiprocketPickupLocation"
                  value={values.shiprocketPickupLocation}
                  onChange={set('shiprocketPickupLocation')}
                  placeholder="e.g. Primary (leave blank for demo)"
                />
                <p className="text-xs text-neutral-400 mt-1">
                  Match the exact name from Shiprocket → Settings → Warehouse / Pickup Locations.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 3: Ready to Sell ── */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-100 mb-4">
                  <Sparkles className="h-8 w-8 text-success-600" />
                </div>
                <h2 className="text-xl font-bold text-neutral-900">You're ready to sell!</h2>
                <p className="text-sm text-neutral-500 mt-2 max-w-sm mx-auto">
                  Your shop profile is set up. You can start scanning products and listing them in your store.
                </p>
              </div>

              {/* Completeness summary */}
              <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-4 space-y-3">
                <h3 className="text-sm font-medium text-neutral-700">Profile Summary</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    {completeness.shop ? (
                      <CheckCircle className="h-4 w-4 text-success-600 flex-shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-neutral-300 flex-shrink-0" />
                    )}
                    <span className={completeness.shop ? 'text-neutral-700' : 'text-neutral-400'}>
                      Shop details — {values.shopName || 'Not set'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {completeness.seller ? (
                      <CheckCircle className="h-4 w-4 text-success-600 flex-shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-neutral-300 flex-shrink-0" />
                    )}
                    <span className={completeness.seller ? 'text-neutral-700' : 'text-neutral-400'}>
                      Contact — {values.ownerName || 'Not set'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {completeness.pickup ? (
                      <CheckCircle className="h-4 w-4 text-success-600 flex-shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-neutral-300 flex-shrink-0" />
                    )}
                    <span className={completeness.pickup ? 'text-neutral-700' : 'text-neutral-400'}>
                      Pickup — {[values.city, values.state].filter(Boolean).join(', ') || 'Not set'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Shiprocket note */}
              {values.shiprocketPickupLocation && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-700">
                    <Truck className="h-3.5 w-3.5 inline mr-1" />
                    Shiprocket pickup location: <span className="font-medium">{values.shiprocketPickupLocation}</span>
                  </p>
                </div>
              )}
              {!values.shiprocketPickupLocation && (
                <div className="p-3 rounded-lg bg-warning-50 border border-warning-100">
                  <p className="text-xs text-warning-700">
                    <Info className="h-3.5 w-3.5 inline mr-1" />
                    Shiprocket pickup location not configured. You can only use demo delivery. Add it later in your profile.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="mt-6 flex items-center justify-between gap-3">
          {step > 0 && step < 3 ? (
            <button
              onClick={handleBack}
              className="px-4 py-2.5 border border-neutral-300 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-50 flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          ) : step === 3 ? (
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2.5 border border-neutral-300 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-50 flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Edit Details
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              onClick={handleNext}
              className="px-6 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 flex items-center gap-2"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={handleSkipToScan}
                className="px-4 py-2.5 border border-neutral-300 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-50"
              >
                Scan a Product
              </button>
              <button
                onClick={handleSaveAndContinue}
                disabled={saving}
                className="px-6 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {saving ? 'Saving…' : 'Save & Go to Dashboard'}
              </button>
            </div>
          )}
        </div>

        {/* Skip link */}
        {step < 3 && (
          <div className="mt-4 text-center">
            <button
              onClick={handleSkipToScan}
              className="text-sm text-neutral-400 hover:text-neutral-600"
            >
              Skip for now — I'll set this up later
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
