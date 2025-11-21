import {
  BankingProvider,
  BankingProviderConfig,
  ConnectionCredentials,
  OAuthTokens,
  ProviderAccount,
  ProviderTransaction,
} from './base-provider';
import { plaidClient, PLAID_PRODUCTS, PLAID_COUNTRY_CODES } from '../plaid';
import { CountryCode, Products } from 'plaid';
import { 
  syncPlaidTransactions, 
  syncPlaidAccounts,
  shouldSyncPlaidConnection 
} from '../services/plaid-sync-service';

export class PlaidProvider extends BankingProvider {
  config: BankingProviderConfig = {
    providerId: 'plaid',
    displayName: 'Plaid (Global Banks)',
    logo: '/logos/plaid.svg',
    color: '#000000',
    description: 'Connect with thousands of banks worldwide securely.',
    authType: 'oauth',
    supportsSync: true,
    supportedCountries: ['US', 'CA', 'GB', 'IE', 'FR', 'ES', 'NL', 'DE', 'IT', 'PL', 'BE', 'AT', 'DK', 'FI', 'NO', 'SE', 'EE', 'LT', 'LV'],
    website: 'https://plaid.com',
    integrationType: 'plaid_link',
  };

  validateConfiguration(): boolean {
    return (
      !!process.env.PLAID_CLIENT_ID &&
      !!process.env.PLAID_SECRET
    );
  }

  // =====================================================
  // Link Flow Methods
  // =====================================================

