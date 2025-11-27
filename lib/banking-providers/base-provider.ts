// Abstract Banking Provider Interface
// All banking integrations should implement this interface

import type {
  RawAccountsResponse,
  RawTransactionsResponse,
  TransactionFetchOptions,
  ConnectionCredentials as RawConnectionCredentials
} from './raw-types';

export interface BankingProviderConfig {
  providerId: string;
  displayName: string;
  logo: string;
  color: string;
  description: string;
  authType: 'oauth' | 'api_key' | 'open_banking';
  supportsSync: boolean;
  supportedCountries: string[];
  website: string;
  documentationUrl?: string;
  integrationType: 'redirect' | 'plaid_link';
}

export interface ProviderAccount {
  externalAccountId: string;
  accountName: string;
  accountNumber?: string;
  accountType: string;
  currency: string;
  balance: number;
  iban?: string;
  bic?: string;
  status: 'active' | 'inactive' | 'closed';
  // Institution information
  institutionId?: string;      // Provider's institution identifier
  institutionName?: string;    // Actual bank/institution name (e.g., "Chase", "ING Bank")
  institutionLogo?: string;    // URL to institution logo
  institutionUrl?: string;     // Institution website
  institutionData?: Record<string, any>; // All raw institution data from provider
  metadata?: Record<string, any>;
}

export interface ProviderTransaction {
  externalTransactionId: string;
  accountId: string;
  date: Date;
  amount: number;
  currency: string;
  description: string;
  type: 'credit' | 'debit';
  counterpartyName?: string;
  counterpartyAccount?: string;
  reference?: string;
  category?: string;
  metadata?: Record<string, any>;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  tokenType?: string;
  scope?: string[];
}

export interface SyncResult {
  success: boolean;
  accountsSynced?: number;
  transactionsSynced?: number;
  errors?: string[];
  metadata?: Record<string, any>;
}

export interface ConnectionCredentials {
  connectionId: string;
  tenantId: string;
  tokens: OAuthTokens;
  metadata?: Record<string, any>;
}

/**
 * Abstract base class for banking providers
 * All banking integrations must extend this class
 */
export abstract class BankingProvider {
  abstract config: BankingProviderConfig;

  /**
   * Get the provider configuration
   */
  getConfig(): BankingProviderConfig {
    return this.config;
  }

  /**
   * Validate that the provider is properly configured
   */
  abstract validateConfiguration(): boolean;

  // =====================================================
  // Plaid Link Methods (Optional)
  // =====================================================

  /**
   * Create a Link Token for Plaid Link flow
   * @param userId - The user ID
   * @param metadata - Optional metadata
   */
  async createLinkToken?(userId: string, metadata?: Record<string, any>): Promise<string>;

  // =====================================================
  // OAuth/Authentication Methods
  // =====================================================

  /**
   * Generate OAuth authorization URL
   * @param state - Security state parameter
   * @param metadata - Optional metadata (e.g., connection ID)
   */
  abstract getAuthorizationUrl(state: string, metadata?: Record<string, any>): string;

  /**
   * Exchange authorization code for access token
   * @param code - Authorization code from OAuth callback
   */
  abstract exchangeCodeForToken(code: string): Promise<OAuthTokens>;

  /**
   * Refresh an expired access token
   * @param refreshToken - The refresh token
   */
  abstract refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;

  /**
   * Check if token is expired or about to expire
   * @param expiresAt - Token expiration date
   */
  isTokenExpired(expiresAt: Date): boolean {
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    return expiresAt <= fiveMinutesFromNow;
  }

  // =====================================================
  // Account Management Methods
  // =====================================================

  /**
   * Fetch all accounts from the banking provider
   * @param credentials - Connection credentials including tokens
   */
  abstract fetchAccounts(credentials: ConnectionCredentials): Promise<ProviderAccount[]>;

  /**
   * Fetch a specific account
   * @param credentials - Connection credentials
   * @param accountId - External account ID
   */
  abstract fetchAccount(
    credentials: ConnectionCredentials,
    accountId: string
  ): Promise<ProviderAccount>;

