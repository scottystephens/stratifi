#!/usr/bin/env tsx

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function verifyTestUser() {
  try {
    console.log('🔍 Verifying test user setup...');
    console.log('');
    
    // 1. Get test user
    const usersResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      }
    });
    
    const usersData = await usersResponse.json();
    const testUser = usersData.users?.find((u: any) => u.email === 'test@treasuryx.com');
    
    if (!testUser) {
      console.error('❌ Test user not found!');
      return;
    }
    
    console.log('✅ Test User Found:');
    console.log(`   Email: ${testUser.email}`);
    console.log(`   ID: ${testUser.id}`);
    console.log(`   Confirmed: ${testUser.email_confirmed_at ? 'Yes' : 'No'}`);
    console.log('');
    
    // 2. Get user's tenants
    const tenantsResponse = await fetch(
      `${supabaseUrl}/rest/v1/user_tenants?user_id=eq.${testUser.id}&select=*,tenants(*)`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const userTenants = await tenantsResponse.json();
    
    console.log('📊 User Organizations:');
    if (userTenants && userTenants.length > 0) {
      userTenants.forEach((ut: any, idx: number) => {
        console.log(`   ${idx + 1}. ${ut.tenants?.name || 'Unknown'}`);
        console.log(`      Tenant ID: ${ut.tenant_id}`);
        console.log(`      Role: ${ut.role}`);
        console.log('');
      });
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ USER IS PROPERLY SET UP');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('');
      console.log('When you log in, you should see:');
      console.log(`  Organization: ${userTenants[0].tenants?.name}`);
      console.log(`  Tenant ID: ${userTenants[0].tenant_id}`);
      console.log('');
      console.log('Make sure this tenant ID matches what you see in the browser!');
      
    } else {
      console.log('   ❌ NONE - User has no organizations!');
      console.log('');
      console.log('This is the problem! Running setup now...');
      console.log('');
      
      // Create organization
      const createTenantResponse = await fetch(
        `${supabaseUrl}/rest/v1/tenants`,
        {
          method: 'POST',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            name: 'Test Organization',
            slug: 'test-org-' + Date.now(),
            plan: 'professional',
            settings: {
              currency: 'USD',
              timezone: 'America/New_York',
              date_format: 'MM/DD/YYYY'
            }
          })
        }
      );
      
      const newTenant = await createTenantResponse.json();
      const tenant = Array.isArray(newTenant) ? newTenant[0] : newTenant;
      
      console.log(`✓ Created: ${tenant.name}`);
      
      // Link user to tenant
      await fetch(
        `${supabaseUrl}/rest/v1/user_tenants`,
        {
          method: 'POST',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            user_id: testUser.id,
            tenant_id: tenant.id,
            role: 'owner'
          })
        }
      );
      
      console.log('✓ Linked user to organization');
      console.log('');
      console.log('✅ Setup complete! Try logging in again.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

verifyTestUser();

