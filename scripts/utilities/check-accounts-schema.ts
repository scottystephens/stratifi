#!/usr/bin/env tsx

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function checkSchema() {
  try {
    console.log('🔍 Checking accounts table schema...');
    console.log('');
    
    // Query the information schema
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/exec`,
      {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: `
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' 
            AND table_name = 'accounts'
            ORDER BY ordinal_position;
          `
        })
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      console.log('Current accounts table columns:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      // Try direct query instead
      const directResponse = await fetch(
        `${supabaseUrl}/rest/v1/accounts?limit=1`,
        {
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
          }
        }
      );
      
      if (directResponse.ok) {
        const accounts = await directResponse.json();
        if (accounts && accounts.length > 0) {
          console.log('Sample account structure:');
          console.log(JSON.stringify(accounts[0], null, 2));
        } else {
          console.log('No accounts in database yet');
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkSchema();

