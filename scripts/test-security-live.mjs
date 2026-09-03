/**
 * STEP 14E — SECURITY TESTS (Live Authenticated)
 * 
 * Tests security requirements 1-11 using real authenticated sessions.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env')
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  const env = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
  }
  return env
}

const env = loadEnv()
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const results = []

function log(testNum, name, passed, detail = '') {
  const icon = passed ? '✅' : '❌'
  results.push({ testNum, name, passed, detail })
  console.log(`  ${icon} ${testNum}. ${name}${detail ? ': ' + detail : ''}`)
}

async function main() {
  console.log('🔒 SECURITY TESTS — Live Authenticated')
  console.log('═'.repeat(60))

  // ── Setup: Create test users ──
  console.log('\n📋 Setting up test users...')

  const ts = Date.now()

  // Seller A (with real existing profile)
  const { data: sellerA } = await admin.auth.admin.createUser({
    email: `sec-sellerA-${ts}@test.example.com`, password: 'Test123!', email_confirm: true,
  })
  const sellerAId = sellerA?.user?.id

  // Seller B (different seller)
  const { data: sellerB } = await admin.auth.admin.createUser({
    email: `sec-sellerB-${ts}@test.example.com`, password: 'Test123!', email_confirm: true,
  })
  const sellerBId = sellerB?.user?.id

  // Buyer A
  const { data: buyerA } = await admin.auth.admin.createUser({
    email: `sec-buyerA-${ts}@test.example.com`, password: 'Test123!', email_confirm: true,
  })
  const buyerAId = buyerA?.user?.id

  // Buyer B (different buyer)
  const { data: buyerB } = await admin.auth.admin.createUser({
    email: `sec-buyerB-${ts}@test.example.com`, password: 'Test123!', email_confirm: true,
  })
  const buyerBId = buyerB?.user?.id

  if (!sellerAId || !sellerBId || !buyerAId || !buyerBId) {
    console.log('❌ Failed to create test users')
    return
  }

  // Set up profiles
  for (const [uid, role, email] of [
    [sellerAId, 'seller', `sec-sellerA-${ts}@test.example.com`],
    [sellerBId, 'seller', `sec-sellerB-${ts}@test.example.com`],
    [buyerAId, 'buyer', `sec-buyerA-${ts}@test.example.com`],
    [buyerBId, 'buyer', `sec-buyerB-${ts}@test.example.com`],
  ]) {
    await admin.from('user_profiles').upsert({ id: uid, role, email, full_name: `Test ${role}` })
  }

  // Set up seller profiles
  for (const [uid, name, city] of [
    [sellerAId, 'Security Test Shop A', 'Mumbai'],
    [sellerBId, 'Security Test Shop B', 'Delhi'],
  ]) {
    await admin.from('seller_profiles').upsert({
      user_id: uid, shop_name: name, owner_name: name, business_type: 'retail',
      address: '123 Test St', city, state: city === 'Mumbai' ? 'Maharashtra' : 'Delhi',
      pincode: city === 'Mumbai' ? '400001' : '110001', phone: '9876543210',
      verification_type: 'not_available', verification_status: 'NOT_APPLICABLE',
    })
  }

  // Create products for both sellers
  // Seller A: product with score 85 (>= 70), LISTED
  const { data: scanA } = await admin.from('product_scans').insert({
    user_id: sellerAId, product_name: 'Sec Test Product A', ocr_engine: 'test',
    ocr_confidence: 95, overall_status: 'COMPLIANT', screening_score: 85,
    scan_duration_ms: 1000, raw_ocr: {}, extracted_fields: {}, rule_results: {}, limitations: {},
  }).select().single()

  const { data: productA } = await admin.from('products').insert({
    scan_id: scanA.id, seller_user_id: sellerAId, product_name: 'Sec Test Product A',
    screening_score: 85, overall_status: 'COMPLIANT', rule_results: {},
  }).select().single()

  await admin.from('seller_listings').insert({
    seller_user_id: sellerAId, product_id: productA.id, listing_status: 'LISTED', listing_price: 99.00, listed_at: new Date().toISOString(),
  })

  // Seller A: product with score 50 (< 70) — should NOT be orderable
  const { data: scanLow } = await admin.from('product_scans').insert({
    user_id: sellerAId, product_name: 'Low Score Product', ocr_engine: 'test',
    ocr_confidence: 95, overall_status: 'NON_COMPLIANT', screening_score: 50,
    scan_duration_ms: 1000, raw_ocr: {}, extracted_fields: {}, rule_results: {}, limitations: {},
  }).select().single()

  const { data: productLow } = await admin.from('products').insert({
    scan_id: scanLow.id, seller_user_id: sellerAId, product_name: 'Low Score Product',
    screening_score: 50, overall_status: 'NON_COMPLIANT', rule_results: {},
  }).select().single()

  await admin.from('seller_listings').insert({
    seller_user_id: sellerAId, product_id: productLow.id, listing_status: 'LISTED', listing_price: 99.00, listed_at: new Date().toISOString(),
  })

  // Seller A: product with score 85 but UNLISTED
  const { data: scanUnlisted } = await admin.from('product_scans').insert({
    user_id: sellerAId, product_name: 'Unlisted Product', ocr_engine: 'test',
    ocr_confidence: 95, overall_status: 'COMPLIANT', screening_score: 85,
    scan_duration_ms: 1000, raw_ocr: {}, extracted_fields: {}, rule_results: {}, limitations: {},
  }).select().single()

  const { data: productUnlisted } = await admin.from('products').insert({
    scan_id: scanUnlisted.id, seller_user_id: sellerAId, product_name: 'Unlisted Product',
    screening_score: 85, overall_status: 'COMPLIANT', rule_results: {},
  }).select().single()

  await admin.from('seller_listings').insert({
    seller_user_id: sellerAId, product_id: productUnlisted.id, listing_status: 'UNLISTED', listed_at: new Date().toISOString(),
  })

  // Seller B: product with score 80, LISTED
  const { data: scanB } = await admin.from('product_scans').insert({
    user_id: sellerBId, product_name: 'Sec Test Product B', ocr_engine: 'test',
    ocr_confidence: 95, overall_status: 'COMPLIANT', screening_score: 80,
    scan_duration_ms: 1000, raw_ocr: {}, extracted_fields: {}, rule_results: {}, limitations: {},
  }).select().single()

  const { data: productB } = await admin.from('products').insert({
    scan_id: scanB.id, seller_user_id: sellerBId, product_name: 'Sec Test Product B',
    screening_score: 80, overall_status: 'COMPLIANT', rule_results: {},
  }).select().single()

  await admin.from('seller_listings').insert({
    seller_user_id: sellerBId, product_id: productB.id, listing_status: 'LISTED', listing_price: 99.00, listed_at: new Date().toISOString(),
  })

  console.log('   ✅ Test users and products created\n')

  // ── Sign in as Buyer A and place order ──
  const buyerAClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  await buyerAClient.auth.signInWithPassword({ email: `sec-buyerA-${ts}@test.example.com`, password: 'Test123!' })

  const { data: orderResult } = await buyerAClient.rpc('place_order', {
    p_product_id: productA.id,
    p_quantity: 1,
    p_delivery_address: { full_name: 'Buyer A', phone: '9876543210', address_line: '123 A St', city: 'Mumbai', state: 'Maharashtra', pin_code: '400001' },
  })
  const orderId = orderResult?.order_id
  console.log(`   Order created: ${orderId?.slice(0, 8)}\n`)

  // ── Sign in as Seller A and transition to READY_FOR_PICKUP ──
  const sellerAClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  await sellerAClient.auth.signInWithPassword({ email: `sec-sellerA-${ts}@test.example.com`, password: 'Test123!' })

  for (const status of ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP']) {
    await sellerAClient.rpc('update_order_status', { p_order_id: orderId, p_new_status: status })
  }

  // Create delivery
  await sellerAClient.rpc('create_delivery', {
    p_order_id: orderId, p_provider: 'demo', p_status: 'CREATED',
    p_pickup_address: { city: 'Mumbai' }, p_drop_address: { city: 'Mumbai' },
    p_delivery_fee: 59, p_eta_minutes: 45, p_courier_name: 'Demo Courier Partner',
  })

  // Get delivery ID
  const { data: delivery } = await admin.from('deliveries').select('id').eq('order_id', orderId).single()
  const deliveryId = delivery?.id
  console.log(`   Delivery created: ${deliveryId?.slice(0, 8)}\n`)

  // ══════════════════════════════════════════════════════════
  // SECURITY TESTS
  // ══════════════════════════════════════════════════════════

  // 1. Buyer cannot read another buyer's order
  {
    const buyerBClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
    await buyerBClient.auth.signInWithPassword({ email: `sec-buyerB-${ts}@test.example.com`, password: 'Test123!' })
    const { data, error } = await buyerBClient.from('orders').select('*').eq('id', orderId)
    log(1, 'Buyer cannot read another buyer\'s order', !error && (!data || data.length === 0), error?.message || `found=${data?.length}`)
  }

  // 2. Seller cannot read another seller's order
  {
    const sellerBClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
    await sellerBClient.auth.signInWithPassword({ email: `sec-sellerB-${ts}@test.example.com`, password: 'Test123!' })
    const { data, error } = await sellerBClient.from('orders').select('*').eq('id', orderId)
    log(2, 'Seller cannot read another seller\'s order', !error && (!data || data.length === 0), error?.message || `found=${data?.length}`)
  }

  // 3. Buyer cannot create delivery
  {
    const buyerBClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
    await buyerBClient.auth.signInWithPassword({ email: `sec-buyerB-${ts}@test.example.com`, password: 'Test123!' })
    const { error } = await buyerBClient.rpc('create_delivery', {
      p_order_id: orderId, p_provider: 'demo', p_status: 'CREATED',
    })
    log(3, 'Buyer cannot create delivery', !!error, error?.message || 'No error (BAD!)')
  }

  // 4. Buyer cannot update delivery
  {
    const buyerAClient2 = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
    await buyerAClient2.auth.signInWithPassword({ email: `sec-buyerA-${ts}@test.example.com`, password: 'Test123!' })
    const { error } = await buyerAClient2.rpc('update_delivery_status', {
      p_delivery_id: deliveryId, p_new_status: 'CANCELLED',
    })
    log(4, 'Buyer cannot update delivery', !!error, error?.message || 'No error (BAD!)')
  }

  // 5. Seller B cannot update Seller A's delivery
  {
    const sellerBClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
    await sellerBClient.auth.signInWithPassword({ email: `sec-sellerB-${ts}@test.example.com`, password: 'Test123!' })
    const { error } = await sellerBClient.rpc('update_delivery_status', {
      p_delivery_id: deliveryId, p_new_status: 'CANCELLED',
    })
    log(5, 'Seller B cannot update Seller A\'s delivery', !!error, error?.message || 'No error (BAD!)')
  }

  // 6. Duplicate delivery creation fails (order already has a delivery)
  {
    const { error } = await sellerAClient.rpc('create_delivery', {
      p_order_id: orderId, p_provider: 'demo', p_status: 'CREATED',
      p_pickup_address: { city: 'Mumbai' }, p_drop_address: { city: 'Mumbai' },
    })
    // Error should mention either "already exists" or "not READY_FOR_PICKUP"
    const isBlocked = error?.message?.includes('already exists') || error?.message?.includes('READY_FOR_PICKUP')
    log(6, 'Duplicate delivery creation fails', isBlocked, error?.message || 'No error (BAD!)')
  }

  // 7. Delivery cannot be created before READY_FOR_PICKUP
  // Create a new PENDING order and try to create delivery
  {
    const { data: newOrderResult } = await buyerAClient.rpc('place_order', {
      p_product_id: productA.id,
      p_quantity: 1,
      p_delivery_address: { full_name: 'Buyer A', phone: '9876543210', address_line: '123 A St', city: 'Mumbai', state: 'Maharashtra', pin_code: '400001' },
    })
    const { error } = await sellerAClient.rpc('create_delivery', {
      p_order_id: newOrderResult?.order_id, p_provider: 'demo', p_status: 'CREATED',
      p_pickup_address: { city: 'Mumbai' }, p_drop_address: { city: 'Mumbai' },
    })
    log(7, 'Delivery cannot be created before READY_FOR_PICKUP', !!error, error?.message || 'No error (BAD!)')
  }

  // 8. Buyer cannot order a product below 70
  {
    const { error } = await buyerAClient.rpc('place_order', {
      p_product_id: productLow.id,
      p_quantity: 1,
      p_delivery_address: { full_name: 'Buyer A', phone: '9876543210', address_line: '123 A St', city: 'Mumbai', state: 'Maharashtra', pin_code: '400001' },
    })
    log(8, 'Buyer cannot order product below 70', !!error, error?.message || 'No error (BAD!)')
  }

  // 9. Buyer cannot order an unlisted product
  {
    const { error } = await buyerAClient.rpc('place_order', {
      p_product_id: productUnlisted.id,
      p_quantity: 1,
      p_delivery_address: { full_name: 'Buyer A', phone: '9876543210', address_line: '123 A St', city: 'Mumbai', state: 'Maharashtra', pin_code: '400001' },
    })
    log(9, 'Buyer cannot order unlisted product', !!error, error?.message || 'No error (BAD!)')
  }

  // 10. Buyer identity cannot be spoofed (buyer cannot update order status)
  {
    const { error } = await buyerAClient.rpc('update_order_status', {
      p_order_id: orderId, p_new_status: 'DELIVERED',
    })
    log(10, 'Buyer cannot update order status (identity not spoofable)', !!error, error?.message || 'No error (BAD!)')
  }

  // 11. Seller identity cannot be spoofed (seller A cannot update seller B's order)
  {
    // Create an order from buyer B to seller B
    const buyerBClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
    await buyerBClient.auth.signInWithPassword({ email: `sec-buyerB-${ts}@test.example.com`, password: 'Test123!' })
    const { data: sellerBOrder } = await buyerBClient.rpc('place_order', {
      p_product_id: productB.id,
      p_quantity: 1,
      p_delivery_address: { full_name: 'Buyer B', phone: '9876543211', address_line: '456 B St', city: 'Delhi', state: 'Delhi', pin_code: '110001' },
    })

    // Seller A tries to update seller B's order
    const { error } = await sellerAClient.rpc('update_order_status', {
      p_order_id: sellerBOrder?.order_id, p_new_status: 'ACCEPTED',
    })
    log(11, 'Seller A cannot update Seller B\'s order (identity not spoofable)', !!error, error?.message || 'No error (BAD!)')
  }

  // ══════════════════════════════════════════════════════════
  // CLEANUP
  // ══════════════════════════════════════════════════════════
  console.log('\n🧹 Cleaning up test data...')
  
  // Delete test products
  await admin.from('seller_listings').delete().in('product_id', [productA.id, productLow.id, productUnlisted.id, productB.id])
  await admin.from('products').delete().in('id', [productA.id, productLow.id, productUnlisted.id, productB.id])
  await admin.from('product_scans').delete().in('id', [scanA.id, scanLow.id, scanUnlisted.id, scanB.id])
  
  // Delete test orders (cascade will handle order_items and deliveries)
  await admin.from('orders').delete().in('id', [orderId])
  
  // Delete test users
  for (const uid of [sellerAId, sellerBId, buyerAId, buyerBId]) {
    try { await admin.auth.admin.deleteUser(uid) } catch (e) {}
  }
  
  // Delete test seller profiles
  await admin.from('seller_profiles').delete().in('user_id', [sellerAId, sellerBId])
  await admin.from('user_profiles').delete().in('id', [sellerAId, sellerBId, buyerAId, buyerBId])
  
  console.log('   Done.\n')

  // ══════════════════════════════════════════════════════════
  // REPORT
  // ══════════════════════════════════════════════════════════
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  console.log('═'.repeat(60))
  console.log('  📊 SECURITY TEST RESULTS')
  console.log('═'.repeat(60))
  for (const r of results) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.testNum}. ${r.name}${r.detail ? ': ' + r.detail : ''}`)
  }
  console.log(`\n  Total: ${results.length} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`)
  console.log(`  Overall: ${failed === 0 ? '✅ ALL PASSED' : `❌ ${failed} FAILURES`}`)
  console.log('═'.repeat(60))
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1) })
