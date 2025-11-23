/**
 * Test Plaid API responses - automatically fetches access token from Supabase
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { Configuration, PlaidApi, PlaidEnvironments, CountryCode } from 'plaid';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID!;
const PLAID_SECRET = process.env.PLAID_SECRET!;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
        'PLAID-SECRET': PLAID_SECRET,
      },
    },
  })
);

const PLAID_COUNTRY_CODES = [
  'US', 'CA', 'GB', 'IE', 'FR', 'ES', 'NL', 'DE', 'IT', 'PL',
  'BE', 'AT', 'DK', 'FI', 'NO', 'SE', 'EE', 'LT', 'LV'
];

async function testPlaidDirectly() {
  console.log('🔍 Testing Plaid API Responses\n');
  console.log('Environment:', PLAID_ENV);
  console.log('Client ID:', PLAID_CLIENT_ID);
  console.log('');

  try {
    // Fetch Plaid connection from Supabase
    console.log('📡 Fetching Plaid connection from Supabase...\n');
    
    const { data: connection, error: dbError } = await supabase
      .from('connections')
      .select('id, name, status, created_at')
      .eq('provider', 'plaid')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (dbError || !connection) {
      console.error('❌ No Plaid connection found in database');
      console.error('Error:', dbError?.message);
      process.exit(1);
    }

    console.log('✅ Found Plaid connection:');
    console.log('  - ID:', connection.id);
    console.log('  - Name:', connection.name);
    console.log('  - Status:', connection.status);
    console.log('  - Created:', connection.created_at);
    console.log('');

    // Fetch access token from provider_tokens table
    console.log('📡 Fetching access token from provider_tokens table...\n');
    
    const { data: tokenData, error: tokenError } = await supabase
      .from('provider_tokens')
      .select('access_token, provider_id, status, expires_at, provider_metadata')
      .eq('connection_id', connection.id)
      .single();

    if (tokenError || !tokenData) {
      console.error('❌ No access token found in provider_tokens');
      console.error('Error:', tokenError?.message);
      process.exit(1);
    }

    console.log('✅ Found provider token:');
    console.log('  - Provider:', tokenData.provider_id);
    console.log('  - Status:', tokenData.status);
    console.log('  - Expires:', tokenData.expires_at);
    console.log('');

    const ACCESS_TOKEN = tokenData.access_token;

    if (!ACCESS_TOKEN) {
      console.error('❌ Access token is null');
      process.exit(1);
    }

    console.log('✅ Access Token:', ACCESS_TOKEN.substring(0, 25) + '...\n');
    // ==============================================
    // TEST 1: itemGet - Get Item information
    // ==============================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 TEST 1: itemGet() - Item Information');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const itemResponse = await plaidClient.itemGet({
      access_token: ACCESS_TOKEN,
    });

    console.log('Full itemGet response:');
    console.log(JSON.stringify(itemResponse.data, null, 2));
    console.log('\n');

    console.log('Key fields from item:');
    console.log('  - item_id:', itemResponse.data.item.item_id);
    console.log('  - institution_id:', itemResponse.data.item.institution_id || '❌ NOT PROVIDED (NULL)');
    console.log('  - available_products:', itemResponse.data.item.available_products);
    console.log('  - billed_products:', itemResponse.data.item.billed_products);
    console.log('\n');

    // ==============================================
    // TEST 2: accountsGet - Get Account information
    // ==============================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💳 TEST 2: accountsGet() - Account Information');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const accountsResponse = await plaidClient.accountsGet({
      access_token: ACCESS_TOKEN,
    });

    console.log('Full accountsGet response:');
    console.log(JSON.stringify(accountsResponse.data, null, 2));
    console.log('\n');

    console.log(`Found ${accountsResponse.data.accounts.length} accounts:`);
    accountsResponse.data.accounts.forEach((account, i) => {
      console.log(`\n  Account ${i + 1}:`);
      console.log('    - account_id:', account.account_id);
      console.log('    - name:', account.name);
      console.log('    - official_name:', account.official_name || '(not provided)');
      console.log('    - type:', account.type);
      console.log('    - subtype:', account.subtype);
      console.log('    - mask:', account.mask);
      console.log('    - balance:', account.balances.current, account.balances.iso_currency_code);
    });
    console.log('\n');

    // ==============================================
    // TEST 3: Try to get institution info (if institution_id exists)
    // ==============================================
    const institutionId = itemResponse.data.item.institution_id;

    if (institutionId) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🏦 TEST 3: institutionsGetById() - Institution Details');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      try {
        const institutionResponse = await plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: PLAID_COUNTRY_CODES as CountryCode[],
          options: {
            include_optional_metadata: true,
          },
        });

        console.log('Full institutionsGetById response:');
        console.log(JSON.stringify(institutionResponse.data, null, 2));
        console.log('\n');

        console.log('Institution Details:');
        console.log('  - institution_id:', institutionResponse.data.institution.institution_id);
        console.log('  - name:', institutionResponse.data.institution.name);
        console.log('  - url:', institutionResponse.data.institution.url);
        console.log('  - primary_color:', institutionResponse.data.institution.primary_color);
        console.log('  - logo:', institutionResponse.data.institution.logo ? 'YES (base64)' : 'None');
        console.log('  - products:', institutionResponse.data.institution.products);
        console.log('  - country_codes:', institutionResponse.data.institution.country_codes);
      } catch (instError: any) {
        console.error('❌ Failed to fetch institution:', instError.message);
        if (instError.response?.data) {
          console.error('Error response:', JSON.stringify(instError.response.data, null, 2));
        }
      }
    } else {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  TEST 3 SKIPPED: No institution_id provided');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('❌ CONFIRMED: Plaid Sandbox does NOT provide institution_id');
      console.log('\nThis means:');
      console.log('  1. Sandbox accounts will show "Plaid" as the bank name (fallback)');
      console.log('  2. Real bank names only work in DEVELOPMENT or PRODUCTION');
      console.log('  3. You need real bank connections to test institution names\n');
    }

    console.log('\n✅ Test complete!');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testPlaidDirectly();

