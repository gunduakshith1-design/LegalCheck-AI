/**
 * Download Report — generates a browser-safe HTML report and triggers download.
 *
 * No external dependencies. Uses standard browser APIs.
 * The generated HTML is print-ready and can be saved as PDF via browser print dialog.
 */

const DISCLAIMER = `This report is generated from an automated screening system and is not a legal certification or government determination. The screening score reflects configured declaration checks detected from the package image. It is a screening indicator, not a guarantee of legal compliance, product quality, safety, or authenticity.`

/**
 * Build the HTML content for a scan report.
 *
 * @param {object} scan - The scan data (from dbRowToScan)
 * @returns {string} Full HTML document string
 */
function buildReportHTML(scan) {
  const score = scan.screeningScore
  const isMet = score != null && score >= 70
  const scoreColor = isMet ? '#16a34a' : '#dc2626'
  const statusLabel = isMet ? 'Screening threshold met' : 'Review required — below 70% threshold'

  const ruleResults = scan.ruleResults || []
  const detected = ruleResults.filter(r => r.status === 'DETECTED')
  const uncertain = ruleResults.filter(r => r.status === 'UNCERTAIN')
  const notDetected = ruleResults.filter(r => r.status === 'NOT_DETECTED')
  const notApplicable = ruleResults.filter(r => r.status === 'NOT_APPLICABLE')

  const extractedFields = scan.extractedFields || {}
  const fieldEntries = Object.entries(extractedFields)

  const ocrRaw = scan.rawOcr?.raw_text || ''

  const ruleRows = ruleResults.map(rule => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:12px;color:#6b7280;">${rule.rule_id || ''}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:500;">${(rule.field || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#374151;">${rule.explanation || ''}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${rule.observed_value && rule.observed_value !== 'None' ? rule.observed_value : '—'}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${rule.confidence != null ? Math.round(rule.confidence * 100) + '%' : '—'}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">
        <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;${
          rule.status === 'DETECTED' ? 'background:#dcfce7;color:#166534;' :
          rule.status === 'NOT_DETECTED' ? 'background:#fee2e2;color:#991b1b;' :
          rule.status === 'UNCERTAIN' ? 'background:#fef3c7;color:#92400e;' :
          'background:#f3f4f6;color:#6b7280;'
        }">${rule.status}</span>
      </td>
    </tr>
  `).join('')

  const fieldRows = fieldEntries.map(([key, val]) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-weight:500;">${key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#374151;">${val?.value ?? val ?? '—'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${val?.confidence != null ? Math.round(val.confidence * 100) + '%' : '—'}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LegalCheck AI — Product Screening Report</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #111827;
      margin: 0;
      padding: 24px;
      line-height: 1.5;
      background: #fff;
    }
    h1 { font-size: 22px; margin: 0 0 4px 0; }
    h2 { font-size: 16px; margin: 20px 0 8px 0; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    h3 { font-size: 14px; margin: 12px 0 6px 0; color: #374151; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px; background: #f9fafb; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    td { vertical-align: top; }
    .meta { font-size: 13px; color: #6b7280; }
    .score-box { display: inline-block; padding: 4px 16px; border-radius: 8px; font-size: 28px; font-weight: 700; }
    .disclaimer { margin-top: 24px; padding: 12px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; font-size: 12px; color: #0369a1; }
    .print-btn { margin-top: 16px; padding: 8px 20px; background: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .print-btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>

  <div style="margin-top:16px;">
    <h1>LegalCheck AI</h1>
    <p style="margin:0;font-size:18px;font-weight:600;color:#2563eb;">Product Screening Report</p>
  </div>

  <div style="margin-top:16px;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
    <table style="width:100%;">
      <tr>
        <td style="padding:4px 0;width:120px;font-weight:500;">Product</td>
        <td style="padding:4px 0;">${scan.productName || 'Unknown Product'}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-weight:500;">Scan ID</td>
        <td style="padding:4px 0;font-family:monospace;font-size:12px;color:#6b7280;">${scan.id || '—'}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-weight:500;">Scan Date</td>
        <td style="padding:4px 0;">${scan.createdAt ? new Date(scan.createdAt).toLocaleString('en-IN') : '—'}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-weight:500;">OCR Engine</td>
        <td style="padding:4px 0;">${scan.ocrEngine || '—'}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-weight:500;">OCR Confidence</td>
        <td style="padding:4px 0;">${scan.ocrConfidence != null ? Math.round(scan.ocrConfidence * 100) + '%' : '—'}</td>
      </tr>
    </table>
  </div>

  <!-- Score -->
  <div style="margin-top:20px;padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;text-align:center;">
    <div class="score-box" style="color:${scoreColor};">${score != null ? Math.round(score) + '%' : 'N/A'}</div>
    <p style="margin:8px 0 0 0;font-weight:600;color:${scoreColor};">${statusLabel}</p>
    <div style="display:flex;justify-content:center;gap:24px;margin-top:12px;font-size:13px;">
      <span>Evaluated: ${ruleResults.length}</span>
      <span style="color:#16a34a;">Detected: ${detected.length}</span>
      <span style="color:#d97706;">Uncertain: ${uncertain.length}</span>
      <span style="color:#dc2626;">Not Detected: ${notDetected.length}</span>
      ${notApplicable.length > 0 ? `<span style="color:#6b7280;">N/A: ${notApplicable.length}</span>` : ''}
    </div>
  </div>

  ${ruleResults.length > 0 ? `
  <h2>Screening Rule Results</h2>
  <table>
    <thead>
      <tr>
        <th>Rule ID</th>
        <th>Field</th>
        <th>Explanation</th>
        <th>Observed Value</th>
        <th>Confidence</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${ruleRows}
    </tbody>
  </table>
  ` : ''}

  ${fieldEntries.length > 0 ? `
  <h2>Extracted Fields</h2>
  <table>
    <thead>
      <tr>
        <th>Field</th>
        <th>Value</th>
        <th>Confidence</th>
      </tr>
    </thead>
    <tbody>
      ${fieldRows}
    </tbody>
  </table>
  ` : ''}

  ${ocrRaw ? `
  <h2>Raw OCR Text</h2>
  <div style="padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;line-height:1.6;">${escapeHTML(ocrRaw)}</div>
  ` : ''}

  ${(scan.limitations && scan.limitations.length > 0) ? `
  <h2>Limitations</h2>
  <ul style="font-size:13px;color:#6b7280;">
    ${scan.limitations.map(l => `<li>${escapeHTML(typeof l === 'string' ? l : JSON.stringify(l))}</li>`).join('')}
  </ul>
  ` : ''}

  <div class="disclaimer">
    <strong>Disclaimer:</strong> ${DISCLAIMER}
  </div>

  <p style="margin-top:20px;font-size:11px;color:#9ca3af;">
    Generated by LegalCheck AI on ${new Date().toLocaleString('en-IN')} · Report ID: ${scan.id || '—'}
  </p>

  <button class="print-btn no-print" onclick="window.print()" style="margin-top:8px;">Print / Save as PDF</button>
</body>
</html>`
}

/**
 * Escape HTML special characters.
 */
function escapeHTML(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Generate and trigger download of the scan report.
 *
 * @param {object} scan - The scan data from dbRowToScan
 * @param {string} filename - Optional filename (defaults to scan ID)
 */
export function downloadScanReport(scan, filename) {
  if (!scan) return

  const html = buildReportHTML(scan)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename || `legalcheck-report-${scan.id || 'unknown'}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Generate complaint-ready text for the report concern flow.
 *
 * @param {object} scan - The scan data
 * @param {string} userDescription - User's additional description
 * @param {object} sellerInfo - { shopName, city, state }
 * @returns {string} Formatted complaint text
 */
export function generateComplaintText(scan, userDescription = '', sellerInfo = {}) {
  const ruleResults = scan.ruleResults || []
  const detectedConcerns = ruleResults
    .filter(r => r.status === 'NOT_DETECTED' || r.status === 'UNCERTAIN')
    .map(r => `- ${r.field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: ${r.explanation || 'No explanation provided'}${r.observed_value && r.observed_value !== 'None' ? ` (observed: ${r.observed_value})` : ''}`)
    .join('\n')

  const extractedEvidence = Object.entries(scan.extractedFields || {})
    .map(([k, v]) => `${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: ${v?.value ?? v ?? '—'}`)
    .join('\n')

  const sections = [
    `Subject: Potential Food Compliance Concern — LegalCheck AI Screening Report`,
    ``,
    `Product: ${scan.productName || 'Unknown Product'}`,
    `Screening Score: ${scan.screeningScore != null ? Math.round(scan.screeningScore) + '%' : 'N/A'}`,
    `Overall Status: ${scan.overallStatus || 'Unknown'}`,
    `Scan Date: ${scan.createdAt ? new Date(scan.createdAt).toLocaleString('en-IN') : 'Unknown'}`,
    ``,
    `Detected Concerns:`,
    detectedConcerns || 'None identified',
    ``,
  ]

  if (extractedEvidence) {
    sections.push(`Evidence (Extracted Fields):`)
    sections.push(extractedEvidence)
    sections.push(``)
  }

  if (sellerInfo.shopName || sellerInfo.city) {
    sections.push(`Seller/Store: ${sellerInfo.shopName || 'Unknown'}`)
    sections.push(`Location: ${[sellerInfo.city, sellerInfo.state].filter(Boolean).join(', ') || 'Not available'}`)
    sections.push(``)
  }

  if (userDescription) {
    sections.push(`Additional Comments:`)
    sections.push(userDescription)
    sections.push(``)
  }

  sections.push(`Disclaimer: LegalCheck AI is an automated screening system. This report does not constitute a legal finding, certification, or determination of food safety. The recipient authority should independently review the evidence.`)

  return sections.join('\n')
}

/**
 * Generate a subject line for the complaint email.
 */
export function generateComplaintSubject(scan) {
  return `Potential Food Compliance Concern — ${scan.productName || 'Unknown Product'} — LegalCheck AI Screening Report`
}
