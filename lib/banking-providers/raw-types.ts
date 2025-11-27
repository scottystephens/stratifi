/**
 * Raw Provider Response Types
 *
 * Defines interfaces for raw API data flow in the new banking provider architecture.
 * All provider API responses are stored 100% in JSONB format for auto-detection of new fields.
 */

export interface RawProviderResponse<T = any> {
  /** Provider identifier (plaid, tink, standard_bank_sa, etc.) */
  provider: string;

  /** Connection ID for this sync */
  connectionId: string;

  /** Tenant ID for multi-tenant isolation */
  tenantId: string;

  /** Type of data being returned */
  responseType: 'accounts' | 'transactions' | 'balances';

  /** Complete unmodified API response from provider */
  rawData: T;

  /** When the data was fetched */
  fetchedAt: Date;

  /** API endpoint that was called */
  apiEndpoint: string;

  /** Request parameters sent to provider (for debugging) */
  requestParams?: Record<string, any>;

  /** Metadata about the API response */
  responseMetadata: {
    statusCode: number;
    headers: Record<string, string>;
    duration: number; // milliseconds
  };
}

export interface RawAccountsResponse extends RawProviderResponse {
  responseType: 'accounts';
  accountCount: number;

  /** Raw institution/financial institution data if available */
  institutionData?: any;
}

export interface RawTransactionsResponse extends RawProviderResponse {
  responseType: 'transactions';
  transactionCount: number;

  /** Account ID these transactions belong to (if account-specific fetch) */
  accountId?: string;

  /** Pagination information if applicable */
  pagination?: {
    cursor?: string;
    hasMore: boolean;
    nextPageToken?: string;
  };
}

export interface RawBalancesResponse extends RawProviderResponse {
  responseType: 'balances';
  balanceCount: number;
}

/**
 * Transaction fetch options for providers that support filtering
 */
export interface TransactionFetchOptions {
  /** Start date for transaction fetch (ISO string) */
  startDate?: string;

  /** End date for transaction fetch (ISO string) */
  endDate?: string;

  /** Cursor for pagination (provider-specific) */
  cursor?: string;

  /** Maximum number of transactions to fetch */
  limit?: number;

  /** Account ID to fetch transactions for */
  accountId?: string;

  /**
   * Fetch only records modified after this date (for incremental sync)
   * Xero: Uses If-Modified-Since header
   * Other providers: May use provider-specific parameters
   */
  modifiedSince?: string;
}

/**
 * Connection credentials for provider authentication
 * Must match the base provider ConnectionCredentials interface
 */
export interface ConnectionCredentials {
  connectionId: string;
  tenantId: string;
  tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    tokenType?: string;
    scope?: string[]; // Match base provider interface
  };

  /** Provider-specific configuration */
  config?: Record<string, any>;

  /** Provider-specific metadata (e.g., xeroTenantId, plaidItemId) */
  metadata?: Record<string, any>;
}

/**
 * Sync operation result
 */
export interface SyncResult {
  success: boolean;
  accountsSynced: number;
  transactionsSynced: number;
  errors: string[];
  duration: number;
  provider: string;
  connectionId: string;
}
