/**
 * Diagnostic script to check Plaid account linkage
 * Run: npx tsx scripts/utilities/diagnose-plaid-statements.ts
 */

import { supabase } from '@/lib/supabase';

async function diagnoseStatements() {
  console.log('🔍 Diagnosing Plaid statement creation...\n');

  // Get all Plaid connections
  const { data: connections } = await supabase
    .from('connections')
    .select('id, tenant_id, provider, status')
    .eq('provider', 'plaid');

  if (!connections || connections.length === 0) {
    console.log('❌ No Plaid connections found');
    return;
  }

  for (const conn of connections) {
    console.log(`📋 Connection: ${conn.id} (${conn.status})`);
    
    // Get Plaid accounts for this connection
    const { data: plaidAccounts } = await supabase
      .from('plaid_accounts')
      .select('*')
      .eq('connection_id', conn.id);

    console.log(`   Found ${plaidAccounts?.length || 0} Plaid accounts`);

    if (plaidAccounts) {
      for (const plaidAcc of plaidAccounts) {
        console.log(`\n   🏦 Plaid Account: ${plaidAcc.name}`);
        console.log(`      Plaid account_id: ${plaidAcc.account_id}`);
        console.log(`      Balance: ${plaidAcc.current} ${plaidAcc.iso_currency_code}`);

        // Try to find matching normalized account
        const { data: normalizedAccount } = await supabase
          .from('accounts')
          .select('id, account_name, external_account_id, connection_id')
          .eq('tenant_id', conn.tenant_id)
          .eq('connection_id', conn.id)
          .eq('external_account_id', plaidAcc.account_id)
          .maybeSingle();

        if (normalizedAccount) {
          console.log(`      ✅ Found normalized account: ${normalizedAccount.account_name}`);
          console.log(`         Account ID: ${normalizedAccount.id}`);
          console.log(`         External ID: ${normalizedAccount.external_account_id}`);

          // Check for statements
          const { data: statements, count } = await supabase
            .from('account_statements')
            .select('*', { count: 'exact' })
            .eq('account_id', normalizedAccount.id);

          console.log(`         📊 Statements: ${count || 0}`);
          if (statements && statements.length > 0) {
            statements.forEach(stmt => {
              console.log(`            - ${stmt.statement_date}: ${stmt.ending_balance} ${stmt.currency} (${stmt.source})`);
            });
          }
        } else {
          console.log(`      ❌ NO normalized account found!`);
          console.log(`         Searching for:`);
          console.log(`         - tenant_id: ${conn.tenant_id}`);
          console.log(`         - connection_id: ${conn.id}`);
          console.log(`         - external_account_id: ${plaidAcc.account_id}`);

          // Try to find ANY account with this connection
          const { data: anyAccount } = await supabase
            .from('accounts')
            .select('id, account_name, external_account_id, connection_id')
            .eq('tenant_id', conn.tenant_id)
            .eq('connection_id', conn.id)
            .limit(5);

          if (anyAccount && anyAccount.length > 0) {
            console.log(`\n         🔍 Found ${anyAccount.length} account(s) for this connection:`);
            anyAccount.forEach(acc => {
              console.log(`            - ${acc.account_name}`);
              console.log(`              external_account_id: ${acc.external_account_id || 'NOT SET'}`);
            });
          }
        }
      }
    }
  }
}

diagnoseStatements()
  .then(() => {
    console.log('\n✅ Diagnosis complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

