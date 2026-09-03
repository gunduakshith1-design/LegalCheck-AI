import { supabase } from './supabase'

/**
 * Seller Profile — Supabase CRUD for the seller_profiles table.
 *
 * Verification statuses:
 *   NOT_SUBMITTED  — seller hasn't entered verification yet
 *   SUBMITTED      — data entered, pending future verification
 *   VERIFIED       — external verification passed (future)
 *   VERIFICATION_FAILED — external verification failed (future)
 *   NOT_APPLICABLE — seller chose "Not currently available"
 */

export const BUSINESS_TYPES = [
  { value: 'kirana', label: 'Kirana / Grocery Store' },
  { value: 'retail', label: 'Retail Shop' },
  { value: 'supermarket', label: 'Supermarket' },
  { value: 'other_retail', label: 'Other Retail' },
]

export const VERIFICATION_TYPES = [
  { value: 'gstin', label: 'GSTIN' },
  { value: 'fssai', label: 'FSSAI License / Registration' },
  { value: 'shop_establishment', label: 'Shop & Establishment Registration' },
  { value: 'other', label: 'Other Business Registration' },
  { value: 'not_available', label: 'Not currently available' },
]

export const VERIFICATION_STATUS_LABELS = {
  NOT_SUBMITTED: 'Not Submitted',
  SUBMITTED: 'Submitted — Pending Verification',
  VERIFIED: 'Verified',
  VERIFICATION_FAILED: 'Verification Failed',
  NOT_APPLICABLE: 'Not Applicable',
}

export const VERIFICATION_STATUS_COLORS = {
  NOT_SUBMITTED: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  SUBMITTED: 'bg-warning-100 text-warning-700 border-warning-200',
  VERIFIED: 'bg-success-100 text-success-700 border-success-200',
  VERIFICATION_FAILED: 'bg-danger-100 text-danger-700 border-danger-200',
  NOT_APPLICABLE: 'bg-neutral-100 text-neutral-500 border-neutral-200',
}

/**
 * Fetch the seller profile for the given user ID.
 * Returns the profile object or null.
 */
export async function fetchSellerProfile(userId) {
  if (!supabase || !userId) return null

  const { data, error } = await supabase
    .from('seller_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // no row
    console.error('[SellerProfile] fetch error:', error)
    return null
  }

  return data
}

/**
 * Create or update a seller profile.
 * Uses upsert since there's one profile per user.
 */
export async function upsertSellerProfile(userId, profileData) {
  if (!supabase || !userId) {
    return { data: null, error: 'Supabase not configured' }
  }

  const payload = {
    user_id: userId,
    shop_name: profileData.shopName,
    owner_name: profileData.ownerName,
    business_type: profileData.businessType,
    address: profileData.address,
    city: profileData.city,
    state: profileData.state,
    pincode: profileData.pincode,
    phone: profileData.phone,
    verification_type: profileData.verificationType || null,
    verification_number: profileData.verificationNumber || null,
    verification_status: profileData.verificationType === 'not_available'
      ? 'NOT_APPLICABLE'
      : profileData.verificationNumber
        ? 'SUBMITTED'
        : 'NOT_SUBMITTED',
    shiprocket_pickup_location: profileData.shiprocketPickupLocation || null,
  }

  const { data, error } = await supabase
    .from('seller_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) {
    console.error('[SellerProfile] upsert error:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

/**
 * Convert a DB row to the camelCase shape used by the frontend.
 */
export function dbRowToProfile(row) {
  if (!row) return null
  return {
    userId: row.user_id,
    shopName: row.shop_name,
    ownerName: row.owner_name,
    businessType: row.business_type,
    address: row.address,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    phone: row.phone,
    verificationType: row.verification_type,
    verificationNumber: row.verification_number,
    verificationStatus: row.verification_status,
    shiprocketPickupLocation: row.shiprocket_pickup_location || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
