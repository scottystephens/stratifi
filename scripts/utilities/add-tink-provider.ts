// Add Tink to banking_providers table
// Run: npx tsx scripts/utilities/add-tink-provider.ts

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function addTinkProvider() {
  console.log('🔧 Adding Tink to banking_providers table...\n');

  const sql = `
    INSERT INTO banking_providers (id, display_name, auth_type, logo_url, color, description, website, supported_countries, enabled)
    VALUES 
      ('tink', 'Tink', 'oauth', '/logos/tink.svg', '#00A8FF', 'Connect your bank accounts through Tink (3,500+ European banks)', 'https://www.tink.com', ARRAY['NL', 'GB', 'DE', 'FR', 'ES', 'IT', 'SE', 'NO', 'DK', 'FI', 'AT', 'BE', 'CH', 'IE', 'PT', 'PL', 'CZ', 'GR', 'RO', 'HU'], true)
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      auth_type = EXCLUDED.auth_type,
      logo_url = EXCLUDED.logo_url,
      color = EXCLUDED.color,
      description = EXCLUDED.description,
      website = EXCLUDED.website,
      supported_countries = EXCLUDED.supported_countries,
      enabled = EXCLUDED.enabled,
      updated_at = NOW();
  `;

  try {
    // Try using exec_sql RPC function first
    const { data, error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
      if (error.message.includes('Could not find the function')) {
        console.log('❌ exec_sql function not found!');
        console.log('\n📝 Please run this migration first in Supabase SQL Editor:');
        console.log('   scripts/migrations/09-create-exec-sql-function.sql');
        console.log('\n🔗 SQL Editor:');
        console.log('   https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new');
        console.log('\n📋 Or run this SQL directly:');
        console.log(sql);
        process.exit(1);
      }
      throw error;
    }

    if (data?.success) {
      console.log('✅ Tink added to banking_providers table successfully!');
      console.log(`   Rows affected: ${data.rows_affected || 0}`);
      console.log(`   Message: ${data.message || 'Success'}`);
    } else {
      console.log('❌ Failed to add Tink:', data?.error || 'Unknown error');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    
    // Fallback: try direct insert
    console.log('\n🔄 Trying direct insert method...');
    try {
      const { data: insertData, error: insertError } = await supabase
        .from('banking_providers')
        .upsert({
          id: 'tink',
          display_name: 'Tink',
          auth_type: 'oauth',
          logo_url: '/logos/tink.svg',
          color: '#00A8FF',
          description: 'Connect your bank accounts through Tink (3,500+ European banks)',
          website: 'https://www.tink.com',
          supported_countries: ['NL', 'GB', 'DE', 'FR', 'ES', 'IT', 'SE', 'NO', 'DK', 'FI', 'AT', 'BE', 'CH', 'IE', 'PT', 'PL', 'CZ', 'GR', 'RO', 'HU'],
          enabled: true,
        }, {
          onConflict: 'id',
        })
        .select();

      if (insertError) {
        throw insertError;
      }

      console.log('✅ Tink added via direct insert!');
      console.log('   Data:', insertData);
    } catch (directError) {
      console.error('❌ Direct insert also failed:', directError);
      console.log('\n📋 Please run this SQL manually in Supabase SQL Editor:');
      console.log('   https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new');
      console.log('\nSQL:');
      console.log(sql);
      process.exit(1);
    }
  }

  // Verify it was added
  console.log('\n🔍 Verifying Tink provider...');
  const { data: verifyData, error: verifyError } = await supabase
    .from('banking_providers')
    .select('*')
    .eq('id', 'tink')
    .single();

  if (verifyError || !verifyData) {
    console.log('⚠️  Warning: Could not verify Tink was added:', verifyError);
  } else {
    console.log('✅ Verified: Tink provider exists');
    console.log('   ID:', verifyData.id);
    console.log('   Display Name:', verifyData.display_name);
    console.log('   Enabled:', verifyData.enabled);
    console.log('   Supported Countries:', verifyData.supported_countries?.length || 0);
  }
}

addTinkProvider()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

