#!/usr/bin/env tsx

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(supabaseUrl, serviceKey);

async function checkDuplicateTransaction() {
  console.log('Checking for duplicate transaction ID: b9d7c42c-506a-4e56-a8a1-a41330580834');

  const { data, error } = await supabase
    .from('transactions')
    .select('transaction_id, connection_id, tenant_id, account_id, date, amount, description, created_at, updated_at, created_by')
    .eq('transaction_id', 'b9d7c42c-506a-4e56-a8a1-a41330580834');

  if (error) {
    console.error('Error querying transactions:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('Found existing transaction(s):');
    data.forEach((tx, index) => {
      console.log(`${index + 1}. ID: ${tx.transaction_id}`);
      console.log(`   Connection: ${tx.connection_id}`);
      console.log(`   Tenant: ${tx.tenant_id}`);
      console.log(`   Account: ${tx.account_id}`);
      console.log(`   Date: ${tx.date}`);
      console.log(`   Amount: ${tx.amount}`);
      console.log(`   Description: ${tx.description}`);
      console.log(`   Created: ${tx.created_at}`);
      console.log(`   Updated: ${tx.updated_at}`);
      console.log(`   Created by: ${tx.created_by}`);
      console.log('---');
    });
  } else {
    console.log('No existing transaction found with that ID.');
  }

  // Check what connection is currently trying to sync
  const currentConnectionId = '79211470-33be-40b1-9669-17ce54f5d882';
  console.log(`\nChecking if connection ${currentConnectionId} has any transactions...`);

  const { data: connTxs, error: connError } = await supabase
    .from('transactions')
    .select('transaction_id, account_id, date')
    .eq('connection_id', currentConnectionId)
    .limit(5);

  if (connError) {
    console.error('Error checking connection transactions:', connError);
  } else {
    console.log(`Connection ${currentConnectionId} has ${connTxs?.length || 0} transactions`);
    if (connTxs && connTxs.length > 0) {
      console.log('Sample transactions:');
      connTxs.forEach(tx => {
        console.log(`- ${tx.transaction_id} (${tx.date})`);
      });
    }
  }

  // Fix the orphaned transaction
  console.log('\nAttempting to fix orphaned transaction...');
  const { data: updateResult, error: updateError } = await supabase
    .from('transactions')
    .update({
      connection_id: '79211470-33be-40b1-9669-17ce54f5d882',
      updated_at: new Date().toISOString()
    })
    .eq('transaction_id', 'b9d7c42c-506a-4e56-a8a1-a41330580834')
    .is('connection_id', null);

  if (updateError) {
    console.error('Error updating orphaned transaction:', updateError);
  } else {
    console.log('Update result:', updateResult);
  }

  // Verify the fix
  const { data: verifyData, error: verifyError } = await supabase
    .from('transactions')
    .select('transaction_id, connection_id')
    .eq('transaction_id', 'b9d7c42c-506a-4e56-a8a1-a41330580834');

  if (!verifyError && verifyData) {
    console.log('After fix:', verifyData[0]);
  }
}

checkDuplicateTransaction().catch(console.error);
