import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

const PLAID_CLIENT_ID = '6918ea73ca21950020011c9e';
const PLAID_SECRET = '7fe02e9fe66fecf111e9ae142358d1';

const configuration = new Configuration({
  basePath: PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
      'Plaid-Version': '2020-09-14',
    },
  },
});

const plaidClient = new PlaidApi(configuration);

async function testTransactionsSync() {
  try {
    console.log('Creating test item in Plaid sandbox...\n');
    
    const sandboxResponse = await plaidClient.sandboxPublicTokenCreate({
      institution_id: 'ins_109508',  // First Platypus Bank
      initial_products: ['transactions'] as Products[],
    });
    
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: sandboxResponse.data.public_token,
    });
    
    const accessToken = exchangeResponse.data.access_token;
    console.log('✅ Access Token created\n');

    console.log('Testing /transactions/sync endpoint...\n');
    
    const syncResponse = await plaidClient.transactionsSync({
      access_token: accessToken,
      options: {
        include_personal_finance_category: true,
      }
    });
    
    console.log('📊 Sync Response:');
    console.log(`   Added: ${syncResponse.data.added.length} transactions`);
    console.log(`   Modified: ${syncResponse.data.modified.length} transactions`);
    console.log(`   Removed: ${syncResponse.data.removed.length} transactions`);
    console.log(`   Has More: ${syncResponse.data.has_more}`);
    console.log(`   Next Cursor: ${syncResponse.data.next_cursor}`);
    
    if (syncResponse.data.added.length > 0) {
      console.log('\n✅ Sample Transactions:');
      syncResponse.data.added.slice(0, 5).forEach(tx => {
        console.log(`   ${tx.date}: ${tx.name} - $${tx.amount} (${tx.account_id})`);
      });
    } else {
      console.log('\n⚠️  No transactions in initial sync response.');
      console.log('This is expected - Plaid may need time to process.');
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.response?.data || error.message);
  }
}

testTransactionsSync();