  // =====================================================
  // Transaction Management Methods
  // =====================================================

  /**
   * Fetch transactions for a specific account
   * @param credentials - Connection credentials
   * @param accountId - External account ID
   * @param options - Fetch options (date range, limit, etc.)
   */
  abstract fetchTransactions(
    credentials: ConnectionCredentials,
    accountId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<ProviderTransaction[]>;

  /**
   * Fetch transactions for all accounts
   * @param credentials - Connection credentials
   * @param options - Fetch options
   */
  async fetchAllTransactions(
    credentials: ConnectionCredentials,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<Map<string, ProviderTransaction[]>> {
    const accounts = await this.fetchAccounts(credentials);
    const transactionsByAccount = new Map<string, ProviderTransaction[]>();

    for (const account of accounts) {
      try {
        const transactions = await this.fetchTransactions(
          credentials,
          account.externalAccountId,
          options
        );
        transactionsByAccount.set(account.externalAccountId, transactions);
      } catch (error) {
        console.error(
          `Failed to fetch transactions for account ${account.externalAccountId}:`,
          error
        );
        // Continue with other accounts
      }
    }

    return transactionsByAccount;
  }

  // =====================================================
  // NEW: Raw Data Methods (Primary methods going forward)
  // =====================================================

  /**
   * Fetch raw accounts data directly from provider API
   * This method stores 100% of the API response in JSONB format
   * @param credentials - Connection credentials including tokens
   */
  abstract fetchRawAccounts(credentials: RawConnectionCredentials): Promise<RawAccountsResponse>;

  /**
   * Fetch raw transactions data directly from provider API
   * This method stores 100% of the API response in JSONB format
   * @param credentials - Connection credentials
   * @param accountId - External account ID
   * @param options - Fetch options (date range, cursor, limit, etc.)
   */
  abstract fetchRawTransactions(
    credentials: RawConnectionCredentials,
    accountId: string,
    options?: TransactionFetchOptions
  ): Promise<RawTransactionsResponse>;

  // =====================================================
  // User Information Methods
  // =====================================================

  /**
   * Fetch user information from the provider
   * @param credentials - Connection credentials
   */
  abstract fetchUserInfo(credentials: ConnectionCredentials): Promise<{
    userId: string;
    name: string;
    email?: string;
    metadata?: Record<string, any>;
  }>;

  // =====================================================
  // Webhook/Real-time Updates (Optional)
  // =====================================================

  /**
   * Register webhook for real-time updates
   * @param credentials - Connection credentials
   * @param webhookUrl - URL to receive webhook events
   */
  async registerWebhook?(
    credentials: ConnectionCredentials,
    webhookUrl: string
  ): Promise<{ webhookId: string; secret?: string }>;

  /**
   * Verify webhook signature
   * @param payload - Webhook payload
   * @param signature - Signature from webhook headers
   * @param secret - Webhook secret
   */
  async verifyWebhookSignature?(
    payload: string,
    signature: string,
    secret: string
  ): Promise<boolean>;

  // =====================================================
  // Utility Methods
  // =====================================================

  /**
   * Test the connection with the provider
   * @param credentials - Connection credentials
   */
  async testConnection(credentials: ConnectionCredentials): Promise<boolean> {
    try {
      await this.fetchUserInfo(credentials);
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  /**
   * Get provider-specific error message
   * @param error - Error from provider API
   */
  abstract getErrorMessage(error: any): string;

  /**
   * Map provider account type to Stratiri account type
   * @param providerAccountType - Account type from provider
   */
  abstract mapAccountType(providerAccountType: string): string;

  /**
   * Format amount according to provider's format
   * @param amount - Amount string from provider
   */
  abstract formatAmount(amount: string | number): number;
}

/**
 * Provider factory function type
 */
export type ProviderFactory = () => BankingProvider;

/**
 * Provider metadata for registration
 */
export interface ProviderMetadata {
  providerId: string;
  displayName: string;
  factory: ProviderFactory;
  enabled: boolean;
  requiredEnvVars: string[];
}

