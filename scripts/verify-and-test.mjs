/**
 * End-to-end verification of the compliance report flow.
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = readFileSync('.env', 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// --- Fingerprint (mirrors src/lib/reportService.js) ---
function normalise(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    // Remove punctuation EXCEPT dots between digits
    .replace(/(?!\d)\.(?!\d)/g, '')
    .replace(/[;,:!?()\/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\d)\s+(g|kg|ml|l|gm|gms|ltr|ltrs|cm|mm)\b/g, '$1$2')
    .replace(/gms?\b/g, 'g')
    .replace(/mls?\b/g, 'ml')
    .replace(/ltrs?\b/g, 'l');
}

function computeProductFingerprint(extractedFields) {
  if (!extractedFields) return null;
  const parts = [
    extractedFields.manufacturer_name?.value,
    extractedFields.manufacturer_address?.value,
    extractedFields.net_quantity?.value,
  ];
  if (!parts[0]) return null;
  const normalised = parts.map(p => normalise(p || '')).filter(Boolean);
  if (normalised.length === 0) return null;
  return normalised.join('|');
}

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

async function main() {
  // ============================================================
  console.log('=== TEST 1: Migration 011 Applied ===\n');

  const { error: colErr } = await supabase.from('compliance_reports').select('product_fingerprint').limit(1);
  assert(!colErr, 'product_fingerprint column exists');

  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_product_reports', { p_fingerprint: '__test__' });
  assert(!rpcErr, 'get_product_reports RPC function exists');
  assert(Array.isArray(rpcData) && rpcData.length === 0, 'RPC returns empty for nonexistent fingerprint');

  // ============================================================
  console.log('\n=== TEST 2: Normalisation & Fingerprint Consistency ===\n');

  // Normalisation
  assert(normalise('ABC Foods Pvt Ltd') === normalise('ABC FOODS PVT LTD'), 'Case normalisation');
  assert(normalise('500 g') === normalise('500g'), 'Whitespace around units normalised');
  assert(normalise('100 ml') === normalise('100ml'), 'ML spacing normalised');
  assert(normalise('250 gms') === '250g', 'gms → g');
  assert(normalise('1.5 ltrs') === '1.5l', 'ltrs → l');
  assert(normalise('250 gms') === normalise('250g'), 'gms normalises consistently');
  assert(normalise('1.5 ltrs') === normalise('1.5l'), 'ltrs normalises consistently');
  assert(normalise('') === '', 'Empty string → empty');
  assert(normalise(null) === '', 'Null → empty');
  assert(computeProductFingerprint(null) === null, 'Null fields → null fingerprint');
  assert(computeProductFingerprint({}) === null, 'Empty fields → null fingerprint');
  assert(
    computeProductFingerprint({ manufacturer_name: { value: 'Test Co' } }) !== null,
    'Only manufacturer_name → valid fingerprint'
  );

  // Consistency
  const testFields = {
    manufacturer_name: { value: 'ABC Foods Pvt Ltd' },
    manufacturer_address: { value: '123 Industrial Area, Mumbai 400001' },
    net_quantity: { value: '500 g' },
  };
  const fp1 = computeProductFingerprint(testFields);
  const fp2 = computeProductFingerprint(JSON.parse(JSON.stringify(testFields)));
  assert(fp1 === fp2, 'Same fields → same fingerprint');
  assert(fp1.includes('abc foods pvt ltd'), 'Fingerprint contains normalised manufacturer name');
  assert(fp1.includes('123 industrial area mumbai 400001'), 'Fingerprint contains normalised address');
  assert(fp1.includes('500g'), 'Fingerprint contains normalised quantity');
  console.log(`  Example fingerprint: ${fp1}`);

  // Different fields → different fingerprint
  const differentFields = {
    manufacturer_name: { value: 'XYZ Beverages Inc' },
    manufacturer_address: { value: '456 Commerce St, Delhi 110001' },
    net_quantity: { value: '1 L' },
  };
  assert(fp1 !== computeProductFingerprint(differentFields), 'Different products → different fingerprints');

  // ============================================================
  console.log('\n=== TEST 3: Create Reports with Realistic Fingerprints ===\n');

  // Create two test scans with realistic extracted fields (simulating same product)
  const testUserId1 = '00000000-0000-0000-0000-000000000001';
  const testUserId2 = '00000000-0000-0000-0000-000000000002';

  const realisticFields = {
    manufacturer_name: { value: 'Parle Products Pvt Ltd', confidence: 0.92, status: 'DETECTED', evidence: ['Manufactured by Parle Products Pvt Ltd'] },
    manufacturer_address: { value: 'Parle Biscuits Pvt Ltd, Vile Parle East, Mumbai 400057', confidence: 0.85, status: 'DETECTED', evidence: ['Vile Parle East, Mumbai 400057'] },
    net_quantity: { value: '100 g', confidence: 0.90, status: 'DETECTED', evidence: ['Net Quantity: 100 g'] },
    mrp: { value: '₹10.00', confidence: 0.88, status: 'DETECTED', evidence: ['MRP Rs. 10.00'] },
    date_of_manufacture: { value: null, confidence: 0, status: 'NOT_DETECTED', evidence: [] },
    consumer_care_phone: { value: '022-26876500', confidence: 0.75, status: 'DETECTED', evidence: ['022-26876500'] },
  };

  const testFingerprint = computeProductFingerprint(realisticFields);
  console.log(`  Test fingerprint: ${testFingerprint}`);

  // Get an existing scan to use as the scan_id (we need a valid FK)
  const { data: existingScan } = await supabase
    .from('product_scans')
    .select('id, user_id')
    .limit(1)
    .single();

  if (!existingScan) {
    console.log('  ⚠️  No existing scans found, cannot test report creation');
    return;
  }

  // Clean up any previous test reports
  await supabase.from('compliance_reports').delete().like('concern_summary', 'E2E Test:%');

  // User A creates a report
  const reportA = {
    user_id: existingScan.user_id,
    scan_id: existingScan.id,
    product_name_snapshot: 'Parle-G Biscuits 100g',
    screening_score_snapshot: 55.0,
    overall_status_snapshot: 'POTENTIAL_NON_COMPLIANCE',
    concern_summary: 'E2E Test: MRP value not clearly visible; date of manufacture not detected',
    user_description: 'Test report by User A for e2e verification',
    report_destination: 'FSSAI Food Safety Connect',
    destination_type: 'official_portal',
    status: 'DRAFT',
    product_fingerprint: testFingerprint,
  };

  const { data: createdA, error: errA } = await supabase
    .from('compliance_reports')
    .insert(reportA)
    .select()
    .single();

  assert(!errA, 'User A report created');
  assert(createdA?.product_fingerprint === testFingerprint, 'User A fingerprint stored correctly');
  console.log(`  User A report: ${createdA?.id?.slice(0, 8)}`);

  // ============================================================
  console.log('\n=== TEST 4: Same-Product Detection via RPC ===\n');

  const { data: productReports, error: lookupErr } = await supabase.rpc('get_product_reports', {
    p_fingerprint: testFingerprint,
  });

  assert(!lookupErr, 'RPC lookup succeeded');
  assert(productReports && productReports.length >= 1, `Found ${productReports?.length || 0} report(s) for same product`);

  if (productReports && productReports.length > 0) {
    const r = productReports[0];
    console.log(`  Product reports found: ${productReports.length}`);
    console.log(`  Latest: "${r.product_name}" — score ${r.screening_score}% — status: ${r.report_status}`);

    // Verify safe fields only
    const keys = Object.keys(r);
    assert(!keys.includes('user_id'), 'user_id NOT exposed');
    assert(!keys.includes('user_description'), 'user_description NOT exposed');
    assert(!keys.includes('scan_id'), 'scan_id NOT exposed (private)');
    assert(keys.includes('report_id'), 'report_id exposed');
    assert(keys.includes('product_name'), 'product_name exposed');
    assert(keys.includes('concern_summary'), 'concern_summary exposed');
    assert(keys.includes('screening_score'), 'screening_score exposed');
    assert(keys.includes('overall_status'), 'overall_status exposed');
    assert(keys.includes('created_at'), 'created_at exposed');
    assert(keys.includes('report_status'), 'report_status exposed');
  }

  // Non-existent fingerprint
  const { data: emptyResult } = await supabase.rpc('get_product_reports', {
    p_fingerprint: 'nonexistent_product_xyz',
  });
  assert(emptyResult && emptyResult.length === 0, 'Nonexistent fingerprint → empty result');

  // ============================================================
  console.log('\n=== TEST 5: Reports Section Data (User A) ===\n');

  const { data: userAReports } = await supabase
    .from('compliance_reports')
    .select('*')
    .eq('user_id', existingScan.user_id)
    .order('created_at', { ascending: false });

  assert(userAReports && userAReports.length >= 1, `User A sees ${userAReports?.length || 0} report(s)`);

  if (userAReports && userAReports.length > 0) {
    const latest = userAReports[0];
    assert(latest.product_name_snapshot, 'product_name_snapshot populated');
    assert(latest.screening_score_snapshot != null, 'screening_score_snapshot populated');
    assert(latest.concern_summary, 'concern_summary populated');
    assert(latest.user_description, 'user_description populated');
    assert(latest.status, 'status populated');
    assert(latest.created_at, 'created_at populated');
    assert(latest.product_fingerprint, 'product_fingerprint populated');
    console.log(`  Latest: "${latest.product_name_snapshot}" (${latest.status}) — ${new Date(latest.created_at).toLocaleString('en-IN')}`);
    console.log(`  Concern: ${latest.concern_summary?.slice(0, 80)}`);
  }

  // ============================================================
  console.log('\n=== TEST 6: RLS / Security ===\n');

  const anonSupabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

  const { data: anonReports, error: anonErr } = await anonSupabase
    .from('compliance_reports')
    .select('*')
    .limit(5);
  assert(!anonReports || anonReports.length === 0, 'Anonymous sees 0 reports (RLS enforced)');

  const { data: anonRpc, error: anonRpcErr } = await anonSupabase.rpc('get_product_reports', { p_fingerprint: testFingerprint });
  // SECURITY DEFINER runs as owner; check that anon either gets empty or error
  assert(!anonRpc || anonRpc.length === 0 || anonRpcErr, 'Anonymous RPC: either blocked, empty, or errors safely');
  if (anonRpc && anonRpc.length > 0) {
    console.log('  ℹ️  Note: SECURITY DEFINER runs as owner — anon may see data via RPC');
    console.log('     This is expected for SECURITY DEFINER functions; RLS on the table still protects direct queries');
  }

  // ============================================================
  console.log('\n=== CLEANUP ===\n');

  // Remove test reports
  const { error: delErr } = await supabase
    .from('compliance_reports')
    .delete()
    .like('concern_summary', 'E2E Test:%');
  assert(!delErr, 'Test reports cleaned up');

  // ============================================================
  console.log('\n=== SUMMARY ===\n');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  if (failed === 0) {
    console.log('\n  🎉 All tests passed!');
  } else {
    console.log(`\n  ⚠️  ${failed} test(s) failed`);
    process.exit(1);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
