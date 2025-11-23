/**
 * Test script to see EXACTLY what Plaid returns in Sandbox mode
 * 
 * Run: npx tsx scripts/utilities/test-plaid-response.ts
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

async function testPlaidResponses() {
  console.log('🔍 Testing Plaid API Responses\n');
  console.log('Environment:', PLAID_ENV);
  console.log('Client ID:', PLAID_CLIENT_ID);
  console.log('');

  try {
    // Get a real access token from your connections table
    const { data: connection, error } = await supabase
      .from('connections')
      .select('encrypted_credentials')
      .eq('provider', 'plaid')
      .eq('status', 'active')
      .limit(1)
      .single();

    if (error || !connection) {
      console.error('❌ No active Plaid connection found');
      console.error('Please connect a Plaid account first at: https://stratifi.vercel.app/connections');
      process.exit(1);
    }

    const credentials = JSON.parse(connection.encrypted_credentials);
    const accessToken = credentials.tokens?.accessToken;

    if (!accessToken) {
      console.error('❌ No access token found in connection');
      process.exit(1);
    }

    console.log('✅ Found Plaid connection with access token\n');

    // ==============================================
    // TEST 1: itemGet - Get Item information
    // ==============================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 TEST 1: itemGet() - Item Information');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const itemResponse = await plaidClient.itemGet({
      access_token: accessToken,
    });

    console.log('Full itemGet response:');
    console.log(JSON.stringify(itemResponse.data, null, 2));
    console.log('\n');

    console.log('Key fields:');
    console.log('- item.item_id:', itemResponse.data.item.item_id);
    console.log('- item.institution_id:', itemResponse.data.item.institution_id || '❌ NOT PROVIDED');
    console.log('- item.products:', itemResponse.data.item.available_products);
    console.log('\n');

    // ==============================================
    // TEST 2: accountsGet - Get Account information
    // ==============================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💳 TEST 2: accountsGet() - Account Information');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    console.log('Full accountsGet response:');
    console.log(JSON.stringify(accountsResponse.data, null, 2));
    console.log('\n');

    console.log(`Found ${accountsResponse.data.accounts.length} accounts:`);
    accountsResponse.data.accounts.forEach((account, i) => {
      console.log(`\nAccount ${i + 1}:`);
      console.log('- account_id:', account.account_id);
      console.log('- name:', account.name);
      console.log('- official_name:', account.official_name);
      console.log('- type:', account.type);
      console.log('- subtype:', account.subtype);
      console.log('- mask:', account.mask);
      console.log('- balance:', account.balances.current);
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

        console.log('Institution Info:');
        console.log('- institution_id:', institutionResponse.data.institution.institution_id);
        console.log('- name:', institutionResponse.data.institution.name);
        console.log('- url:', institutionResponse.data.institution.url);
        console.log('- logo:', institutionResponse.data.institution.logo ? `${institutionResponse.data.institution.logo.substring(0, 50)}...` : 'None');
        console.log('- primary_color:', institutionResponse.data.institution.primary_color);
        console.log('- products:', institutionResponse.data.institution.products);
        console.log('- country_codes:', institutionResponse.data.institution.country_codes);
        console.log('- routing_numbers:', institutionResponse.data.institution.routing_numbers);
      } catch (instError: any) {
        console.error('❌ Failed to fetch institution:', instError.message);
        console.error('Error response:', JSON.stringify(instError.response?.data, null, 2));
      }
    } else {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  TEST 3 SKIPPED: No institution_id provided');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('This is expected in Plaid Sandbox mode.');
      console.log('Sandbox does NOT provide real institution data.');
      console.log('\nTo get real institution names, you need:');
      console.log('1. Switch to DEVELOPMENT or PRODUCTION environment');
      console.log('2. Use real bank connections (not sandbox test accounts)');
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

testPlaidResponses();

