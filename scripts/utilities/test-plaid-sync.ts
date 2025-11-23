/**
 * Test Plaid sync to verify transaction storage fix
 */

// Load environment variables first
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { orchestrateSync } from '../../lib/services/sync-orchestrator';
import { plaidProvider } from '../../lib/banking-providers/plaid-provider';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'NOT SET');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'NOT SET');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testPlaidSync() {
  console.log('🔍 Testing Plaid Transaction Sync Fix\n');

  try {
    // Get Plaid connection
    const { data: connection, error: dbError } = await supabase
      .from('connections')
      .select('id, tenant_id, name, status')
      .eq('provider', 'plaid')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (dbError || !connection) {
      console.error('❌ No active Plaid connection found');
      console.error('Error:', dbError?.message);
      process.exit(1);
    }

    console.log('✅ Found active Plaid connection:');
    console.log('  - ID:', connection.id);
    console.log('  - Tenant ID:', connection.tenant_id);
    console.log('  - Name:', connection.name);
    console.log('');

    // Get access token
    const { data: tokenData, error: tokenError } = await supabase
      .from('provider_tokens')
      .select('access_token, provider_id, status')
      .eq('connection_id', connection.id)
      .eq('status', 'active')
      .single();

    if (tokenError || !tokenData) {
      console.error('❌ No active access token found');
      console.error('Error:', tokenError?.message);
      process.exit(1);
    }

    console.log('✅ Found active access token\n');

    // Prepare credentials
    const credentials = {
      connectionId: connection.id,
      tenantId: connection.tenant_id,
      tokens: {
        accessToken: tokenData.access_token,
        tokenType: 'Bearer',
      },
    };

    // Run sync
    console.log('🚀 Starting Plaid sync...\n');

    const result = await orchestrateSync({
      provider: plaidProvider,
      connectionId: connection.id,
      tenantId: connection.tenant_id,
      credentials,
      syncAccounts: true,
      syncTransactions: true,
      userId: 'test-user', // Placeholder
    });

    console.log('\n📊 Sync Results:');
    console.log('  - Success:', result.success);
    console.log('  - Accounts synced:', result.accountsSynced);
    console.log('  - Transactions synced:', result.transactionsSynced);
    console.log('  - Duration:', result.duration + 'ms');
    console.log('  - Errors:', result.errors.length);

    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    }

    // Check what was stored
    console.log('\n🔍 Checking stored data...\n');

    const { data: rawTxs, error: rawTxError } = await supabase
      .from('plaid_transactions')
      .select('transaction_id, account_id, amount, date, raw_transaction_data')
      .eq('connection_id', connection.id)
      .order('date', { ascending: false })
      .limit(5);

    if (rawTxError) {
      console.error('❌ Failed to fetch stored transactions:', rawTxError.message);
    } else {
      console.log(`✅ Found ${rawTxs?.length || 0} transactions in plaid_transactions table`);
      if (rawTxs && rawTxs.length > 0) {
        console.log('Sample transactions:');
        rawTxs.forEach((tx, i) => {
          const rawData = tx.raw_transaction_data as any;
          console.log(`  ${i + 1}. ${tx.transaction_id} - ${tx.amount} ${tx.date} (${rawData._sync_type || 'unknown type'})`);
        });
      }
    }

    // Check normalized transactions
    const { data: normTxs, error: normTxError } = await supabase
      .from('transactions')
      .select('id, external_transaction_id, amount, date, description')
      .eq('connection_id', connection.id)
      .order('date', { ascending: false })
      .limit(5);

    if (normTxError) {
      console.error('❌ Failed to fetch normalized transactions:', normTxError.message);
    } else {
      console.log(`\n✅ Found ${normTxs?.length || 0} transactions in transactions table`);
      if (normTxs && normTxs.length > 0) {
        console.log('Sample normalized transactions:');
        normTxs.forEach((tx, i) => {
          console.log(`  ${i + 1}. ${tx.external_transaction_id} - ${tx.amount} ${tx.date} - ${tx.description}`);
        });
      }
    }

    console.log('\n✅ Test complete!');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testPlaidSync();
