# Shiprocket API Integration — LegalCheck AI

## Status

- **Provider:** Shiprocket (https://www.shiprocket.in/)
- **API Base:** `https://apiv2.shiprocket.in/v1/external`
- **Documentation:** https://apidocs.shiprocket.in/ (also available via Postman: https://www.postman.com/shiprocketdev/shiprocket-dev-s-public-workspace)
- **Date verified:** 2026-08-31
- **Sandbox/test environment:** None publicly documented. All API calls go to production.

---

## 1. Authentication

| Field | Value |
|-------|-------|
| **Endpoint** | `POST /auth/login` |
| **URL** | `https://apiv2.shiprocket.in/v1/external/auth/login` |
| **Method** | POST |
| **Content-Type** | `application/json` |

**Request body:**
```json
{
  "email": "your-api-user-email@domain.com",
  "password": "your-api-user-password"
}
```

**Response:**
```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "created_at": "2026-08-31 12:00:00",
  "updated_at": "2026-08-31 12:00:00",
  "expires_at": "2026-09-10 12:00:00"
}
```

**Token validity:** 10 days (240 hours) from Shiprocket documentation.

**Usage:**
```
Authorization: Bearer <token>
```

**Account setup requirement:**
1. Go to Shiprocket Panel → Settings → API → Configure
2. Click "Create an API User"
3. Enter a valid email and password
4. These become the SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD

---

## 2. Courier Serviceability / Rate Check

| Field | Value |
|-------|-------|
| **Endpoint** | `GET /courier/serviceability/` |
| **URL** | `https://apiv2.shiprocket.in/v1/external/courier/serviceability/` |
| **Method** | GET |

**Required parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pickup_postcode` | integer | YES | Pickup pincode |
| `delivery_postcode` | integer | YES | Delivery pincode |
| `weight` | float | YES | Weight in kg |
| `cod` | integer | NO | 0 for prepaid, 1 for COD |

**Response:**
```json
{
  "status": 1,
  "data": {
    "available_courier_companies": [
      {
        "courier_company_id": 123,
        "courier_name": "Shiprocket Air",
        "rate": 45.0,
        "estimated_delivery_days": 3,
        "etd": "3-5 days",
        "rating": 4.5,
        ...
      }
    ]
  }
}
```

---

## 3. Create Order (Adhoc)

| Field | Value |
|-------|-------|
| **Endpoint** | `POST /orders/create/adhoc` |
| **URL** | `https://apiv2.shiprocket.in/v1/external/orders/create/adhoc` |
| **Method** | POST |
| **Content-Type** | `application/json` |

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `order_id` | string | Unique order reference (max 50 chars, avoid characters) |
| `order_date` | string | Date in `yyyy-mm-dd` format |
| `pickup_location` | string | Name of configured pickup location in Shiprocket |
| `billing_customer_name` | string | Customer first name |
| `billing_city` | string | Billing city (max 30 chars) |
| `billing_pincode` | integer | Billing pincode |
| `billing_state` | string | Billing state |
| `billing_country` | string | Billing country |
| `billing_email` | string | Billing email |
| `billing_phone` | integer | Billing phone |
| `shipping_is_billing` | boolean | `true` if same as billing |
| `order_items` | array | Array of order items |
| `order_items[].name` | string | Product name |
| `order_items[].sku` | string | Product SKU |
| `order_items[].units` | integer | Quantity |
| `order_items[].selling_price` | integer | Price per unit (inclusive of GST) |
| `length` | float | Package length in cm (must be > 0.5) |
| `breadth` | float | Package breadth in cm (must be > 0.5) |
| `height` | float | Package height in cm (must be > 0.5) |
| `weight` | float | Package weight in kg (must be > 0) |
| `payment_method` | string | `"COD"` or `"Prepaid"` |
| `sub_total` | integer | Total after deductions |

**Conditional required fields (when `shipping_is_billing` is false):**

| Field | Type | Description |
|-------|------|-------------|
| `shipping_customer_name` | string | Shipping name |
| `shipping_address` | string | Shipping address |
| `shipping_city` | string | Shipping city |
| `shipping_pincode` | integer | Shipping pincode |
| `shipping_state` | string | Shipping state |
| `shipping_country` | string | Shipping country |
| `shipping_phone` | integer | Shipping phone |

**Response:**
```json
{
  "order_id": 123456,
  "shipment_id": 789012
}
```

**Important notes:**
- `order_id` cannot be reused for existing orders
- New orders cannot use IDs of cancelled orders
- `sub_total` must be calculated correctly (not auto-calculated)

---

## 4. AWB Assignment

| Field | Value |
|-------|-------|
| **Endpoint** | `POST /courier/assign/awb` |
| **URL** | `https://apiv2.shiprocket.in/v1/external/courier/assign/awb` |
| **Method** | POST |

**Required parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `shipment_id` | integer | Shipment ID from order creation |
| `courier_id` | integer | Courier company ID from serviceability check |

**Response:**
```json
{
  "response": {
    "data": {
      "awb_code": "1234567890123",
      "courier_name": "Shiprocket Air"
    }
  }
}
```

---

## 5. Generate Pickup

| Field | Value |
|-------|-------|
| **Endpoint** | `POST /courier/generate/pickup` |
| **URL** | `https://apiv2.shiprocket.in/v1/external/courier/generate/pickup` |
| **Method** | POST |

**Required parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `shipment_id` | integer | Shipment ID |

**Response:**
```json
{
  "response": {
    "data": {
      "status": "1",
      "message": "Pickup scheduled"
    }
  }
}
```

---

## 6. Tracking by AWB

| Field | Value |
|-------|-------|
| **Endpoint** | `GET /courier/track/awb/{awb_code}` |
| **URL** | `https://apiv2.shiprocket.in/v1/external/courier/track/awb/{awb_code}` |
| **Method** | GET |

**Response:**
```json
{
  "tracking_data": {
    "shipment_id": "123456",
    "etd": "2026-09-03",
    "tracking_data": [
      {
        "date": "2026-08-31 12:00:00",
        "location": "Mumbai Hub",
        "activity": "Shipment picked up",
        "status": "6",
        "edd": ""
      }
    ]
  }
}
```

**Shiprocket status codes (approximate):**

| Code | Description |
|------|-------------|
| 1 | Shipment info received |
| 2 | Shipment picked up |
| 6 | Delivered |
| 7 | RTO initiated |
| 8 | Undelivered |
| 9 | Cancelled |
| 10 | Returned |
| 13 | Delayed |
| 18 | Reached destination hub |
| 38 | Out for delivery |
| 47 | EDD Delayed |
| 52 | Reached destination city |

---

## 7. Webhook

| Field | Value |
|-------|-------|
| **Setup** | Shiprocket Panel → Settings → API → Webhooks |
| **Security header** | `x-api-key` |
| **Expected response** | HTTP 200 only |

**Webhook payload structure (as documented):**
- Shiprocket POSTs tracking updates to configured URL
- Validates via `x-api-key` header
- Must return 200 to acknowledge receipt

**Configuration requirements:**
1. Set webhook URL in Shiprocket dashboard
2. Set security token (used as `x-api-key` header value)
3. URL must be publicly accessible
4. Do NOT use keywords like "shiprocket", "sr", "kr" in webhook URL

---

## 8. Order Cancellation

| Field | Value |
|-------|-------|
| **Endpoint** | `POST /orders/cancel` |
| **URL** | `https://apiv2.shiprocket.in/v1/external/orders/cancel` |
| **Method** | POST |

**Request body:**
```json
{
  "ids": [order_id_1, order_id_2]
}
```

---

## 9. Current API Limitations

1. **No sandbox/test environment** — All API calls go to production
2. **Pickup location must be pre-configured** in Shiprocket dashboard
3. **Weight and dimensions are mandatory** for order creation
4. **Order ID must be unique** and cannot be reused
5. **Token expires in 10 days** — must re-authenticate
6. **Rate limits apply** — specific limits not publicly documented
7. **Webhook URL must be publicly accessible** — cannot use localhost

---

## 10. Required Account Prerequisites

1. Active Shiprocket account
2. API user created (Settings → API → Configure → Create API User)
3. At least one pickup location configured
4. Wallet funded (for prepaid shipments)
5. Webhook URL configured (optional, for tracking updates)

---

## 11. Security Notes

- API credentials are backend-only (never exposed to frontend)
- JWT token is cached in memory, never stored in database
- Webhook secret is validated via `x-api-key` header
- No credentials appear in logs
- Provider payload does not contain credentials
