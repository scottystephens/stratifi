#!/usr/bin/env tsx

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function runMigration() {
  const sqlFile = resolve(process.cwd(), 'scripts/04-setup-data-ingestion.sql');
  const sql = readFileSync(sqlFile, 'utf-8');
  
  console.log('🔧 Running migration via Supabase REST API...');
  console.log(`📁 File: ${sqlFile}`);
  console.log('');
  
  try {
    // Split SQL into statements and run via REST API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ query: sql })
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('Response body:', text);
    
    if (!response.ok) {
      console.error('❌ Migration failed');
      console.error('Please run the migration manually in Supabase SQL Editor:');
      console.error('https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new');
    } else {
      console.log('✅ Migration completed!');
    }
  } catch (error) {
    console.error('❌ Error:', error);
    console.log('');
    console.log('⚠️  Please run the migration manually in Supabase SQL Editor:');
    console.log('https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new');
    console.log('');
    console.log('Copy and paste the contents of:');
    console.log('scripts/04-setup-data-ingestion.sql');
  }
}

runMigration();

