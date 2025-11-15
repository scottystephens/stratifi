/**
 * Run Migration 11: Enhance Accounts and Connections
 * This script applies the database migration programmatically
 */

import { supabase } from '../../lib/supabase';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  console.log('🚀 Starting Migration 11: Enhance Accounts and Connections...\n');

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../migrations/11-enhance-accounts-and-connections.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Split into individual statements (rough split by semicolons outside of DO blocks)
    // For complex migrations, we'll need to execute the whole thing
    
    console.log('📄 Migration file loaded, executing SQL...\n');

    // Since this is a complex migration with DO blocks, we need to execute it differently
    // We'll use the RPC approach to execute raw SQL
    
    // First, let's try to execute key parts individually
    
    // Part 1: Check and fix provider_accounts foreign key
    console.log('1️⃣ Fixing provider_accounts foreign key...');
    
    try {
      await supabase.rpc('exec_sql', { 
        sql: `
          DO $$ 
          BEGIN
            IF EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conname = 'provider_accounts_account_id_fkey'
            ) THEN
              ALTER TABLE provider_accounts DROP CONSTRAINT provider_accounts_account_id_fkey;
              RAISE NOTICE 'Dropped existing provider_accounts_account_id_fkey constraint';
            END IF;
          END $$;
        `
      });
      console.log('   ✅ Foreign key constraint checked\n');
    } catch (error: any) {
      console.log('   ⚠️  exec_sql function not available, will use alternative approach\n');
    }

    // Part 2: Add connection metadata fields
    console.log('2️⃣ Adding connection metadata fields...');
    
    const connectionFields = [
      { name: 'total_accounts', type: 'INTEGER', default: '0' },
      { name: 'active_accounts', type: 'INTEGER', default: '0' },
      { name: 'total_transactions', type: 'INTEGER', default: '0' },
      { name: 'last_transaction_date', type: 'TIMESTAMPTZ', default: null },
      { name: 'last_successful_sync_at', type: 'TIMESTAMPTZ', default: null },
      { name: 'consecutive_failures', type: 'INTEGER', default: '0' },
      { name: 'sync_health_score', type: 'DECIMAL(3,2)', default: '1.00' },
      { name: 'sync_summary', type: 'JSONB', default: "'{}'::jsonb" },
    ];

    for (const field of connectionFields) {
      try {
        const { error } = await supabase.from('connections').select(field.name).limit(1);
        if (error && error.message.includes('does not exist')) {
          console.log(`   Adding ${field.name}...`);
          // Field doesn't exist, but we can't ALTER via SDK
          console.log(`   ⚠️  Please add ${field.name} via SQL editor`);
        } else {
          console.log(`   ✅ ${field.name} already exists`);
        }
      } catch (e) {
        console.log(`   ⚠️  Could not check ${field.name}`);
      }
    }

    console.log('\n3️⃣ Adding account metadata fields...');
    
    const accountFields = [
      'provider_id',
      'connection_id', 
      'iban',
      'bic',
      'account_holder_name',
    ];

    for (const field of accountFields) {
      try {
        const { error } = await supabase.from('accounts').select(field).limit(1);
        if (error && error.message.includes('does not exist')) {
          console.log(`   ⚠️  Please add ${field} via SQL editor`);
        } else {
          console.log(`   ✅ ${field} already exists`);
        }
      } catch (e) {
        console.log(`   ⚠️  Could not check ${field}`);
      }
    }

    console.log('\n📋 Migration Status Summary:\n');
    console.log('The migration contains complex SQL (DO blocks, functions, triggers)');
    console.log('that cannot be executed via the Supabase JavaScript client.\n');
    console.log('✅ RECOMMENDED APPROACH:');
    console.log('   1. Open: https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new');
    console.log('   2. Copy contents of: scripts/migrations/11-enhance-accounts-and-connections.sql');
    console.log('   3. Paste and click "Run"\n');
    console.log('⚠️  The migration includes:');
    console.log('   - Schema changes (ALTER TABLE)');
    console.log('   - Database functions (calculate_connection_health, update_connection_stats)');
    console.log('   - Triggers (automatic stats updates)');
    console.log('   - Materialized view (connection_dashboard)');
    console.log('   - Indexes for performance\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });

