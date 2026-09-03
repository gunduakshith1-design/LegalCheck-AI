/**
 * Run the compliance_reports migration against Supabase.
 * Uses the service role key for admin access.
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load .env manually
const envText = readFileSync('.env', 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  const val = trimmed.slice(idx + 1).trim();
  env[key] = val;
}

const supabaseUrl = env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const migrationSQL = readFileSync('docs/migrations/009_compliance_reports.sql', 'utf-8');

async function main() {
  // Step 1: Check if table already exists
  console.log('Checking if compliance_reports table exists...');
  const { data: existing, error: checkErr } = await supabase
    .from('compliance_reports')
    .select('id')
    .limit(1);

  if (!checkErr) {
    console.log('✅ Table already exists! Migration not needed.');
    return;
  }

  console.log('Table not found. Error:', checkErr.message);

  // Step 2: Try using exec_sql RPC if available
  console.log('\nTrying exec_sql RPC...');
  const { data: rpcData, error: rpcErr } = await supabase.rpc('exec_sql', {
    query: migrationSQL,
  });

  if (!rpcErr) {
    console.log('✅ Migration executed via exec_sql RPC:', rpcData);
    return;
  }

  console.log('exec_sql not available:', rpcErr.message);

  // Step 3: Try creating via individual table operations
  console.log('\nTrying direct DDL via Supabase SQL API...');

  // The Supabase SQL API endpoint
  const sqlUrl = `${supabaseUrl}/sql`;
  try {
    const resp = await fetch(sqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: migrationSQL }),
    });
    const body = await resp.text();
    console.log('SQL API response:', resp.status, body.slice(0, 500));

    if (resp.ok) {
      console.log('✅ Migration executed via SQL API');
      return;
    }
  } catch (e) {
    console.log('SQL API failed:', e.message);
  }

  // Step 4: Fallback - print instructions
  console.log('\n⚠️  Could not run migration automatically.');
  console.log('Please run the following SQL in the Supabase SQL Editor:');
  console.log('---');
  console.log(migrationSQL);
  console.log('---');
  console.log('\nGo to: https://supabase.com/dashboard/project/iigqznasxqjwdfoucwbf/sql');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
