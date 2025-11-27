import {
  BankingProvider,
  BankingProviderConfig,
  ConnectionCredentials,
  OAuthTokens,
  ProviderAccount,
  ProviderTransaction,
} from './base-provider';
import type {
  RawAccountsResponse,
  RawTransactionsResponse,
  TransactionFetchOptions,
} from './raw-types';
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
        client_name: 'Stratiri',
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
      console.log('🏦 Fetching Plaid accounts and institution information...');
      
      const response = await plaidClient.accountsGet({
        access_token: credentials.tokens.accessToken,
      });

      // Fetch institution information using Item ID
      let institutionName = 'Plaid'; // Fallback
      let institutionId: string | null | undefined = null;
      let institutionLogo: string | undefined;
      let institutionUrl: string | undefined;
      let institutionData: Record<string, any> | undefined;

      try {
        const itemResponse = await plaidClient.itemGet({
          access_token: credentials.tokens.accessToken,
        });

        institutionId = itemResponse.data.item.institution_id || null;
        
        console.log(`📋 Plaid Item ID: ${itemResponse.data.item.item_id}, Institution ID: ${institutionId || 'NOT PROVIDED'}`);
        
        if (institutionId) {
          console.log(`🔍 Fetching institution details for: ${institutionId}`);
          
          const instResponse = await plaidClient.institutionsGetById({
            institution_id: institutionId,
            country_codes: PLAID_COUNTRY_CODES as CountryCode[],
          });

          const institution = instResponse.data.institution;
          institutionName = institution.name;
          institutionLogo = institution.logo || undefined;
          institutionUrl = institution.url || undefined;
          
          // Store ALL institution data
          institutionData = {
            institution_id: institution.institution_id,
            name: institution.name,
            products: institution.products,
            country_codes: institution.country_codes,
            url: institution.url,
            primary_color: institution.primary_color,
            logo: institution.logo,
            routing_numbers: institution.routing_numbers,
            oauth: institution.oauth,
            status: institution.status,
          };

          console.log(`✅ Institution: ${institutionName}`);
        } else {
          console.warn(`⚠️  Plaid did not provide institution_id (likely Sandbox mode) - using fallback: ${institutionName}`);
        }
      } catch (instError: any) {
        console.error('❌ Failed to fetch institution details:', instError.message);
        console.error('Error details:', JSON.stringify(instError, null, 2));
        // Continue with fallback values
      }

      return response.data.accounts.map((account) => ({
        externalAccountId: account.account_id,
        accountName: account.name,
        accountNumber: account.mask || undefined,
        accountType: this.mapAccountType(account.type),
        currency: account.balances.iso_currency_code || 'USD',
        balance: account.balances.current || 0,
        status: 'active',
        // Institution information
        institutionId: institutionId || undefined,
        institutionName,
        institutionLogo,
        institutionUrl,
        institutionData,
        // Store ALL account data in metadata
        metadata: {
          subtype: account.subtype,
          officialName: account.official_name,
          account_id: account.account_id,
          mask: account.mask,
          type: account.type,
          balances: {
            available: account.balances.available,
            current: account.balances.current,
            limit: account.balances.limit,
            iso_currency_code: account.balances.iso_currency_code,
            unofficial_currency_code: account.balances.unofficial_currency_code,
          },
          verification_status: account.verification_status,
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
  // NEW: Raw Data Methods (Primary methods going forward)
  // =====================================================

  /**
   * Fetch raw accounts data directly from Plaid API
   * Stores 100% of the API response in JSONB format for auto-detection of new fields
   */
  async fetchRawAccounts(credentials: ConnectionCredentials): Promise<RawAccountsResponse> {
    const startTime = Date.now();

    try {
      console.log('[PlaidRaw] Fetching raw accounts from Plaid API...');

      // Fetch accounts
      const accountsResponse = await plaidClient.accountsGet({
        access_token: credentials.tokens.accessToken,
      });

      // Fetch institution details (if available)
      let institutionData = null;
      try {
        const itemResponse = await plaidClient.itemGet({
          access_token: credentials.tokens.accessToken,
        });

        if (itemResponse.data.item.institution_id) {
          console.log(`[PlaidRaw] Fetching institution details for: ${itemResponse.data.item.institution_id}`);

          const instResponse = await plaidClient.institutionsGetById({
            institution_id: itemResponse.data.item.institution_id,
            country_codes: PLAID_COUNTRY_CODES as CountryCode[],
          });
          institutionData = instResponse.data.institution;
        }
      } catch (instError) {
        console.warn('[PlaidRaw] Could not fetch institution details:', instError instanceof Error ? instError.message : String(instError));
        // Continue without institution data
      }

      const result: RawAccountsResponse = {
        provider: 'plaid',
        connectionId: credentials.connectionId,
        tenantId: credentials.tenantId,
        responseType: 'accounts',
        rawData: accountsResponse.data,  // COMPLETE Plaid response
        accountCount: accountsResponse.data.accounts.length,
        institutionData,
        fetchedAt: new Date(),
        apiEndpoint: '/accounts/get',
        responseMetadata: {
          statusCode: 200,
          headers: {},
          duration: Date.now() - startTime,
        },
      };

      console.log(`[PlaidRaw] Successfully fetched ${result.accountCount} raw accounts`);
      return result;

    } catch (error) {
      console.error('[PlaidRaw] Failed to fetch raw accounts:', error);
      throw error;
    }
  }

  /**
   * Fetch raw transactions data directly from Plaid API
   * Stores 100% of the API response in JSONB format for auto-detection of new fields
   */
  async fetchRawTransactions(
    credentials: ConnectionCredentials,
    accountId: string,
    options?: TransactionFetchOptions
  ): Promise<RawTransactionsResponse> {
    const startTime = Date.now();

    try {
      console.log(`[PlaidRaw] Fetching raw transactions for account ${accountId}...`);

      // Use transactions/sync for incremental updates (cost-optimized)
      const syncRequest: any = {
        access_token: credentials.tokens.accessToken,
        cursor: options?.cursor,
      };

      // Add date range if specified
      if (options?.startDate) {
        syncRequest.options = {
          include_original_description: true,
          include_personal_finance_category: true,
        };
        // Note: cursor-based sync doesn't use date filters directly
      }

      const transactionsResponse = await plaidClient.transactionsSync(syncRequest);

      // Calculate total transaction count from added/modified/removed
      const addedCount = transactionsResponse.data.added?.length || 0;
      const modifiedCount = transactionsResponse.data.modified?.length || 0;
      const removedCount = transactionsResponse.data.removed?.length || 0;
      const totalTransactionCount = addedCount + modifiedCount + removedCount;

      const result: RawTransactionsResponse = {
        provider: 'plaid',
        connectionId: credentials.connectionId,
        tenantId: credentials.tenantId,
        responseType: 'transactions',
        rawData: transactionsResponse.data,  // COMPLETE Plaid sync response
        transactionCount: totalTransactionCount,
        fetchedAt: new Date(),
        apiEndpoint: '/transactions/sync',
        requestParams: {
          cursor: options?.cursor,
          accountId,
        },
        pagination: {
          cursor: transactionsResponse.data.next_cursor,
          hasMore: transactionsResponse.data.has_more,
          nextPageToken: transactionsResponse.data.next_cursor,
        },
        responseMetadata: {
          statusCode: 200,
          headers: {},
          duration: Date.now() - startTime,
        },
      };

      console.log(`[PlaidRaw] Successfully fetched ${result.transactionCount} raw transactions`);
      return result;

    } catch (error) {
      console.error(`[PlaidRaw] Failed to fetch raw transactions for account ${accountId}:`, error);

      // Check if it's a Plaid API error with PRODUCT_NOT_READY
      const errorObj = error as any;
      if (errorObj?.response?.data?.error_code === 'PRODUCT_NOT_READY') {
        console.log('[PlaidRaw] Plaid transactions not ready yet. Will retry on next sync.');
        // Return empty response instead of throwing
        return {
          provider: 'plaid',
          connectionId: credentials.connectionId,
          tenantId: credentials.tenantId,
          responseType: 'transactions',
          rawData: { added: [], modified: [], removed: [], has_more: false },
          transactionCount: 0,
          fetchedAt: new Date(),
          apiEndpoint: '/transactions/sync',
          pagination: { hasMore: false },
          responseMetadata: {
            statusCode: 200,
            headers: {},
            duration: Date.now() - startTime,
          },
        };
      }

      throw error;
    }
  }

  // =====================================================
  // Optimized Connection-Level Sync
  // =====================================================


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

