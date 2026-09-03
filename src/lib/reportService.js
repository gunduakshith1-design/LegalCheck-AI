import { supabase } from './supabase'

/**
 * Compliance Reports Service — Supabase CRUD for compliance_reports.
 *
 * Users can create reports about potential compliance concerns
 * for products with screening scores below 70%.
 *
 * Supports product-level fingerprinting so that reports from different users
 * scanning the same physical product are linked together.
 *
 * v2 Fingerprint system:
 * - Versioned format: v2:<confidence>:<hash>
 * - Confidence levels: HIGH, MEDIUM, LOW
 * - Backward compatible with old v1 fingerprints
 */

// ---------------------------------------------------------------------------
// Product Fingerprint — v2 with confidence levels
// ---------------------------------------------------------------------------

/**
 * Normalise a string for fingerprint comparison.
 * Lowercase, collapse whitespace, strip punctuation, standardise units.
 * Deterministic: same input always produces same output.
 */
function normalise(str) {
  if (!str) return ''
  return str
    .toLowerCase()
    // Remove punctuation EXCEPT dots between digits (e.g. '1.5' stays)
    .replace(/(?<!\d)\.(?!\d)/g, '')
    .replace(/[;,:!?()\\/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Remove spaces between digits and units (e.g. '500 g' → '500g')
    .replace(/(\d)\s+(g|kg|ml|l|gm|gms|ltr|ltrs|cm|mm)\b/g, '$1$2')
    // Standardise common unit variants
    .replace(/gms?\b/g, 'g')
    .replace(/mls?\b/g, 'ml')
    .replace(/ltrs?\b/g, 'l')
}

/**
 * Simple deterministic hash (DJB2) for fingerprint generation.
 * Returns a hex string. Not cryptographic — just for deterministic identity.
 */
function djb2Hash(str) {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Compute a product fingerprint from scan extracted fields.
 *
 * Returns an object: { fingerprint, confidence, components }
 *
 * Identity hierarchy:
 * - HIGH: manufacturer + address + common_name + net_quantity (4+ fields)
 * - MEDIUM: manufacturer + address + net_quantity (3 fields)
 * - LOW: manufacturer + net_quantity or manufacturer only (1-2 fields)
 *
 * @param {object} extractedFields - The fields object from a scan result
 * @returns {{ fingerprint: string|null, confidence: string|null, components: string[] }}
 */
export function computeProductFingerprint(extractedFields) {
  if (!extractedFields) return { fingerprint: null, confidence: null, components: [] }

  // Extract and normalise all available identity components
  const manufacturer = normalise(extractedFields.manufacturer_name?.value || '')
  const address = normalise(extractedFields.manufacturer_address?.value || '')
  const quantity = normalise(extractedFields.net_quantity?.value || '')
  const commonName = normalise(extractedFields.common_name?.value || '')
  const countryOrigin = normalise(extractedFields.country_of_origin?.value || '')

  // Collect non-empty components for the hash
  const components = []
  if (manufacturer) components.push(`mfr:${manufacturer}`)
  if (address) components.push(`addr:${address}`)
  if (quantity) components.push(`qty:${quantity}`)
  if (commonName) components.push(`name:${commonName}`)
  if (countryOrigin && countryOrigin !== 'domestic_no_import_indicators') {
    components.push(`origin:${countryOrigin}`)
  }

  // Need at least manufacturer name for a meaningful fingerprint
  if (!manufacturer) return { fingerprint: null, confidence: null, components: [] }

  // Determine confidence level based on available fields
  let confidence
  if (manufacturer && address && commonName && quantity) {
    confidence = 'HIGH'
  } else if (manufacturer && address && quantity) {
    confidence = 'MEDIUM'
  } else {
    confidence = 'LOW'
  }

  // Build the hash input from sorted components for determinism
  const hashInput = components.sort().join('||')
  const hash = djb2Hash(hashInput)

  const fingerprint = `v2:${confidence.toLowerCase()}:${hash}`

  return { fingerprint, confidence, components }
}

/**
 * Extract confidence level from a fingerprint string.
 * Handles both v2 (versioned) and legacy v1 (unversioned) fingerprints.
 *
 * @param {string} fingerprint - The fingerprint string
 * @returns {string|null} 'HIGH', 'MEDIUM', 'LOW', or null for legacy/unknown
 */
export function getFingerprintConfidence(fingerprint) {
  if (!fingerprint) return null
  const match = fingerprint.match(/^v2:(high|medium|low):/)
  if (match) {
    return match[1].toUpperCase()
  }
  // Legacy v1 fingerprints — no confidence info
  return null
}

/**
 * Compute legacy v1 fingerprint for backward compatibility.
 * Only used for comparing against old reports stored with v1 format.
 *
 * @param {object} extractedFields - The fields object from a scan result
 * @returns {string|null} Legacy fingerprint string
 */
export function computeLegacyFingerprint(extractedFields) {
  if (!extractedFields) return null

  const parts = [
    extractedFields.manufacturer_name?.value,
    extractedFields.manufacturer_address?.value,
    extractedFields.net_quantity?.value,
  ]

  if (!parts[0]) return null

  const normalised = parts
    .map(p => normalise(p || ''))
    .filter(Boolean)

  if (normalised.length === 0) return null

  return normalised.join('|')
}

// ---------------------------------------------------------------------------
// Create / Read / Update
// ---------------------------------------------------------------------------

/**
 * Create a compliance report from a scan.
 *
 * @param {string} userId - Authenticated user's ID
 * @param {string} scanId - The scan ID
 * @param {object} scanData - The scan data (name, score, status, extractedFields)
 * @param {string} concernSummary - AI-generated concern summary
 * @param {string} userDescription - User's additional description
 * @param {string} destination - Report destination (e.g., 'FSSAI Food Safety Connect')
 * @param {string} destinationType - 'official_portal' | 'email' | 'manual'
 * @returns {{ data, error }}
 */
export async function createComplianceReport(
  userId,
  scanId,
  scanData,
  concernSummary,
  userDescription = '',
  destination = 'FSSAI Food Safety Connect',
  destinationType = 'official_portal'
) {
  if (!supabase || !userId || !scanId) {
    return { data: null, error: 'Missing required parameters' }
  }

  // Compute product fingerprint from extracted fields
  const { fingerprint } = computeProductFingerprint(scanData.extractedFields)

  const payload = {
    user_id: userId,
    scan_id: scanId,
    product_name_snapshot: scanData.productName || 'Unknown Product',
    screening_score_snapshot: scanData.screeningScore ?? null,
    overall_status_snapshot: scanData.overallStatus || null,
    concern_summary: concernSummary || null,
    user_description: userDescription || null,
    report_destination: destination,
    destination_type: destinationType,
    status: 'DRAFT',
    product_fingerprint: fingerprint,
  }

  const { data, error } = await supabase
    .from('compliance_reports')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.error('[ComplianceReportService] Failed to create report:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

/**
 * Fetch all reports for the current user, newest first.
 */
export async function fetchUserReports(userId, { limit = 100, offset = 0 } = {}) {
  if (!supabase || !userId) return { data: [], error: null }

  const { data, error } = await supabase
    .from('compliance_reports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[ComplianceReportService] Failed to fetch reports:', error)
    return { data: [], error: error.message }
  }

  return { data: data || [], error: null }
}

/**
 * Fetch a single report by ID (RLS ensures ownership).
 */
export async function fetchReportById(reportId) {
  if (!supabase || !reportId) return { data: null, error: null }

  const { data, error } = await supabase
    .from('compliance_reports')
    .select('*')
    .eq('id', reportId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return { data: null, error: null }
    console.error('[ComplianceReportService] Failed to fetch report:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

/**
 * Update a report's status.
 */
export async function updateReportStatus(userId, reportId, status) {
  if (!supabase || !userId || !reportId) {
    return { data: null, error: 'Missing required parameters' }
  }

  const { data, error } = await supabase
    .from('compliance_reports')
    .update({ status })
    .eq('id', reportId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('[ComplianceReportService] Failed to update report:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// Cross-User Product Report Lookup
// ---------------------------------------------------------------------------

/**
 * Look up existing reports for the same product (by fingerprint).
 * Uses the SECURITY DEFINER RPC function which returns only safe public
 * fields — no user_id or user_description is ever exposed.
 *
 * Also looks up legacy v1 fingerprints for backward compatibility.
 *
 * @param {string} fingerprint - The product fingerprint from computeProductFingerprint()
 * @param {object} extractedFields - Original extracted fields for legacy fallback
 * @returns {{ data, error, confidence }} Array of safe report summaries + confidence level
 */
export async function fetchReportsByFingerprint(fingerprint, extractedFields = null) {
  if (!supabase || !fingerprint) return { data: [], error: null, confidence: null }

  const confidence = getFingerprintConfidence(fingerprint)

  // Try v2 fingerprint first
  const { data, error } = await supabase.rpc('get_product_reports', {
    p_fingerprint: fingerprint,
  })

  if (error) {
    console.warn('[ComplianceReportService] Product report lookup unavailable:', error.message)
    return { data: [], error: error.message, confidence }
  }

  // If v2 found results, return them
  if (data && data.length > 0) {
    return { data: data || [], error: null, confidence }
  }

  // Fallback: try legacy v1 fingerprint for backward compatibility
  if (extractedFields) {
    const legacyFp = computeLegacyFingerprint(extractedFields)
    if (legacyFp && legacyFp !== fingerprint) {
      const { data: legacyData, error: legacyError } = await supabase.rpc('get_product_reports', {
        p_fingerprint: legacyFp,
      })

      if (!legacyError && legacyData && legacyData.length > 0) {
        // Legacy matches have unknown confidence
        return { data: legacyData || [], error: null, confidence: null }
      }
    }
  }

  return { data: data || [], error: null, confidence }
}

/**
 * Check if the current user has already reported this product.
 *
 * @param {string} userId - Current user's ID
 * @param {string} fingerprint - Product fingerprint
 * @returns {{ exists: boolean, report: object|null }}
 */
export async function checkExistingUserReport(userId, fingerprint) {
  if (!supabase || !userId || !fingerprint) return { exists: false, report: null }

  const { data, error } = await supabase
    .from('compliance_reports')
    .select('*')
    .eq('user_id', userId)
    .eq('product_fingerprint', fingerprint)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) {
    return { exists: false, report: null }
  }

  return { exists: true, report: dbRowToReport(data[0]) }
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Convert a DB row to the camelCase shape used by the frontend.
 */
export function dbRowToReport(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    scanId: row.scan_id,
    productNameSnapshot: row.product_name_snapshot,
    screeningScoreSnapshot: row.screening_score_snapshot,
    overallStatusSnapshot: row.overall_status_snapshot,
    concernSummary: row.concern_summary,
    userDescription: row.user_description,
    reportDestination: row.report_destination,
    destinationType: row.destination_type,
    status: row.status,
    productFingerprint: row.product_fingerprint || null,
    fingerprintConfidence: getFingerprintConfidence(row.product_fingerprint),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
