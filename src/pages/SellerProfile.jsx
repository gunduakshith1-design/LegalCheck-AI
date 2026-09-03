import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Store, User, MapPin, ShieldCheck, Loader2, AlertCircle, Info, Truck,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  BUSINESS_TYPES,
  VERIFICATION_TYPES,
  upsertSellerProfile,
} from '../lib/sellerProfile'

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa',
  'Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
  'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland',
  'Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Delhi','Jammu & Kashmir','Ladakh','Chandigarh','Puducherry',
  'Andaman & Nicobar Islands','Dadra & Nagar Haveli and Daman & Diu','Lakshadweep',
]

const INITIAL = {
  shopName: '',
  ownerName: '',
  businessType: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  phone: '',
  verificationType: '',
  verificationNumber: '',
  shiprocketPickupLocation: '',
}

function validate(values) {
  const errs = {}
  if (!values.shopName.trim()) errs.shopName = 'Shop / business name is required'
  if (!values.ownerName.trim()) errs.ownerName = 'Owner / contact name is required'
  if (!values.businessType) errs.businessType = 'Business type is required'
  if (!values.address.trim()) errs.address = 'Shop address is required'
  if (!values.city.trim()) errs.city = 'City is required'
  if (!values.state) errs.state = 'State is required'
  if (!values.pincode.trim()) errs.pincode = 'PIN code is required'
  else if (!/^\d{6}$/.test(values.pincode.trim())) errs.pincode = 'PIN code must be 6 digits'
  if (!values.phone.trim()) errs.phone = 'Contact phone is required'
  else if (!/^\d{10}$/.test(values.phone.trim())) errs.phone = 'Phone must be 10 digits'

  // Conditional validation: if verification type chosen (not not_available), number required
  if (values.verificationType && values.verificationType !== 'not_available') {
    if (!values.verificationNumber.trim()) {
      errs.verificationNumber = `Enter your ${VERIFICATION_TYPES.find(v => v.value === values.verificationType)?.label || 'verification'} number`
    }
  }

  return errs
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

export default function SellerProfile() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState(INITIAL)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState(null)

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
    if (errors[field]) setErrors((e) => { const n = { ...e }; delete n[field]; return n })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setServerError(null)

    const errs = validate(values)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setSubmitting(true)
    const { data, error } = await upsertSellerProfile(user.id, values)
    setSubmitting(false)

    if (error) {
      setServerError(error)
      return
    }

    navigate('/', { replace: true })
  }

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900">Register Your Shop</h1>
        <p className="text-neutral-500 mt-1">
          Complete your business profile to start using LegalCheck AI as a seller.
        </p>
      </div>

      {/* Error */}
      {serverError && (
        <div className="mb-6 flex items-start gap-3 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p className="flex-1">{serverError}</p>
          <button onClick={() => setServerError(null)} className="text-danger-400 hover:text-danger-600">✕</button>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-8">

        {/* ── Section A: Business Information ── */}
        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Store className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-neutral-900">Business Information</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <FieldLabel label="Shop / Business Name" required error={errors.shopName} />
              <input
                type="text"
                value={values.shopName}
                onChange={set('shopName')}
                placeholder="e.g. Sharma General Store"
                className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
                  errors.shopName ? 'border-danger-300 bg-danger-50' : 'border-neutral-300 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
                } outline-none`}
              />
            </div>

            <div className="sm:col-span-2">
              <FieldLabel label="Business Type" required error={errors.businessType} />
              <select
                value={values.businessType}
                onChange={set('businessType')}
                className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
                  errors.businessType ? 'border-danger-300 bg-danger-50' : 'border-neutral-300 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
                } outline-none`}
              >
                <option value="">Select business type</option>
                {BUSINESS_TYPES.map((bt) => (
                  <option key={bt.value} value={bt.value}>{bt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* ── Section B: Owner Information ── */}
        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-neutral-900">Owner Information</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Owner / Contact Name" required error={errors.ownerName} />
              <input
                type="text"
                value={values.ownerName}
                onChange={set('ownerName')}
                placeholder="e.g. Rajesh Sharma"
                className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
                  errors.ownerName ? 'border-danger-300 bg-danger-50' : 'border-neutral-300 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
                } outline-none`}
              />
            </div>

            <div>
              <FieldLabel label="Contact Phone" required error={errors.phone} />
              <input
                type="tel"
                value={values.phone}
                onChange={set('phone')}
                placeholder="10-digit mobile number"
                maxLength={10}
                className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
                  errors.phone ? 'border-danger-300 bg-danger-50' : 'border-neutral-300 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
                } outline-none`}
              />
            </div>
          </div>
        </section>

        {/* ── Section C: Shop Location ── */}
        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-neutral-900">Shop Location</h2>
          </div>

          <div className="space-y-4">
            <div>
              <FieldLabel label="Shop Address" required error={errors.address} />
              <input
                type="text"
                value={values.address}
                onChange={set('address')}
                placeholder="Street address, landmark, area"
                className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
                  errors.address ? 'border-danger-300 bg-danger-50' : 'border-neutral-300 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
                } outline-none`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <FieldLabel label="City" required error={errors.city} />
                <input
                  type="text"
                  value={values.city}
                  onChange={set('city')}
                  placeholder="City"
                  className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
                    errors.city ? 'border-danger-300 bg-danger-50' : 'border-neutral-300 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
                  } outline-none`}
                />
              </div>

              <div>
                <FieldLabel label="State" required error={errors.state} />
                <select
                  value={values.state}
                  onChange={set('state')}
                  className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
                    errors.state ? 'border-danger-300 bg-danger-50' : 'border-neutral-300 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
                  } outline-none`}
                >
                  <option value="">Select state</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <FieldLabel label="PIN Code" required error={errors.pincode} />
                <input
                  type="text"
                  value={values.pincode}
                  onChange={set('pincode')}
                  placeholder="6-digit PIN"
                  maxLength={6}
                  className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
                    errors.pincode ? 'border-danger-300 bg-danger-50' : 'border-neutral-300 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
                  } outline-none`}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Section D: Business Verification ── */}
        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-neutral-900">Business Verification</h2>
          </div>
          <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-primary-50 border border-primary-100">
            <Info className="h-4 w-4 text-primary-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-primary-700">
              Business verification helps establish the identity of the store.
              Verification availability depends on your business type and registration.
              Entering a verification number does not imply it has been verified.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <FieldLabel label="Verification Type" error={errors.verificationType} />
              <select
                value={values.verificationType}
                onChange={set('verificationType')}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
              >
                <option value="">Select verification type (optional)</option>
                {VERIFICATION_TYPES.map((vt) => (
                  <option key={vt.value} value={vt.value}>{vt.label}</option>
                ))}
              </select>
            </div>

            {values.verificationType && values.verificationType !== 'not_available' && (
              <div>
                <FieldLabel label="Verification Number" required error={errors.verificationNumber} />
                <input
                  type="text"
                  value={values.verificationNumber}
                  onChange={set('verificationNumber')}
                  placeholder={`Enter your ${VERIFICATION_TYPES.find(v => v.value === values.verificationType)?.label || 'verification'} number`}
                  className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
                    errors.verificationNumber ? 'border-danger-300 bg-danger-50' : 'border-neutral-300 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
                  } outline-none`}
                />
              </div>
            )}
          </div>
        </section>

        {/* ── Section E: Delivery Settings ── */}
        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-neutral-900">Delivery Settings</h2>
          </div>
          <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-primary-50 border border-primary-100">
            <Info className="h-4 w-4 text-primary-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-primary-700">
              Required for real courier deliveries via Shiprocket.
              Enter the exact pickup/warehouse location name configured in your Shiprocket dashboard.
              Not needed for demo deliveries.
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <FieldLabel label="Shiprocket Pickup Location Name" error={errors.shiprocketPickupLocation} />
              <input
                type="text"
                value={values.shiprocketPickupLocation}
                onChange={set('shiprocketPickupLocation')}
                placeholder="e.g. Primary"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Match the exact name from Shiprocket &rarr; Settings &rarr; Warehouse / Pickup Locations.
              </p>
            </div>
          </div>
        </section>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="px-8 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save & Continue'
            )}
          </button>
        </div>
      </form>
    </div>
    </div>
  )
}
