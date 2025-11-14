#!/usr/bin/env tsx

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing environment variables!');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

async function createTestUser() {
  try {
    // First, delete any existing test users
    const usersResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const usersData = await usersResponse.json();
    const testUsers = usersData.users?.filter((u: any) => 
      u.email === 'demo@treasuryx.com' || 
      u.email === 'test@treasuryx.com'
    );
    
    // Delete existing test users
    if (testUsers && testUsers.length > 0) {
      await Promise.all(testUsers.map((u: any) => 
        fetch(`${supabaseUrl}/auth/v1/admin/users/${u.id}`, {
          method: 'DELETE',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
          }
        })
      ));
      console.log(`🗑️  Deleted ${testUsers.length} existing test user(s)`);
    }
    
    // Create fresh test user with email pre-confirmed
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'test@treasuryx.com',
        password: 'test123456',
        email_confirm: true,  // Pre-confirm email
        user_metadata: {
          full_name: 'Test User'
        }
      })
    });
    
    const data = await response.json();
    
    if (data.id) {
      console.log('');
      console.log('🎉 FRESH TEST USER CREATED!');
      console.log('');
      console.log('═══════════════════════════════════════');
      console.log('Email:    test@treasuryx.com');
      console.log('Password: test123456');
      console.log('═══════════════════════════════════════');
      console.log('');
      console.log('✅ Email pre-confirmed (no verification needed)');
      console.log('✅ Ready to test immediately');
      console.log('✅ No organizations yet');
      console.log('');
      console.log('🌐 Local:  http://localhost:3000/login');
      console.log('🌐 Vercel: https://treasuryx-pi.vercel.app/login');
      console.log('');
      console.log('📝 After login → you\'ll go to /onboarding');
      console.log('📝 Create your first organization there!');
      console.log('');
    } else {
      console.error('❌ Error creating user:', data);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createTestUser();

