#!/usr/bin/env tsx

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceKey);

async function diagnoseAccounts() {
  console.log('🔍 Diagnosing Accounts and Connections...\n');

  // Get all connections
  console.log('1. Checking connections...');
  const { data: connections } = await supabase
    .from('connections')
    .select('id, name, provider, status')
    .eq('provider', 'tink');

  console.log(`Found ${connections?.length || 0} Tink connections:\n`);
  connections?.forEach(conn => {
    console.log(`   - ${conn.name} (${conn.id})`);
    console.log(`     Status: ${conn.status}\n`);
  });

  if (!connections || connections.length === 0) {
    console.log('❌ No Tink connections found\n');
    return;
  }

  const connectionId = connections[0].id;

  // Check provider_accounts
  console.log('2. Checking provider_accounts linked to Tink connection...');
  const { data: providerAccounts } = await supabase
    .from('provider_accounts')
    .select('id, external_account_id, account_name, account_id, status')
    .eq('connection_id', connectionId);

  console.log(`Found ${providerAccounts?.length || 0} provider_accounts:\n`);
  providerAccounts?.forEach(pa => {
    console.log(`   - ${pa.account_name} (${pa.external_account_id})`);
    console.log(`     Status: ${pa.status}`);
    console.log(`     Linked to account: ${pa.account_id || 'NOT LINKED'}\n`);
  });

  // Check accounts table
  console.log('3. Checking accounts table...');
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, account_id, account_name, connection_id, bank_name');

  console.log(`Found ${accounts?.length || 0} accounts:\n`);
  accounts?.forEach(acc => {
    console.log(`   - ${acc.account_name}`);
    console.log(`     Bank: ${acc.bank_name || 'N/A'}`);
    console.log(`     Connection: ${acc.connection_id || 'MANUAL (no connection)'}\n`);
  });

  // Summary
  console.log('📊 Summary:');
  console.log(`   Total Tink Connections: ${connections.length}`);
  console.log(`   Provider Accounts: ${providerAccounts?.length || 0}`);
  console.log(`   Linked Provider Accounts: ${providerAccounts?.filter(pa => pa.account_id).length || 0}`);
  console.log(`   Total Accounts: ${accounts?.length || 0}`);
  console.log(`   Manual Accounts: ${accounts?.filter(acc => !acc.connection_id).length || 0}`);
  console.log(`   Synced Accounts: ${accounts?.filter(acc => acc.connection_id).length || 0}\n`);

  // Recommendations
  console.log('💡 Recommendations:');
  
  if (providerAccounts && providerAccounts.length === 0) {
    console.log('   ❌ No provider accounts found - you need to sync your Tink connection');
    console.log('   → Go to /connections, click on Tink Connection, and click "Sync Now"\n');
  } else if (providerAccounts && providerAccounts.some(pa => !pa.account_id)) {
    console.log('   ⚠️  Provider accounts exist but are not linked to Stratiri accounts');
    console.log('   → Need to either:');
    console.log('      a) Delete manual accounts and re-sync Tink (they will be auto-created)');
    console.log('      b) Manually link provider accounts to existing accounts\n');
  } else {
    console.log('   ✅ Everything looks good!\n');
  }
}

diagnoseAccounts().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

