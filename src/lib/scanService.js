import { supabase } from './supabase'

/**
 * Scan Service — Supabase CRUD for the product_scans table.
 *
 * Each scan is linked to the authenticated user via RLS.
 * The backend runs OCR + rules and returns the result;
 * this service persists that result to the database.
 */

/**
 * Persist a scan result to Supabase.
 *
 * @param {string} userId - Authenticated user's ID
 * @param {object} scanResult - The full scan result from /api/scan
 * @param {string|null} imagePath - Path to saved image (e.g. /uploads/filename.jpg)
 * @returns {{ data, error }}
 */
export async function persistScan(userId, scanResult, imagePathOrPaths = null) {
  if (!supabase || !userId) {
    return { data: null, error: 'Supabase not configured or user not authenticated' }
  }

  // Support both single path (string) and multiple paths (array)
  const imagePaths = Array.isArray(imagePathOrPaths)
    ? imagePathOrPaths
    : imagePathOrPaths
      ? [imagePathOrPaths]
      : scanResult.files
        ? scanResult.files.map(f => f.url)
        : scanResult.file?.url
          ? [scanResult.file.url]
          : []

  // Persist rule_set_version in limitations array for DB storage
  // (no dedicated column needed — parsed back out in dbRowToScan)
  const limitations = [...(scanResult.limitations || [])]
  if (scanResult.rule_set_version) {
    limitations.unshift(`Rule Set ${scanResult.rule_set_version}`)
  }

  const payload = {
    user_id: userId,
    product_name: scanResult.fields?.manufacturer_name?.value
      || scanResult.fields?.product_name?.value
      || null,
    image_path: imagePaths[0] || null,
    image_paths: imagePaths.length > 1 ? imagePaths : null,
    ocr_engine: scanResult.ocr?.engine || null,
    ocr_confidence: scanResult.ocr?.average_confidence ?? null,
    overall_status: scanResult.overall_status || 'REVIEW_REQUIRED',
    screening_score: scanResult.screening_score?.screening_score ?? null,
    scan_duration_ms: scanResult.timing?.total_seconds
      ? Math.round(scanResult.timing.total_seconds * 1000)
      : null,
    raw_ocr: scanResult.ocr || null,
    extracted_fields: scanResult.fields || null,
    rule_results: scanResult.rule_results || null,
    limitations: limitations,
  }

  const { data, error } = await supabase
    .from('product_scans')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.error('[ScanService] Failed to persist scan:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

/**
 * Fetch all scans for the current user, newest first.
 */
export async function fetchUserScans(userId, { limit = 100, offset = 0 } = {}) {
  if (!supabase || !userId) return { data: [], error: null }

  const { data, error } = await supabase
    .from('product_scans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[ScanService] Failed to fetch scans:', error)
    return { data: [], error: error.message }
  }

  return { data: data || [], error: null }
}

/**
 * Fetch a single scan by ID (RLS ensures ownership).
 */
export async function fetchScanById(scanId) {
  if (!supabase || !scanId) return { data: null, error: null }

  const { data, error } = await supabase
    .from('product_scans')
    .select('*')
    .eq('id', scanId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return { data: null, error: null }
    console.error('[ScanService] Failed to fetch scan:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

/**
 * Fetch scan counts for the dashboard.
 * Returns { total, noIssues, potentialIssues, reviewRequired }
 */
export async function fetchScanStats(userId) {
  if (!supabase || !userId) {
    return { total: 0, noIssues: 0, potentialIssues: 0, reviewRequired: 0, error: null }
  }

  const { data, error } = await supabase
    .from('product_scans')
    .select('overall_status')
    .eq('user_id', userId)

  if (error) {
    console.error('[ScanService] Failed to fetch stats:', error)
    return { total: 0, noIssues: 0, potentialIssues: 0, reviewRequired: 0, error: error.message }
  }

  const scans = data || []
  return {
    total: scans.length,
    noIssues: scans.filter((s) => s.overall_status === 'NO_ISSUES_DETECTED').length,
    potentialIssues: scans.filter((s) => s.overall_status === 'POTENTIAL_NON_COMPLIANCE').length,
    reviewRequired: scans.filter((s) => s.overall_status === 'REVIEW_REQUIRED' || s.overall_status === 'INSUFFICIENT_EVIDENCE').length,
    error: null,
  }
}

/**
 * Convert a DB row to the camelCase shape used by the frontend.
 */
export function dbRowToScan(row) {
  if (!row) return null

  // Extract rule_set_version from limitations array (persisted with 'Rule Set v1.0' prefix)
  const limitations = row.limitations || []
  let ruleSetVersion = null
  const filteredLimitations = []
  for (const note of limitations) {
    const match = typeof note === 'string' && note.match(/^Rule Set (v[\d.]+)$/)
    if (match) {
      ruleSetVersion = match[1]
    } else {
      filteredLimitations.push(note)
    }
  }

  return {
    id: row.id,
    userId: row.user_id,
    productName: row.product_name || 'Unknown Product',
    imagePath: row.image_path,
    ocrEngine: row.ocr_engine,
    ocrConfidence: row.ocr_confidence,
    overallStatus: row.overall_status,
    screeningScore: row.screening_score,
    scanDurationMs: row.scan_duration_ms,
    rawOcr: row.raw_ocr,
    extractedFields: row.extracted_fields,
    ruleResults: row.rule_results,
    limitations: filteredLimitations,
    ruleSetVersion: ruleSetVersion,
    createdAt: row.created_at,
  }
}
