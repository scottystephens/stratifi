/**
 * Check Xero Account Types
 * 
 * Analyzes the raw Xero accounts stored in the database to see
 * what account types are present and why none are being normalized.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkXeroAccountTypes() {
  console.log('🔍 Checking Xero account types in raw storage...\n');

  // Get all Xero accounts from raw storage
  const { data: rawAccounts, error } = await supabase
    .from('xero_accounts')
    .select('*')
    .limit(100);

  if (error) {
    console.error('❌ Error fetching accounts:', error.message);
    return;
  }

  if (!rawAccounts || rawAccounts.length === 0) {
    console.log('⚠️ No Xero accounts found in raw storage');
    return;
  }

  console.log(`📊 Found ${rawAccounts.length} raw Xero accounts\n`);

  // Analyze account types
  const typeCount: Record<string, number> = {};
  const classCount: Record<string, number> = {};
  const statusCount: Record<string, number> = {};
  const bankAccounts: any[] = [];

  for (const raw of rawAccounts) {
    const account = raw.raw_account_data as any;
    
    // Count types
    const type = account.Type || 'UNKNOWN';
    typeCount[type] = (typeCount[type] || 0) + 1;
    
    // Count classes
    const accountClass = account.Class || 'UNKNOWN';
    classCount[accountClass] = (classCount[accountClass] || 0) + 1;
    
    // Count statuses
    const status = account.Status || 'UNKNOWN';
    statusCount[status] = (statusCount[status] || 0) + 1;
    
    // Collect bank accounts
    if (account.Type === 'BANK') {
      bankAccounts.push({
        name: account.Name,
        code: account.Code,
        status: account.Status,
        bankAccountType: account.BankAccountType,
        currencyCode: account.CurrencyCode,
      });
    }
  }

  console.log('📈 Account Types Distribution:');
  console.log('─'.repeat(40));
  for (const [type, count] of Object.entries(typeCount).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.min(count, 30));
    console.log(`  ${type.padEnd(15)} ${String(count).padStart(3)} ${bar}`);
  }

  console.log('\n📊 Account Classes Distribution:');
  console.log('─'.repeat(40));
  for (const [cls, count] of Object.entries(classCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cls.padEnd(15)} ${count}`);
  }

  console.log('\n🔒 Account Status Distribution:');
  console.log('─'.repeat(40));
  for (const [status, count] of Object.entries(statusCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status.padEnd(15)} ${count}`);
  }

  console.log('\n' + '═'.repeat(50));
  
  if (bankAccounts.length > 0) {
    console.log(`\n✅ Found ${bankAccounts.length} BANK type accounts:`);
    for (const bank of bankAccounts) {
      console.log(`  - ${bank.name} (${bank.code}) - ${bank.status}`);
      console.log(`    Type: ${bank.bankAccountType || 'N/A'}, Currency: ${bank.currencyCode || 'N/A'}`);
    }
  } else {
    console.log('\n❌ NO BANK TYPE ACCOUNTS FOUND!');
    console.log('\n💡 To fix this:');
    console.log('   1. Log into Xero → Accounting → Bank Accounts');
    console.log('   2. Add a bank account (can be manual for testing)');
    console.log('   3. Re-sync the Xero connection');
    console.log('\n   The Demo Company should have bank accounts.');
    console.log('   If using a custom org, you need to add bank accounts first.');
  }

  // Show a few example accounts for debugging
  console.log('\n📋 Sample accounts (first 5):');
  console.log('─'.repeat(60));
  for (const raw of rawAccounts.slice(0, 5)) {
    const account = raw.raw_account_data as any;
    console.log(`  ${account.Name}`);
    console.log(`    Type: ${account.Type}, Class: ${account.Class}, Status: ${account.Status}`);
  }
}

checkXeroAccountTypes().catch(console.error);

