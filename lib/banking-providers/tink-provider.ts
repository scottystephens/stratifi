// Tink Banking Provider Implementation
// Implements the BankingProvider interface for Tink

import {
  BankingProvider,
  BankingProviderConfig,
  OAuthTokens,
  ProviderAccount,
  ProviderTransaction,
  ConnectionCredentials,
} from './base-provider';
import * as TinkClient from '../tink-client';

export class TinkProvider extends BankingProvider {
  config: BankingProviderConfig = {
    providerId: 'tink',
    displayName: 'Tink',
    logo: '/logos/tink.svg',
    color: '#00A8FF',
    description: 'Connect your bank accounts through Tink (3,500+ European banks)',
    authType: 'oauth',
    supportsSync: true,
    supportedCountries: [
      'NL', 'GB', 'DE', 'FR', 'ES', 'IT', 'SE', 'NO', 'DK', 'FI',
      'AT', 'BE', 'CH', 'IE', 'PT', 'PL', 'CZ', 'GR', 'RO', 'HU'
    ],
    website: 'https://www.tink.com',
    documentationUrl: 'https://docs.tink.com',
  };

  validateConfiguration(): boolean {
    return TinkClient.validateTinkConfig();
  }

  // =====================================================
  // OAuth Methods
  // =====================================================

  getAuthorizationUrl(state: string, metadata?: Record<string, any>): string {
    const market = metadata?.market || 'NL'; // Default to Netherlands
    return TinkClient.getTinkAuthorizationUrl(state, market);
  }

  async exchangeCodeForToken(code: string): Promise<OAuthTokens> {
    const tokens = await TinkClient.exchangeCodeForToken(code);
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: TinkClient.calculateExpirationDate(tokens.expires_in),
      tokenType: tokens.token_type,
      scope: tokens.scope ? tokens.scope.split(' ') : undefined,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const tokens = await TinkClient.refreshAccessToken(refreshToken);
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: TinkClient.calculateExpirationDate(tokens.expires_in),
      tokenType: tokens.token_type,
    };
  }

  // =====================================================
  // Account Methods
  // =====================================================

  async fetchAccounts(credentials: ConnectionCredentials): Promise<ProviderAccount[]> {
    const tinkAccounts = await TinkClient.getAccounts(credentials.tokens.accessToken);

    // Map Tink accounts to provider accounts
    return tinkAccounts.map((account) => ({
      externalAccountId: account.id,
      accountName: account.name || account.accountNumber || `Account ${account.id}`,
      accountNumber: account.accountNumber || account.identifiers?.accountNumber || account.id,
      accountType: this.mapAccountType(account.type),
      currency: account.balance?.currency || account.currencyDenominatedBalance?.currencyCode || 'EUR',
      balance: account.balance 
        ? (typeof account.balance === 'object' && 'amount' in account.balance
          ? TinkClient.formatTinkAmount(account.balance.amount as any)
          : (account.balance as any))
        : (account.currencyDenominatedBalance?.amount || 0),
      iban: account.identifiers?.iban,
      bic: account.identifiers?.bban, // Tink doesn't always provide BIC
      status: account.closed ? 'closed' : 'active' as 'active' | 'inactive' | 'closed',
      metadata: {
        tink_account_type: account.type,
        financial_institution_id: account.financialInstitutionId,
        holder_name: account.holderName,
        flags: account.flags,
        refreshed: account.refreshed,
        created: account.created,
      },
    }));
  }

  async fetchAccount(
    credentials: ConnectionCredentials,
    accountId: string
  ): Promise<ProviderAccount> {
    const account = await TinkClient.getAccount(credentials.tokens.accessToken, accountId);

    return {
      externalAccountId: account.id,
      accountName: account.name || account.accountNumber || `Account ${account.id}`,
      accountNumber: account.accountNumber || account.identifiers?.accountNumber || account.id,
      accountType: this.mapAccountType(account.type),
      currency: account.balance?.currency || account.currencyDenominatedBalance?.currencyCode || 'EUR',
      balance: account.balance 
        ? (typeof account.balance === 'object' && 'amount' in account.balance
          ? TinkClient.formatTinkAmount(account.balance.amount as any)
          : (account.balance as any))
        : (account.currencyDenominatedBalance?.amount || 0),
      iban: account.identifiers?.iban,
      bic: account.identifiers?.bban,
      status: account.closed ? 'closed' : 'active' as 'active' | 'inactive' | 'closed',
      metadata: {
        tink_account_type: account.type,
        financial_institution_id: account.financialInstitutionId,
        holder_name: account.holderName,
      },
    };
  }

  // =====================================================
  // Transaction Methods
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
    const transactions = await TinkClient.getTransactions(
      credentials.tokens.accessToken,
      accountId,
      {
        startDate: options?.startDate,
        endDate: options?.endDate,
        limit: options?.limit,
      }
    );

    // Map Tink transactions to provider transactions
    return transactions.map((txn): ProviderTransaction => {
      const amount = TinkClient.formatTinkAmount(txn.amount.value);
      const bookedDate = txn.dates?.booked ? new Date(txn.dates.booked) : new Date();
      
      return {
        externalTransactionId: txn.id,
        accountId: accountId,
        date: bookedDate,
        amount: Math.abs(amount),
        currency: txn.amount.currencyCode,
        description: txn.descriptions?.display || txn.descriptions?.original || txn.merchantName || 'Transaction',
        type: amount >= 0 ? 'credit' : 'debit',
        counterpartyName: txn.merchantName,
        counterpartyAccount: undefined, // Tink doesn't always provide this
        reference: txn.reference,
        category: txn.categories?.pfm?.name,
        metadata: {
          tink_transaction_id: txn.id,
          booking_status: txn.bookingStatus,
          original_date: txn.originalDate,
          value_date: txn.dates?.value,
          transaction_type: txn.types?.type,
          transaction_code: txn.types?.code,
          notes: txn.notes,
        },
      };
    });
  }

  // =====================================================
  // User Information
  // =====================================================

  async fetchUserInfo(credentials: ConnectionCredentials): Promise<{
    userId: string;
    name: string;
    email?: string;
    metadata?: Record<string, any>;
  }> {
    const userInfo = await TinkClient.getUserInfo(credentials.tokens.accessToken);

    return {
      userId: userInfo.userId,
      name: userInfo.userId, // Tink doesn't provide name directly
      metadata: {
        market: userInfo.market,
        locale: userInfo.locale,
        timeZone: userInfo.timeZone,
      },
    };
  }

  // =====================================================
  // Utility Methods
  // =====================================================

  getErrorMessage(error: any): string {
    if (error.error_description) {
      return error.error_description;
    }
    if (error.message) {
      return error.message;
    }
    return 'An unknown error occurred with Tink API';
  }

  mapAccountType(tinkAccountType: string): string {
    // Map Tink account types to standard types
    const typeMap: Record<string, string> = {
      'CHECKING': 'checking',
      'SAVINGS': 'savings',
      'CREDIT_CARD': 'credit_card',
      'LOAN': 'loan',
      'INVESTMENT': 'investment',
      'MORTGAGE': 'loan',
      'PENSION': 'investment',
    };
    
    return typeMap[tinkAccountType.toUpperCase()] || 'checking';
  }

  formatAmount(amount: string | number): number {
    if (typeof amount === 'number') {
      return amount;
    }
    return parseFloat(amount);
  }
}

// Export singleton instance
export const tinkProvider = new TinkProvider();

