#!/usr/bin/env tsx

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const testTenantId = '9f5b2d41-c4e7-41d2-ad2e-9576a1a6ae6e';
const testUserId = 'fc5df56b-8551-478c-8efb-3c9e62e49443';

// First check if we need to create an entity
async function ensureEntity() {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/entities?tenant_id=eq.${testTenantId}&limit=1`,
    {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      }
    }
  );
  
  const entities = await response.json();
  
  if (entities && entities.length > 0) {
    return entities[0].entity_id || entities[0].id;
  }
  
  // Create a default entity
  console.log('Creating default entity...');
  const createResponse = await fetch(
    `${supabaseUrl}/rest/v1/entities`,
    {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        entity_id: `ENT-${Date.now()}`,
        entity_name: 'Test Corporation',
        tenant_id: testTenantId,
        type: 'Corporation',
        jurisdiction: 'Delaware',
        status: 'Active',
      })
    }
  );
  
  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('Failed to create entity:', error);
    throw new Error('Could not create entity');
  }
  
  const newEntity = await createResponse.json();
  const entity = Array.isArray(newEntity) ? newEntity[0] : newEntity;
  console.log('Created entity:', entity.entity_id);
  return entity.entity_id;
}

const testAccounts = [
  {
    account_id: 'ACC-CHK-001',
    account_name: 'Main Operating Account',
    account_number: 'CHK-1001234567',
    account_type: 'checking',
    bank_name: 'Chase Bank',
    currency: 'USD',
    balance: 125000.00,
    current_balance: 125000.00,
    status: 'Active',
  },
  {
    account_id: 'ACC-SAV-001',
    account_name: 'Savings Reserve Account',
    account_number: 'SAV-3001234567',
    account_type: 'savings',
    bank_name: 'Chase Bank',
    currency: 'USD',
    balance: 500000.00,
    current_balance: 500000.00,
    status: 'Active',
  },
  {
    account_id: 'ACC-EUR-001',
    account_name: 'EUR Operations Account',
    account_number: 'CHK-4001234567',
    account_type: 'checking',
    bank_name: 'Deutsche Bank',
    currency: 'EUR',
    balance: 75000.00,
    current_balance: 75000.00,
    status: 'Active',
  },
  {
    account_id: 'ACC-CC-001',
    account_name: 'Business Credit Card',
    account_number: 'CC-5001234567',
    account_type: 'credit_card',
    bank_name: 'American Express',
    currency: 'USD',
    balance: -8500.00,
    current_balance: -8500.00,
    status: 'Active',
  },
];

async function createTestAccounts() {
  try {
    console.log('🏦 Creating test accounts for Test Organization...');
    console.log('');
    
    // Ensure we have an entity
    const entityId = await ensureEntity();
    console.log(`✓ Using entity: ${entityId}`);
    console.log('');
    
    // Delete existing test accounts
    await fetch(
      `${supabaseUrl}/rest/v1/accounts?tenant_id=eq.${testTenantId}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        }
      }
    );
    
    // Create accounts
    for (const account of testAccounts) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/accounts`,
        {
          method: 'POST',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            ...account,
            entity_id: entityId,
            tenant_id: testTenantId,
          })
        }
      );
      
      if (!response.ok) {
        const error = await response.text();
        console.error(`❌ Failed to create ${account.account_name}:`, error);
        continue;
      }
      
      console.log(`✓ Created: ${account.account_name}`);
      console.log(`   Type: ${account.currency}`);
      console.log(`   Balance: ${account.currency} ${account.balance.toLocaleString()}`);
      console.log('');
    }
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ TEST ACCOUNTS CREATED!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log(`Total accounts: ${testAccounts.length}`);
    console.log('');
    console.log('Accounts:');
    console.log('  1. Main Operating Account (USD) - $125,000');
    console.log('  2. Savings Reserve Account (USD) - $500,000');
    console.log('  3. EUR Operations Account (EUR) - €75,000');
    console.log('  4. Business Credit Card (USD) - -$8,500');
    console.log('');
    console.log('You can now:');
    console.log('  • View at: https://treasuryx-pi.vercel.app/accounts');
    console.log('  • Link CSV imports to these accounts');
    console.log('  • Import bank statements');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createTestAccounts();

