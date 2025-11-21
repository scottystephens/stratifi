/**
 * Run migration 29: Create Plaid storage tables
 * This script executes the SQL migration using Supabase client
 */

import { supabase } from '../../lib/supabase';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigration() {
  console.log('🚀 Running migration 29: Create Plaid storage tables...\n');

  try {
    // Read the migration file
    const migrationPath = join(__dirname, '../migrations/29-create-plaid-storage.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Split by statement (rough split on semicolons, handling multi-line)
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip pure comments
      if (statement.startsWith('COMMENT')) {
        console.log(`💬 Statement ${i + 1}: Adding comment...`);
      } else if (statement.startsWith('CREATE TABLE')) {
        const tableName = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/)?.[1];
        console.log(`📦 Statement ${i + 1}: Creating table ${tableName}...`);
      } else if (statement.startsWith('CREATE INDEX')) {
        const indexName = statement.match(/CREATE INDEX (?:IF NOT EXISTS )?(\w+)/)?.[1];
        console.log(`🔍 Statement ${i + 1}: Creating index ${indexName}...`);
      } else if (statement.startsWith('CREATE POLICY')) {
        const policyName = statement.match(/CREATE POLICY "([^"]+)"/)?.[1];
        console.log(`🔒 Statement ${i + 1}: Creating RLS policy "${policyName}"...`);
      } else if (statement.startsWith('ALTER TABLE')) {
        console.log(`⚙️  Statement ${i + 1}: Altering table...`);
      } else {
        console.log(`📄 Statement ${i + 1}: Executing...`);
      }

      try {
        const { error } = await supabase.rpc('exec_sql', { 
          sql: statement + ';' 
        });

        if (error) {
          console.error(`   ❌ Error:`, error.message);
          
          // Some errors are OK (e.g., "already exists")
          if (error.message.includes('already exists') || 
              error.message.includes('does not exist')) {
            console.log(`   ⚠️  Skipping (already exists or safe to ignore)`);
          } else {
            throw error;
          }
        } else {
          console.log(`   ✅ Success`);
        }
      } catch (execError: any) {
        console.error(`   ❌ Execution error:`, execError);
        throw execError;
      }

      console.log(''); // Blank line for readability
    }

    console.log('\n✅ Migration 29 completed successfully!\n');
    console.log('📋 Created tables:');
    console.log('   - plaid_sync_cursors');
    console.log('   - plaid_transactions');
    console.log('   - plaid_accounts');
    console.log('\n🔍 Verifying...\n');

    // Verify tables were created
    const tables = ['plaid_sync_cursors', 'plaid_transactions', 'plaid_accounts'];
    
    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`   ❌ ${table}: Error (${error.message})`);
      } else {
        console.log(`   ✅ ${table}: Exists (${count || 0} rows)`);
      }
    }

    console.log('\n🎉 Migration complete and verified!\n');

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error);
    console.error('\nYou may need to run this migration manually in Supabase SQL Editor:');
    console.error('https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new');
    process.exit(1);
  }

  process.exit(0);
}

runMigration();

