import { useState, useEffect, useCallback, useMemo } from 'react'

const STORAGE_KEY = 'legalcheck_scans'

/**
 * Scan Store — localStorage-backed client-side scan records.
 * 
 * Each scan record:
 *   { id, productName, timestamp, status, issueCount, fields, imageUrl }
 * 
 * This is the single source of truth for all scan data on the frontend.
 * When a backend is added, replace localStorage calls with API calls.
 */

function loadScans() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveScans(scans) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scans))
}

export function useScanStore() {
  const [scans, setScans] = useState(() => loadScans())

  useEffect(() => {
    saveScans(scans)
  }, [scans])

  const addScan = useCallback((scan) => {
    setScans((prev) => [scan, ...prev])
  }, [])

  const getScan = useCallback(
    (id) => scans.find((s) => s.id === id),
    [scans]
  )

  const totalScans = scans.length
  const passedScans = useMemo(() => scans.filter((s) => s.status === 'PASS').length, [scans])
  const issueScans = useMemo(() => scans.filter((s) => s.status !== 'PASS').length, [scans])

  return useMemo(() => ({
    scans,
    addScan,
    getScan,
    totalScans,
    passedScans,
    issueScans,
  }), [scans, addScan, getScan, totalScans, passedScans, issueScans])
}

/**
 * TEMPORARY MOCK ANALYSIS — will be replaced with real OCR/AI/rule engine.
 * 
 * Simulates a scan result for testing data flow:
 *   Scan → create record → store → dashboard/history update
 */
export function mockAnalyzeProduct(imageFile) {
  const id = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const statuses = ['PASS', 'PASS', 'PASS', 'WARNING', 'VIOLATION']
  const status = statuses[Math.floor(Math.random() * statuses.length)]

  const fieldTemplates = [
    { field: 'Product Name', value: imageFile?.name?.replace(/\.[^.]+$/, '') || 'Unknown Product' },
    { field: 'MRP', value: `₹${(Math.random() * 500 + 50).toFixed(0)}` },
    { field: 'Net Quantity', value: ['500g', '1kg', '2kg', '500ml', '1L'][Math.floor(Math.random() * 5)] },
    { field: 'Manufacturer', value: 'ABC Foods Pvt Ltd' },
    { field: 'Manufacturer Address', value: '123 Industrial Area, Mumbai 400001' },
    { field: 'Date Declaration', value: new Date().toLocaleDateString('en-IN') },
    { field: 'Consumer Care', value: '+91-9876543210' },
  ]

  const fields = fieldTemplates.map((f) => ({
    ...f,
    confidence: Math.floor(Math.random() * 25 + 75),
    status: status === 'PASS' ? 'PASS' : Math.random() > 0.5 ? 'WARNING' : 'VIOLATION',
    evidence: `Detected from package image`,
  }))

  const issueCount = fields.filter((f) => f.status !== 'PASS').length

  const imageUrl = imageFile ? URL.createObjectURL(imageFile) : null

  return {
    id,
    productName: fields[0].value,
    timestamp: new Date().toISOString(),
    status,
    issueCount,
    fields,
    imageUrl,
  }
}
