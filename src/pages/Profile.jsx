import React, { useState, useEffect } from 'react'
import {
  Store, User, MapPin, ShieldCheck, Loader2, AlertCircle,
  Pencil, Save, X, Truck, CheckCircle, Info, Mail,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  BUSINESS_TYPES,
  VERIFICATION_TYPES,
  VERIFICATION_STATUS_LABELS,
  VERIFICATION_STATUS_COLORS,
  fetchSellerProfile,
  upsertSellerProfile,
  dbRowToProfile,
} from '../lib/sellerProfile'
import { supabase } from '../lib/supabase'

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa',
  'Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
  'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland',
  'Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Delhi','Jammu & Kashmir','Ladakh','Chandigarh','Puducherry',
  'Andaman & Nicobar Islands','Dadra & Nagar Haveli and Daman & Diu','Lakshadweep',
]

// ─── Shared helpers ──────────────────────────────────────────────────────────

function FieldLabel({ label, required, error }) {
  return (
    <label className="block text-sm font-medium text-neutral-700 mb-1">
      {label}
      {required && <span className="text-danger-500 ml-0.5">*</span>}
      {error && <span className="text-danger-500 ml-2 text-xs font-normal">{error}</span>}
    </label>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

// ─── Seller Profile ──────────────────────────────────────────────────────────

function SellerProfileSection() {
  const { user, sellerProfile, refreshSellerProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    fetchSellerProfile(user.id).then((row) => {
      if (row) {
        const p = dbRowToProfile(row)
        setValues({
          shopName: p.shopName || '',
          ownerName: p.ownerName || '',
          businessType: p.businessType || '',
          address: p.address || '',
          city: p.city || '',
          state: p.state || '',
          pincode: p.pincode || '',
          phone: p.phone || '',
          verificationType: p.verificationType || '',
          verificationNumber: p.verificationNumber || '',
          shiprocketPickupLocation: p.shiprocketPickupLocation || '',
        })
      }
      setLoading(false)
    })
  }, [user?.id, sellerProfile])

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
    if (errors[field]) setErrors((err) => { const n = { ...err }; delete n[field]; return n })
  }

  const handleEdit = () => {
    setEditing(true)
    setSaveSuccess(false)
    setServerError(null)
  }

  const handleCancel = () => {
    setEditing(false)
    setErrors({})
    setServerError(null)
    // Reset from DB
    if (sellerProfile) {
      const p = dbRowToProfile(sellerProfile)
      setValues({
        shopName: p.shopName || '',
        ownerName: p.ownerName || '',
        businessType: p.businessType || '',
        address: p.address || '',
        city: p.city || '',
        state: p.state || '',
        pincode: p.pincode || '',
        phone: p.phone || '',
        verificationType: p.verificationType || '',
        verificationNumber: p.verificationNumber || '',
        shiprocketPickupLocation: p.shiprocketPickupLocation || '',
      })
    }
  }

  const validate = () => {
    const errs = {}
    if (!values.shopName?.trim()) errs.shopName = 'Required'
    if (!values.ownerName?.trim()) errs.ownerName = 'Required'
    if (!values.businessType) errs.businessType = 'Required'
    if (!values.address?.trim()) errs.address = 'Required'
    if (!values.city?.trim()) errs.city = 'Required'
    if (!values.state) errs.state = 'Required'
    if (!values.pincode?.trim()) errs.pincode = 'Required'
    else if (!/^\d{6}$/.test(values.pincode.trim())) errs.pincode = 'Must be 6 digits'
    if (!values.phone?.trim()) errs.phone = 'Required'
    else if (!/^\d{10}$/.test(values.phone.trim())) errs.phone = 'Must be 10 digits'
    if (values.verificationType && values.verificationType !== 'not_available') {
      if (!values.verificationNumber?.trim()) errs.verificationNumber = 'Required'
    }
    return errs
  }

  const handleSave = async () => {
    setServerError(null)
    setSaveSuccess(false)
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSaving(true)
    const { data, error } = await upsertSellerProfile(user.id, values)
    setSaving(false)

    if (error) { setServerError(error); return }

    // Refresh context
    await refreshSellerProfile()
    setEditing(false)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 text-primary-600 animate-spin" />
      </div>
    )
  }

  // Profile completeness
  const shopDone = !!(values.shopName && values.businessType)
  const sellerDone = !!(values.ownerName && values.phone)
  const pickupDone = !!(values.address && values.city && values.state && values.pincode)

  const InputField = ({ label, field, type = 'text' }) => (
    <Field label={label}>
      <input
        type={type}
        value={values[field] || ''}
        onChange={set(field)}
        disabled={!editing}
        className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors outline-none ${
          !editing ? 'bg-neutral-50 border-neutral-200 text-neutral-700' :
          errors[field] ? 'border-danger-300 bg-danger-50' :
          'border-neutral-300 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
        } disabled:cursor-default`}
      />
      {errors[field] && editing && <p className="text-xs text-danger-500 mt-1">{errors[field]}</p>}
    </Field>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Seller Profile</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage your shop and business information.</p>
        </div>
        {!editing ? (
          <button
            onClick={handleEdit}
            className="px-4 py-2 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-50 transition-colors text-sm flex items-center gap-1"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors text-sm font-medium flex items-center gap-1 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {/* Success */}
      {saveSuccess && (
        <div className="p-3 rounded-lg bg-success-50 border border-success-200 text-success-700 text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          Profile updated successfully.
        </div>
      )}

      {/* Errors */}
      {serverError && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p className="flex-1">{serverError}</p>
          <button onClick={() => setServerError(null)} className="text-danger-400 hover:text-danger-600">✕</button>
        </div>
      )}

      {/* Profile Completeness */}
      {!editing && (
        <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-4">
          <h3 className="text-sm font-medium text-neutral-700 mb-2">Profile Completeness</h3>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              {shopDone ? <CheckCircle className="h-4 w-4 text-success-600" /> : <div className="w-4 h-4 rounded-full border-2 border-neutral-300" />}
              <span className={shopDone ? 'text-neutral-700' : 'text-neutral-400'}>Shop details</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {sellerDone ? <CheckCircle className="h-4 w-4 text-success-600" /> : <div className="w-4 h-4 rounded-full border-2 border-neutral-300" />}
              <span className={sellerDone ? 'text-neutral-700' : 'text-neutral-400'}>Contact details</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {pickupDone ? <CheckCircle className="h-4 w-4 text-success-600" /> : <div className="w-4 h-4 rounded-full border-2 border-neutral-300" />}
              <span className={pickupDone ? 'text-neutral-700' : 'text-neutral-400'}>Pickup information</span>
            </div>
          </div>
        </div>
      )}

      {/* Business Info */}
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Store className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-neutral-900">Business Information</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField label="Shop / Business Name" field="shopName" />
          <div>
            <Field label="Business Type">
              {editing ? (
                <select
                  value={values.businessType}
                  onChange={set('businessType')}
                  className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors outline-none ${
                    errors.businessType ? 'border-danger-300 bg-danger-50' :
                    'border-neutral-300 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
                  }`}
                >
                  <option value="">Select</option>
                  {BUSINESS_TYPES.map((bt) => <option key={bt.value} value={bt.value}>{bt.label}</option>)}
                </select>
              ) : (
                <div className="px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-sm text-neutral-700">
                  {BUSINESS_TYPES.find(b => b.value === values.businessType)?.label || '—'}
                </div>
              )}
            </Field>
            {errors.businessType && editing && <p className="text-xs text-danger-500 mt-1">{errors.businessType}</p>}
          </div>
        </div>
      </section>

      {/* Owner Info */}
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-neutral-900">Owner Information</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField label="Owner / Contact Name" field="ownerName" />
          <InputField label="Contact Phone" field="phone" type="tel" />
        </div>
      </section>

      {/* Location */}
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-neutral-900">Shop Location</h2>
        </div>
        <div className="space-y-4">
          <InputField label="Shop Address" field="address" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InputField label="City" field="city" />
            <div>
              <Field label="State">
                {editing ? (
                  <select
                    value={values.state}
                    onChange={set('state')}
                    className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors outline-none ${
                      errors.state ? 'border-danger-300 bg-danger-50' :
                      'border-neutral-300 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
                    }`}
                  >
                    <option value="">Select</option>
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <div className="px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-sm text-neutral-700">
                    {values.state || '—'}
                  </div>
                )}
              </Field>
              {errors.state && editing && <p className="text-xs text-danger-500 mt-1">{errors.state}</p>}
            </div>
            <InputField label="PIN Code" field="pincode" />
          </div>
        </div>
      </section>

      {/* Verification */}
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-neutral-900">Business Verification</h2>
        </div>
        <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-primary-50 border border-primary-100">
          <Info className="h-4 w-4 text-primary-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-primary-700">
            Entering a verification number does not imply it has been verified.
            This helps establish the identity of your store.
          </p>
        </div>

        {sellerProfile?.verification_status && (
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm text-neutral-500">Status:</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium border ${
              VERIFICATION_STATUS_COLORS[sellerProfile.verification_status] || ''
            }`}>
              {VERIFICATION_STATUS_LABELS[sellerProfile.verification_status] || sellerProfile.verification_status}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Field label="Verification Type">
              {editing ? (
                <select
                  value={values.verificationType}
                  onChange={set('verificationType')}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
                >
                  <option value="">Select (optional)</option>
                  {VERIFICATION_TYPES.map((vt) => <option key={vt.value} value={vt.value}>{vt.label}</option>)}
                </select>
              ) : (
                <div className="px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-sm text-neutral-700">
                  {VERIFICATION_TYPES.find(v => v.value === values.verificationType)?.label || '—'}
                </div>
              )}
            </Field>
          </div>

          {values.verificationType && values.verificationType !== 'not_available' && (
            <InputField label="Verification Number" field="verificationNumber" />
          )}
        </div>
      </section>

      {/* Delivery / Pickup */}
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-2">
          <Truck className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-neutral-900">Delivery Settings</h2>
        </div>
        <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-primary-50 border border-primary-100">
          <Info className="h-4 w-4 text-primary-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-primary-700">
            Required for real courier deliveries via Shiprocket.
            Leave blank if using demo delivery only.
          </p>
        </div>
        <div className="space-y-3">
          <InputField
            label="Shiprocket Pickup Location"
            field="shiprocketPickupLocation"
          />
          <p className="text-xs text-neutral-500">
            Enter the exact pickup/warehouse name from your Shiprocket dashboard
            (Settings → Warehouse / Pickup Locations). Must match exactly.
          </p>
        </div>
      </section>
    </div>
  )
}

