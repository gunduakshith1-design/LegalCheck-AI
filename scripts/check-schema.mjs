import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load .env
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

async function main() {
  // Check compliance_reports table exists and its columns
  console.log('=== Checking compliance_reports table ===');
  const { data: reports, error: reportsErr } = await supabase
    .from('compliance_reports')
    .select('*')
    .limit(1);
  
  if (reportsErr) {
    console.log('Error:', reportsErr.message);
  } else {
    console.log('Table exists. Columns:', reports.length > 0 ? Object.keys(reports[0]) : '(empty table)');
  }

  // Check product_scans table
  console.log('\n=== Checking product_scans table ===');
  const { data: scans, error: scansErr } = await supabase
    .from('product_scans')
    .select('id, product_name, extracted_fields')
    .limit(3);
  
  if (scansErr) {
    console.log('Error:', scansErr.message);
  } else {
    console.log('Scans found:', scans.length);
    if (scans.length > 0) {
      console.log('Sample extracted_fields:', JSON.stringify(scans[0].extracted_fields, null, 2));
    }
  }

  // Check existing reports
  console.log('\n=== Checking existing reports ===');
  const { data: existingReports, error: existErr } = await supabase
    .from('compliance_reports')
    .select('*');
  
  if (existErr) {
    console.log('Error:', existErr.message);
  } else {
    console.log('Existing reports:', existingReports.length);
  }
}

main().catch(e => console.error('Fatal:', e));
