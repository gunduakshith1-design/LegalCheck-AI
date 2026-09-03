/**
 * Order Bill Generator — creates a clean, printable HTML document.
 *
 * Uses browser print-to-PDF: generates HTML with print-friendly CSS,
 * opens it in a new window, and triggers the browser print dialog.
 *
 * No external dependencies required.
 */

/**
 * Generate and download/print an order bill.
 *
 * @param {object} order - The order object (from dbRowToOrder)
 * @param {object|null} delivery - The delivery object (from dbRowToDelivery)
 * @param {object|null} sellerInfo - Seller shop info { shop_name, city, state }
 */
export function generateOrderBill(order, delivery, sellerInfo) {
  if (!order) return

  const firstItem = order.items?.[0]
  const productName = firstItem?.productNameSnapshot || 'Product'
  const quantity = firstItem?.quantity || 0
  const unitPrice = firstItem?.unitPrice
  const subtotal = unitPrice != null ? unitPrice * quantity : null
  const deliveryFee = order.deliveryFee
  const totalAmount = order.totalAmount

  const orderDate = new Date(order.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const statusLabel = {
    PENDING: 'Order Placed',
    ACCEPTED: 'Accepted',
    PREPARING: 'Preparing',
    READY_FOR_PICKUP: 'Ready for Pickup',
    OUT_FOR_DELIVERY: 'Out for Delivery',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
    REJECTED: 'Rejected',
  }[order.status] || order.status

  const deliveryStatus = delivery ? {
    CREATED: 'Delivery Created',
    ASSIGNED: 'Rider Assigned',
    PICKED_UP: 'Picked Up',
    OUT_FOR_DELIVERY: 'Out for Delivery',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
  }[delivery.status] || delivery.status : null

  const shopName = sellerInfo?.shop_name || 'Seller'
  const shopLocation = sellerInfo?.city && sellerInfo?.state
    ? `${sellerInfo.city}, ${sellerInfo.state}`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Order Bill — ${order.id.slice(0, 8)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #1a1a1a;
    background: #fff;
    padding: 40px;
    max-width: 800px;
    margin: 0 auto;
    line-height: 1.5;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }
  .brand h1 {
    font-size: 20px;
    font-weight: 700;
    color: #1a1a1a;
  }
  .brand p {
    font-size: 12px;
    color: #666;
    margin-top: 2px;
  }
  .doc-title {
    text-align: right;
  }
  .doc-title h2 {
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
  }
  .doc-title p {
    font-size: 12px;
    color: #666;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 24px;
  }
  .meta-box h3 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #888;
    margin-bottom: 4px;
  }
  .meta-box p {
    font-size: 13px;
    color: #1a1a1a;
  }
  .meta-box .mono {
    font-family: 'SF Mono', 'Consolas', monospace;
    font-size: 12px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
  }
  th {
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #888;
    padding: 8px 12px;
    border-bottom: 1px solid #e5e5e5;
  }
  th:last-child {
    text-align: right;
  }
  td {
    padding: 12px;
    font-size: 13px;
    border-bottom: 1px solid #f0f0f0;
  }
  td:last-child {
    text-align: right;
    font-weight: 500;
  }
  .totals {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 24px;
  }
  .totals-box {
    width: 280px;
  }
  .totals-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 13px;
    color: #555;
  }
  .totals-row.total {
    border-top: 2px solid #1a1a1a;
    padding-top: 10px;
    margin-top: 4px;
    font-weight: 700;
    font-size: 15px;
    color: #1a1a1a;
  }
  .totals-row .pending {
    color: #b45309;
    font-style: italic;
  }
  .status-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    background: #f3f4f6;
    color: #374151;
  }
  .notice {
    padding: 12px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 6px;
    margin-bottom: 24px;
  }
  .notice p {
    font-size: 12px;
    color: #92400e;
  }
  .footer {
    border-top: 1px solid #e5e5e5;
    padding-top: 16px;
    margin-top: 24px;
  }
  .footer p {
    font-size: 11px;
    color: #999;
    text-align: center;
  }
  @media print {
    body { padding: 20px; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="brand">
    <h1>LegalCheck AI</h1>
    <p>AI-assisted product compliance screening</p>
  </div>
  <div class="doc-title">
    <h2>Order Bill</h2>
    <p>${orderDate}</p>
  </div>
</div>

<div class="meta-grid">
  <div class="meta-box">
    <h3>Order ID</h3>
    <p class="mono">${order.id.slice(0, 8)}${order.id.length > 8 ? '...' : ''}</p>
  </div>
  <div class="meta-box">
    <h3>Order Status</h3>
    <p><span class="status-badge">${statusLabel}</span></p>
  </div>
  <div class="meta-box">
    <h3>Seller</h3>
    <p>${shopName}${shopLocation ? ` · ${shopLocation}` : ''}</p>
  </div>
  <div class="meta-box">
    <h3>Payment</h3>
    <p>Not collected (prototype)</p>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Item</th>
      <th>Qty</th>
      <th>Unit Price</th>
      <th>Amount</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>${escapeHtml(productName)}</td>
      <td>${quantity}</td>
      <td>${unitPrice != null ? '₹' + unitPrice.toFixed(2) : '—'}</td>
      <td>${subtotal != null ? '₹' + subtotal.toFixed(2) : '—'}</td>
    </tr>
  </tbody>
</table>

<div class="totals">
  <div class="totals-box">
    <div class="totals-row">
      <span>Subtotal</span>
      <span>${subtotal != null ? '₹' + subtotal.toFixed(2) : 'To be confirmed'}</span>
    </div>
    <div class="totals-row">
      <span>Delivery Fee</span>
      <span>${deliveryFee != null ? '₹' + deliveryFee.toFixed(2) : '<span class="pending">To be confirmed</span>'}</span>
    </div>
    ${delivery && deliveryStatus ? `
    <div class="totals-row">
      <span>Delivery Status</span>
      <span>${deliveryStatus}</span>
    </div>
    ` : ''}
    <div class="totals-row total">
      <span>Total</span>
      <span>${totalAmount != null ? '₹' + totalAmount.toFixed(2) : '<span class="pending">To be confirmed</span>'}</span>
    </div>
  </div>
</div>

<div class="notice">
  <p>
    <strong>Payment Notice:</strong> Payment integration will be added in the production release.
    No payment has been collected for this order. This document is an order summary, not a paid invoice.
  </p>
</div>

<div class="footer">
  <p>
    Generated by LegalCheck AI · SIH 2025<br>
    AI-assisted screening — not legal certification.
  </p>
</div>

</body>
</html>`

  // Open in new window and trigger print
  const printWindow = window.open('', '_blank', 'width=800,height=600')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
    // Small delay to ensure rendering, then trigger print
    setTimeout(() => {
      printWindow.print()
    }, 300)
  } else {
    // Fallback: download as HTML file
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `order-bill-${order.id.slice(0, 8)}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}

function escapeHtml(str) {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
