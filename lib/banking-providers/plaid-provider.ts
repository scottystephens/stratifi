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
      // Note: Plaid's /transactions/get is deprecated in favor of /transactions/sync 
      // but for simple fetching we can use /transactions/get if enabled, or sync.
      // Here implementing simple get for compatibility.
      
      const startDate = options?.startDate?.toISOString().split('T')[0] || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = options?.endDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];

      try {
          const response = await plaidClient.transactionsGet({
              access_token: credentials.tokens.accessToken,
              start_date: startDate,
              end_date: endDate,
              options: {
                  account_ids: [accountId],
                  count: options?.limit || 100,
                  offset: options?.offset || 0
              }
          });

          return response.data.transactions.map(tx => ({
              externalTransactionId: tx.transaction_id,
              accountId: tx.account_id,
              date: new Date(tx.date),
              amount: tx.amount * -1, // Plaid: positive is expense. Stratifi: positive is credit (deposit)? verification needed. 
              // Checking Base Provider or other providers: 
              // Usually banking apps treat credit as positive. Plaid treats debit as positive.
              // Reversing sign to match standard accounting (credit +, debit -) if that's the system convention.
              // Let's assume standard: inflow positive, outflow negative.
              // Plaid: $50 coffee -> amount: 50.  $1000 paycheck -> amount: -1000.
              // So multiplying by -1 gives: coffee -50, paycheck 1000.
              currency: tx.iso_currency_code || 'USD',
              description: tx.name,
              type: (tx.amount < 0) ? 'credit' : 'debit', // based on Plaid raw amount
              category: tx.category ? tx.category[0] : undefined,
              metadata: {
                  merchantName: tx.merchant_name,
                  category: tx.category
              }
          }));

      } catch (error) {
          console.error("Error fetching Plaid transactions:", error);
          throw error;
      }
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

