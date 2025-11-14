// Banking Provider Template
// Copy this file and implement your own banking provider

import {
  BankingProvider,
  BankingProviderConfig,
  OAuthTokens,
  ProviderAccount,
  ProviderTransaction,
  ConnectionCredentials,
} from './base-provider';

/**
 * TODO: Rename this class to YourProviderName
 * Example: class PlaidProvider, class NordigenProvider, etc.
 */
export class ProviderTemplate extends BankingProvider {
  /**
   * TODO: Update provider configuration
   */
  config: BankingProviderConfig = {
    providerId: 'template', // TODO: Change to your provider ID (lowercase, no spaces)
    displayName: 'Provider Template', // TODO: Change to your provider's display name
    logo: '/logos/template.svg', // TODO: Add your logo
    color: '#0066CC', // TODO: Use your provider's brand color
    description: 'Connect your accounts with this provider', // TODO: Update description
    authType: 'oauth', // TODO: Change if using api_key or open_banking
    supportsSync: true,
    supportedCountries: ['US'], // TODO: Add supported country codes
    website: 'https://example.com', // TODO: Provider's website
    documentationUrl: 'https://docs.example.com', // TODO: API docs URL
  };

  /**
   * TODO: Implement configuration validation
   * Check that all required environment variables are present
   */
  validateConfiguration(): boolean {
    // TODO: Check your provider's required environment variables
    const requiredVars = [
      'TEMPLATE_CLIENT_ID',
      'TEMPLATE_CLIENT_SECRET',
      'TEMPLATE_REDIRECT_URI',
    ];

    return requiredVars.every((varName) => !!process.env[varName]);
  }

  // =====================================================
  // OAuth/Authentication Methods
  // =====================================================

