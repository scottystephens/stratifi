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

async function testPlaidTransactions() {
  try {
    console.log('Step 1: Creating Link Token...');
    const linkResponse = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'test-user-' + Date.now() },
      client_name: 'Stratifi Test',
      products: ['transactions'] as Products[],
      country_codes: ['US'] as CountryCode[],
      language: 'en',
    });
    console.log('✅ Link Token created:', linkResponse.data.link_token.substring(0, 30) + '...');

    console.log('\nStep 2: Creating Sandbox Public Token (simulating user OAuth)...');
    const sandboxResponse = await plaidClient.sandboxPublicTokenCreate({
      institution_id: 'ins_109508',  // First Platypus Bank (Chase in sandbox)
      initial_products: ['transactions'] as Products[],
    });
    console.log('✅ Public Token created:', sandboxResponse.data.public_token.substring(0, 30) + '...');

    console.log('\nStep 3: Exchanging Public Token for Access Token...');
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: sandboxResponse.data.public_token,
    });
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;
    console.log('✅ Access Token received:', accessToken.substring(0, 30) + '...');
    console.log('✅ Item ID:', itemId);

    console.log('\nStep 4: Fetching Accounts...');
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });
    console.log('✅ Accounts found:', accountsResponse.data.accounts.length);
    accountsResponse.data.accounts.forEach(acc => {
      console.log(`   - ${acc.name} (${acc.account_id}): ${acc.balances.current} ${acc.balances.iso_currency_code}`);
    });

    console.log('\nStep 5: Fetching Transactions (last 30 days)...');
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];
    
    const transactionsResponse = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
    });
    
    console.log(`✅ Transactions found: ${transactionsResponse.data.transactions.length}`);
    console.log(`   Total transactions: ${transactionsResponse.data.total_transactions}`);
    
    if (transactionsResponse.data.transactions.length > 0) {
      console.log('\nSample transactions:');
      transactionsResponse.data.transactions.slice(0, 5).forEach(tx => {
        console.log(`   - ${tx.date}: ${tx.name} - $${tx.amount} (${tx.account_id})`);
      });
    } else {
      console.log('\n⚠️  No transactions returned!');
      console.log('This is expected in Plaid sandbox - transactions may not be immediately available.');
      console.log('Try again in 30-60 seconds or use /transactions/sync endpoint.');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testPlaidTransactions();
