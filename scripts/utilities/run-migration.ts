#!/usr/bin/env tsx

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceKey);

async function runMigration(sqlFile: string) {
  const sql = readFileSync(sqlFile, 'utf-8');
  
  console.log(`📊 Running migration: ${sqlFile}`);
  console.log(`🔗 Database: ${supabaseUrl}`);
  console.log('');
  
  // Split into individual statements and run them
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  console.log(`📝 Found ${statements.length} SQL statements`);
  console.log('');
  
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] + ';';
    
    // Skip comments
    if (statement.startsWith('COMMENT')) {
      console.log(`⏭️  Skipping comment statement ${i + 1}/${statements.length}`);
      continue;
    }
    
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement });
      
      if (error) {
        // Check if it's a "already exists" error (which is ok)
        if (error.message.includes('already exists')) {
          console.log(`✓ Statement ${i + 1}/${statements.length} - already exists (ok)`);
          success++;
        } else {
          console.error(`✗ Statement ${i + 1}/${statements.length} failed:`, error.message);
          failed++;
        }
      } else {
        console.log(`✓ Statement ${i + 1}/${statements.length} completed`);
        success++;
      }
    } catch (err) {
      console.error(`✗ Statement ${i + 1}/${statements.length} error:`, err);
      failed++;
    }
  }
  
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(`✅ Success: ${success}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
  }
  console.log('═══════════════════════════════════════');
  
  if (failed > statements.length / 2) {
    console.log('');
    console.log('⚠️  Many statements failed. You may need to run this in Supabase SQL Editor:');
    console.log('https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new');
    console.log('');
    console.log('Copy and paste the contents of:');
    console.log(sqlFile);
  }
}

const migrationFile = process.argv[2] || 'scripts/04-setup-data-ingestion.sql';
runMigration(migrationFile).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