  async createLinkToken(userId: string, metadata?: Record<string, any>): Promise<string> {
    try {
      console.log('Creating Plaid Link token for user:', userId);
      console.log('Plaid config:', {
        hasClientId: !!process.env.PLAID_CLIENT_ID,
        hasSecret: !!process.env.PLAID_SECRET,
        env: process.env.PLAID_ENV,
        products: PLAID_PRODUCTS,
        countryCodes: PLAID_COUNTRY_CODES
      });

      const response = await plaidClient.linkTokenCreate({
        user: { client_user_id: userId },
        client_name: 'Stratifi',
        products: PLAID_PRODUCTS as Products[],
        country_codes: PLAID_COUNTRY_CODES as CountryCode[],
        language: 'en',
      });
      
      console.log('Plaid Link token created successfully');
      return response.data.link_token;
    } catch (error: any) {
      console.error('Error creating Plaid Link token:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status
      });
      throw new Error(`Failed to initialize Plaid Link: ${error?.response?.data?.error_message || error?.message}`);
    }
  }

  // =====================================================
  // OAuth/Authentication Methods
  // =====================================================

  getAuthorizationUrl(state: string): string {
    throw new Error('Plaid uses Link, not standard OAuth redirect.');
  }

  async exchangeCodeForToken(code: string): Promise<OAuthTokens> {
    // For Plaid, "code" is the public_token
    try {
      const response = await plaidClient.itemPublicTokenExchange({
        public_token: code,
      });

      return {
        accessToken: response.data.access_token,
        // Plaid doesn't use refresh tokens in the same way, but Item ID is useful
        refreshToken: response.data.item_id, 
        // Plaid access tokens don't typically expire unless rotated
      };
    } catch (error) {
      console.error('Error exchanging Plaid public token:', error);
      throw new Error('Failed to exchange Plaid token');
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    // Plaid tokens don't expire in the traditional sense.
    // If an item needs re-auth, it's a different flow (Link update mode).
    // For now, return existing.
    return {
        accessToken: refreshToken, // This is technically incorrect but placeholder
    }
  }

  // =====================================================
  // Account Management Methods
  // =====================================================

  async fetchAccounts(credentials: ConnectionCredentials): Promise<ProviderAccount[]> {
    try {
      const response = await plaidClient.accountsGet({
        access_token: credentials.tokens.accessToken,
      });

      return response.data.accounts.map((account) => ({
        externalAccountId: account.account_id,
        accountName: account.name,
        accountNumber: account.mask || undefined,
        accountType: this.mapAccountType(account.type),
        currency: account.balances.iso_currency_code || 'USD',
        balance: account.balances.current || 0,
        status: 'active',
        metadata: {
            subtype: account.subtype,
            officialName: account.official_name
        }
      }));
    } catch (error) {
      console.error('Error fetching Plaid accounts:', error);
      throw error;
    }
  }

  async fetchAccount(
    credentials: ConnectionCredentials,
    accountId: string
  ): Promise<ProviderAccount> {
    // Plaid fetchAccounts gets all accounts for an item
    const accounts = await this.fetchAccounts(credentials);
    const account = accounts.find((a) => a.externalAccountId === accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }
    return account;
  }

  // =====================================================
  // Transaction Management Methods
  // =====================================================

  async fetchTransactions(
    credentials: ConnectionCredentials,
    accountId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<ProviderTransaction[]> {
      // IMPORTANT: This method is called PER ACCOUNT by sync-service.ts
      // To optimize costs, we need to fetch ALL transactions ONCE and cache them
      // The sync-service will call this 3 times for 3 accounts - we should only call Plaid API once
      
      // For now, we'll use the direct API call but log a warning
      // TODO: Refactor sync-service to call Plaid once per connection, not per account
      
      try {
          console.log('📊 Fetching Plaid transactions using /transactions/sync');
          console.log('⚠️  NOTE: Being called per-account. Should optimize to call once per connection.');
          
          // Use transactions/sync for incremental updates
          const response = await plaidClient.transactionsSync({
              access_token: credentials.tokens.accessToken,
              options: {
                  include_personal_finance_category: true,
              }
          });

          console.log(`✅ Plaid sync returned:`, {
              added: response.data.added.length,
              modified: response.data.modified.length,
              removed: response.data.removed.length,
              hasMore: response.data.has_more,
              nextCursor: response.data.next_cursor?.substring(0, 20) + '...'
          });
          
          // Filter by accountId if specified
          let transactions = response.data.added;
          
          console.log(`🔍 Plaid returned ${transactions.length} total transactions`);
          if (accountId) {
              console.log(`🔍 Filtering for accountId: ${accountId}`);
              console.log(`🔍 Sample transaction account_ids:`, transactions.slice(0, 3).map(tx => tx.account_id));
              
              const filtered = transactions.filter(tx => tx.account_id === accountId);
              console.log(`🔍 After filter: ${filtered.length} transactions match accountId ${accountId}`);
              transactions = filtered;
          }

          // NO date filtering - Plaid manages this via cursor
          console.log(`📅 Skipping date filter - /transactions/sync manages date range via cursor`);

          // Apply limit if specified
          if (options?.limit) {
              transactions = transactions.slice(0, options.limit);
          }

          return transactions.map(tx => ({
              externalTransactionId: tx.transaction_id,
              accountId: tx.account_id,
              date: new Date(tx.date),
              amount: tx.amount * -1, // Plaid: positive = expense, negative = income
              currency: tx.iso_currency_code || 'USD',
              description: tx.name,
              type: (tx.amount < 0) ? 'credit' : 'debit',
              counterpartyName: tx.merchant_name || undefined,
              category: tx.personal_finance_category?.primary || tx.category?.[0],
              metadata: {
                  merchantName: tx.merchant_name,
                  category: tx.category,
                  personalFinanceCategory: tx.personal_finance_category,
                  pending: tx.pending,
                  paymentChannel: tx.payment_channel
              }
          }));

      } catch (error: any) {
          console.error("Error fetching Plaid transactions:", {
              message: error?.message,
              errorCode: error?.response?.data?.error_code,
              errorMessage: error?.response?.data?.error_message
          });
          
          if (error?.response?.data?.error_code === 'PRODUCT_NOT_READY') {
              console.log('⚠️  Plaid transactions not ready yet. Will retry on next sync.');
              return [];
          }
          
          throw error;
      }
  }

  // =====================================================
  // Optimized Connection-Level Sync
  // =====================================================

  /**
   * Sync all transactions for a connection in ONE API call
   * This is the cost-optimized approach - call once, distribute to accounts
   * Returns transactions grouped by account
   */
  async syncConnectionTransactions(
    credentials: ConnectionCredentials,
    options?: {
      forceFullSync?: boolean;
      importJobId?: string;
    }
  ): Promise<Map<string, ProviderTransaction[]>> {
    console.log('🚀 Starting connection-level Plaid sync (optimized - ONE API call)');
    
    const syncResult = await syncPlaidTransactions(
      credentials.tenantId,
      credentials.connectionId,
      credentials.tokens.accessToken,
      options
    );

    console.log(`✅ Cursor-based sync complete:`, {
      added: syncResult.transactionsAdded,
      modified: syncResult.transactionsModified,
      removed: syncResult.transactionsRemoved,
      imported: syncResult.transactionsImported,
      cursor: syncResult.cursor.substring(0, 20) + '...',
    });

    // Fetch the stored Plaid transactions from our database (not from API!)
    const { supabase } = await import('../supabase');
    const { data: plaidTxns } = await supabase
      .from('plaid_transactions')
      .select('*')
      .eq('connection_id', credentials.connectionId)
      .eq('sync_action', 'added')
      .order('date', { ascending: false })
      .limit(options?.importJobId ? 500 : 100); // Reasonable limit

    // Group by Plaid account_id
    const txnsByAccount = new Map<string, ProviderTransaction[]>();
    
    plaidTxns?.forEach(tx => {
      if (!txnsByAccount.has(tx.account_id)) {
        txnsByAccount.set(tx.account_id, []);
      }
      
      txnsByAccount.get(tx.account_id)!.push({
        externalTransactionId: tx.transaction_id,
        accountId: tx.account_id,
        date: new Date(tx.date),
        amount: Math.abs(tx.amount), // Already reversed in storage
        currency: tx.iso_currency_code || 'USD',
        description: tx.merchant_name || tx.name,
        type: tx.amount < 0 ? 'credit' : 'debit',
        counterpartyName: tx.counterparty_name || tx.merchant_name || undefined,
        category: tx.personal_finance_category_primary || undefined,
        metadata: {
          merchantName: tx.merchant_name,
          personalFinanceCategory: {
            primary: tx.personal_finance_category_primary,
            detailed: tx.personal_finance_category_detailed,
          },
          pending: tx.pending,
          paymentChannel: tx.payment_channel,
        }
      });
    });

    console.log(`📊 Distributed transactions: ${txnsByAccount.size} accounts`);
    
    return txnsByAccount;
  }

  // =====================================================
  // User Information Methods
  // =====================================================

  async fetchUserInfo(credentials: ConnectionCredentials): Promise<{
    userId: string;
    name: string;
    email?: string;
    metadata?: Record<string, any>;
  }> {
    // Plaid doesn't give user profile info (name/email) directly via standard API 
    // without Identity product.
    // We can return placeholder or try Identity if enabled.
    // For MVP/Sandbox, returning generic info based on Item.
    
    return {
        userId: credentials.tokens.refreshToken || 'plaid-user', // Item ID stored in refreshToken
        name: 'Plaid Connected User',
        metadata: {
            source: 'plaid'
        }
    };
  }

  // =====================================================
  // Utility Methods
  // =====================================================

  getErrorMessage(error: any): string {
    if (error?.response?.data?.error_message) {
        return error.response.data.error_message;
    }
    return error.message || 'Unknown Plaid error';
  }

  mapAccountType(providerAccountType: string): string {
      // Simple mapping
      const type = providerAccountType.toLowerCase();
      if (type.includes('checking')) return 'checking';
      if (type.includes('savings')) return 'savings';
      if (type.includes('credit')) return 'credit_card';
      if (type.includes('investment')) return 'investment';
      if (type.includes('loan')) return 'loan';
      return 'other';
  }

  formatAmount(amount: string | number): number {
    return Number(amount);
  }
}

export const plaidProvider = new PlaidProvider();