// ─── Buyer Profile ───────────────────────────────────────────────────────────

function BuyerProfileSection() {
  const { user, profile, refreshSellerProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState('')
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    setFullName(profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || '')
  }, [profile, user])

  const handleEdit = () => {
    setEditing(true)
    setSaveSuccess(false)
    setServerError(null)
  }

  const handleCancel = () => {
    setEditing(false)
    setServerError(null)
    setNameError('')
    setFullName(profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || '')
  }

  const handleSave = async () => {
    if (!user?.id) return
    setNameError('')

    if (!fullName.trim()) {
      setNameError('Name is required')
      return
    }

    setSaving(true)
    setServerError(null)

    try {
      const { error } = await supabase
        .from('user_profiles')
        .upsert({ id: user.id, full_name: fullName.trim() }, { onConflict: 'id' })

      if (error) throw new Error(error.message)

      setEditing(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setServerError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Buyer Profile</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage your account information.</p>
        </div>
        {!editing ? (
          <button
            onClick={handleEdit}
            className="px-4 py-2 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-50 transition-colors text-sm flex items-center gap-1"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors text-sm font-medium flex items-center gap-1 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {/* Success */}
      {saveSuccess && (
        <div className="p-3 rounded-lg bg-success-50 border border-success-200 text-success-700 text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          Profile updated successfully.
        </div>
      )}

      {/* Errors */}
      {serverError && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p className="flex-1">{serverError}</p>
          <button onClick={() => setServerError(null)} className="text-danger-400 hover:text-danger-600">✕</button>
        </div>
      )}

      {/* Account Info */}
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-neutral-900">Account Information</h2>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <FieldLabel label="Full Name" required error={nameError} />
            {editing ? (
              <input
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value)
                  if (nameError) setNameError('')
                }}
                placeholder="Your full name"
                className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors outline-none ${
                  nameError ? 'border-danger-300 bg-danger-50' :
                  'border-neutral-300 bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
                }`}
              />
            ) : (
              <div className="px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-sm text-neutral-700">
                {fullName || '—'}
              </div>
            )}
          </div>

          {/* Email (read-only) */}
          <div>
            <FieldLabel label="Email" />
            <div className="px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-sm text-neutral-700 flex items-center gap-2">
              <Mail className="h-4 w-4 text-neutral-400" />
              {user?.email || '—'}
            </div>
            <p className="text-xs text-neutral-400 mt-1">Email is managed through your Google account.</p>
          </div>
        </div>
      </section>
    </div>
  )
}

// ─── Main Profile Component ──────────────────────────────────────────────────

export default function Profile() {
  const { profile } = useAuth()
  const role = profile?.role || 'buyer'

  if (role === 'seller') {
    return <SellerProfileSection />
  }

  return <BuyerProfileSection />
}
