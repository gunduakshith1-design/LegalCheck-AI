/**
 * Apply migration 011: product_fingerprint + secure RPC function.
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

const sql = readFileSync('docs/migrations/011_product_fingerprint_and_report_lookup.sql', 'utf-8');

async function main() {
  // Check if column already exists by trying to select it
  const { data, error: colErr } = await supabase
    .from('compliance_reports')
    .select('product_fingerprint')
    .limit(1);

  if (!colErr) {
    console.log('✅ product_fingerprint column already exists');
  } else {
    console.log('Column not found, need to apply migration');
    console.log('Error:', colErr.message);
    console.log('\n⚠️  Please run the migration SQL in Supabase SQL Editor:');
    console.log('https://supabase.com/dashboard/project/iigqznasxqjwdfoucwbf/sql/new');
    console.log('\nSQL file: docs/migrations/011_product_fingerprint_and_report_lookup.sql');
    return;
  }

  // Check if RPC function exists
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_product_reports', {
    p_fingerprint: 'test'
  });

  if (!rpcErr) {
    console.log('✅ get_product_reports RPC function exists');
  } else {
    console.log('RPC function not found:', rpcErr.message);
    console.log('Please apply the migration SQL');
  }
}

main().catch(e => console.error('Fatal:', e));
