#!/usr/bin/env tsx

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function setupTestUserOrg() {
  try {
    console.log('🔧 Setting up test user organization...');
    console.log('');
    
    // 1. Get the test user
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
      console.log('Please run: npx tsx scripts/create-test-user.ts');
      return;
    }
    
    console.log(`✓ Found test user: ${testUser.email}`);
    console.log(`  User ID: ${testUser.id}`);
    console.log('');
    
    // 2. Check if user already has organizations
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
    
    const existingTenants = await tenantsResponse.json();
    
    if (existingTenants && existingTenants.length > 0) {
      console.log('✓ User already has organizations:');
      existingTenants.forEach((ut: any) => {
        console.log(`  - ${ut.tenants?.name} (${ut.role})`);
      });
      console.log('');
      console.log('✅ Test user is ready to use!');
      return;
    }
    
    console.log('Creating organization for test user...');
    
    // 3. Create a tenant/organization
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
          slug: 'test-org',
          plan: 'professional',
          settings: {
            currency: 'USD',
            timezone: 'America/New_York',
            date_format: 'MM/DD/YYYY'
          }
        })
      }
    );
    
    if (!createTenantResponse.ok) {
      const error = await createTenantResponse.text();
      console.error('❌ Failed to create tenant:', error);
      return;
    }
    
    const newTenant = await createTenantResponse.json();
    const tenant = Array.isArray(newTenant) ? newTenant[0] : newTenant;
    
    console.log(`✓ Created organization: ${tenant.name}`);
    console.log(`  Tenant ID: ${tenant.id}`);
    console.log('');
    
    // 4. Link user to tenant
    const linkResponse = await fetch(
      `${supabaseUrl}/rest/v1/user_tenants`,
      {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          user_id: testUser.id,
          tenant_id: tenant.id,
          role: 'owner'
        })
      }
    );
    
    if (!linkResponse.ok) {
      const error = await linkResponse.text();
      console.error('❌ Failed to link user to tenant:', error);
      return;
    }
    
    console.log('✓ Linked user to organization as owner');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ TEST USER SETUP COMPLETE!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Login Credentials:');
    console.log('  Email:    test@treasuryx.com');
    console.log('  Password: test123456');
    console.log('');
    console.log('Organization:');
    console.log(`  Name: ${tenant.name}`);
    console.log(`  Role: owner`);
    console.log('');
    console.log('🌐 Login at: http://localhost:3000/login');
    console.log('   Or: https://treasuryx-pi.vercel.app/login');
    console.log('');
    console.log('After login, you should see "Test Organization" selected');
    console.log('in the sidebar and be able to access /connections');
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

setupTestUserOrg();