  /**
   * TODO: Implement OAuth authorization URL generation
   * Build the URL where users will be redirected to authorize your app
   */
  getAuthorizationUrl(state: string, metadata?: Record<string, any>): string {
    // TODO: Replace with your provider's OAuth URL
    const clientId = process.env.TEMPLATE_CLIENT_ID!;
    const redirectUri = process.env.TEMPLATE_REDIRECT_URI!;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state: state,
      response_type: 'code',
      scope: 'accounts transactions', // TODO: Adjust scopes as needed
    });

    // TODO: Replace with actual OAuth authorization endpoint
    return `https://auth.example.com/oauth/authorize?${params.toString()}`;
  }

  /**
   * TODO: Implement token exchange
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<OAuthTokens> {
    // TODO: Replace with actual token endpoint and request format
    const response = await fetch('https://api.example.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        client_id: process.env.TEMPLATE_CLIENT_ID,
        client_secret: process.env.TEMPLATE_CLIENT_SECRET,
        redirect_uri: process.env.TEMPLATE_REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();

    // TODO: Map response to OAuthTokens format
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      tokenType: data.token_type || 'Bearer',
      scope: data.scope ? data.scope.split(' ') : undefined,
    };
  }

  /**
   * TODO: Implement token refresh
   * Refresh an expired access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    // TODO: Replace with actual token refresh endpoint
    const response = await fetch('https://api.example.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.TEMPLATE_CLIENT_ID,
        client_secret: process.env.TEMPLATE_CLIENT_SECRET,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      tokenType: data.token_type || 'Bearer',
    };
  }

  // =====================================================
  // Account Management Methods
  // =====================================================

  /**
   * TODO: Implement account fetching
   * Fetch all accounts from the provider
   */
  async fetchAccounts(credentials: ConnectionCredentials): Promise<ProviderAccount[]> {
    // TODO: Replace with actual accounts endpoint
    const response = await fetch('https://api.example.com/accounts', {
      headers: {
        Authorization: `Bearer ${credentials.tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch accounts: ${response.statusText}`);
    }

    const data = await response.json();

    // TODO: Map provider's account format to ProviderAccount format
    return data.accounts.map((account: any) => ({
      externalAccountId: account.id,
      accountName: account.name,
      accountNumber: account.account_number,
      accountType: this.mapAccountType(account.type),
      currency: account.currency,
      balance: parseFloat(account.balance),
      iban: account.iban,
      bic: account.bic,
      status: account.status?.toLowerCase() || 'active',
      metadata: {
        provider_account_type: account.type,
        provider_subtype: account.subtype,
        // Add any other provider-specific data
      },
    }));
  }

  /**
   * TODO: Implement single account fetching
   * Fetch a specific account by ID
   */
  async fetchAccount(
    credentials: ConnectionCredentials,
    accountId: string
  ): Promise<ProviderAccount> {
    // TODO: Replace with actual account endpoint
    const response = await fetch(`https://api.example.com/accounts/${accountId}`, {
      headers: {
        Authorization: `Bearer ${credentials.tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch account: ${response.statusText}`);
    }

    const account = await response.json();

    return {
      externalAccountId: account.id,
      accountName: account.name,
      accountNumber: account.account_number,
      accountType: this.mapAccountType(account.type),
      currency: account.currency,
      balance: parseFloat(account.balance),
      iban: account.iban,
      status: account.status?.toLowerCase() || 'active',
      metadata: {},
    };
  }

  // =====================================================
  // Transaction Management Methods
  // =====================================================

  /**
   * TODO: Implement transaction fetching
   * Fetch transactions for a specific account
   */
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
    // TODO: Build query parameters
    const params = new URLSearchParams({
      account_id: accountId,
      limit: (options?.limit || 100).toString(),
    });

    if (options?.startDate) {
      params.append('from', options.startDate.toISOString());
    }
    if (options?.endDate) {
      params.append('to', options.endDate.toISOString());
    }
    if (options?.offset) {
      params.append('offset', options.offset.toString());
    }

    // TODO: Replace with actual transactions endpoint
    const response = await fetch(
      `https://api.example.com/transactions?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${credentials.tokens.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch transactions: ${response.statusText}`);
    }

    const data = await response.json();

    // TODO: Map provider's transaction format to ProviderTransaction format
    return data.transactions.map((tx: any) => {
      const amount = parseFloat(tx.amount);
      return {
        externalTransactionId: tx.id,
        accountId: accountId,
        date: new Date(tx.date),
        amount: Math.abs(amount),
        currency: tx.currency,
        description: tx.description || tx.merchant_name || 'Transaction',
        type: amount >= 0 ? 'credit' : 'debit',
        counterpartyName: tx.merchant_name || tx.counterparty,
        counterpartyAccount: tx.merchant_account,
        reference: tx.reference,
        category: tx.category,
        metadata: {
          provider_transaction_type: tx.type,
          // Add any other provider-specific data
        },
      };
    });
  }

  // =====================================================
  // User Information Methods
  // =====================================================

  /**
   * TODO: Implement user info fetching
   * Fetch user information from the provider
   */
  async fetchUserInfo(credentials: ConnectionCredentials): Promise<{
    userId: string;
    name: string;
    email?: string;
    metadata?: Record<string, any>;
  }> {
    // TODO: Replace with actual user info endpoint
    const response = await fetch('https://api.example.com/user', {
      headers: {
        Authorization: `Bearer ${credentials.tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.statusText}`);
    }

    const user = await response.json();

    return {
      userId: user.id,
      name: user.name || `${user.first_name} ${user.last_name}`.trim(),
      email: user.email,
      metadata: {
        // Add any provider-specific user data
      },
    };
  }

  // =====================================================
  // Utility Methods
  // =====================================================

  /**
   * TODO: Implement error message extraction
   * Extract user-friendly error messages from provider errors
   */
  getErrorMessage(error: any): string {
    // TODO: Map provider-specific error codes to user-friendly messages
    if (error.code === 'INVALID_TOKEN') {
      return 'Your connection has expired. Please reconnect your account.';
    }

    if (error.code === 'RATE_LIMIT') {
      return 'Too many requests. Please try again in a few minutes.';
    }

    if (error.message) {
      return error.message;
    }

    return 'An unexpected error occurred';
  }

  /**
   * TODO: Implement account type mapping
   * Map provider's account types to Stratifi's standard types
   */
  mapAccountType(providerAccountType: string): string {
    // TODO: Map provider's account types to standard types
    const typeMap: Record<string, string> = {
      checking: 'Checking',
      savings: 'Savings',
      credit: 'Credit Card',
      loan: 'Loan',
      investment: 'Investment',
      // Add more mappings as needed
    };

    return typeMap[providerAccountType.toLowerCase()] || 'Checking';
  }

  /**
   * TODO: Implement amount formatting
   * Convert provider's amount format to number
   */
  formatAmount(amount: string | number): number {
    if (typeof amount === 'number') {
      return amount;
    }

    // Handle different amount formats (e.g., "1,234.56", "1234.56", etc.)
    const cleaned = amount.replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned);
  }

  // =====================================================
  // Optional: Webhook Support
  // =====================================================

  /**
   * TODO (Optional): Implement webhook registration
   * Register a webhook for real-time updates
   */
  async registerWebhook?(
    credentials: ConnectionCredentials,
    webhookUrl: string
  ): Promise<{ webhookId: string; secret?: string }> {
    // TODO: Implement if provider supports webhooks
    throw new Error('Webhooks not implemented for this provider');
  }

  /**
   * TODO (Optional): Implement webhook signature verification
   * Verify webhook signatures for security
   */
  async verifyWebhookSignature?(
    payload: string,
    signature: string,
    secret: string
  ): Promise<boolean> {
    // TODO: Implement if provider supports webhooks
    throw new Error('Webhook verification not implemented for this provider');
  }
}

// TODO: Export singleton instance
// export const yourProvider = new YourProviderName();

