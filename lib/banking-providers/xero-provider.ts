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
import { tokenRefreshService } from '@/lib/services/token-refresh-service';
import { xeroLogger } from '@/lib/services/xero-observability-service';

// =====================================================
// Xero API Error Class
// =====================================================

export class XeroApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public errorData?: any,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'XeroApiError';
  }

  isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  isValidationError(): boolean {
    return this.statusCode === 400 && this.errorData?.Type === 'ValidationException';
  }
}

// =====================================================
// Xero API Types
// =====================================================

// Xero API Types
interface XeroConnection {
  id: string;
  tenantId: string;
  tenantType: string;
  tenantName: string;
  createdDateUtc: string;
  updatedDateUtc: string;
}

interface XeroAccount {
  AccountID: string;
  Code: string;
  Name: string;
  Type: string;  // 'BANK', 'CURRENT', 'EXPENSE', etc.
  Class: string;  // 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'
  Status: string;  // 'ACTIVE', 'ARCHIVED', 'DELETED'
  Description?: string;
  TaxType?: string;
  EnablePaymentsToAccount?: boolean;
  ShowInExpenseClaims?: boolean;
  BankAccountNumber?: string;
  BankAccountType?: string;
  CurrencyCode?: string;
  ReportingCode?: string;
  ReportingCodeName?: string;
  HasAttachments?: boolean;
  UpdatedDateUTC?: string;
  AddToWatchlist?: boolean;
}

interface XeroBankTransaction {
  BankTransactionID: string;
  BankAccount: {
    AccountID: string;
    Code?: string;
    Name?: string;
  };
  Type: string;  // 'RECEIVE', 'SPEND', 'RECEIVE-OVERPAYMENT', 'SPEND-OVERPAYMENT', etc.
  Status: string;  // 'AUTHORISED', 'DELETED', 'VOIDED', 'DRAFT', 'SUBMITTED'
  LineAmountTypes?: string;
  LineItems: Array<{
    Description?: string;
    Quantity?: number;
    UnitAmount?: number;
    AccountCode?: string;
    TaxType?: string;
    TaxAmount?: number;
    LineAmount?: number;
    Tracking?: any[];
  }>;
  Contact?: {
    ContactID?: string;
    Name?: string;
  };
  DateString?: string;
  Date?: string;
  Reference?: string;
  CurrencyCode?: string;
  CurrencyRate?: number;
  Url?: string;
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  UpdatedDateUTC?: string;
  IsReconciled?: boolean;
  HasAttachments?: boolean;
}

interface XeroAccountsResponse {
  Accounts: XeroAccount[];
}

interface XeroBankTransactionsResponse {
  BankTransactions: XeroBankTransaction[];
}

// Bank Summary Report Types
interface XeroBankSummaryRow {
  RowType: string;
  Title?: string;
  Cells?: Array<{
    Value: string;
    Attributes?: Array<{
      Value: string;
      Id: string;
    }>;
  }>;
  Rows?: XeroBankSummaryRow[];
}

interface XeroBankSummaryReport {
  ReportID: string;
  ReportName: string;
  ReportType: string;
  ReportTitles: string[];
  ReportDate: string;
  UpdatedDateUTC: string;
  Rows: XeroBankSummaryRow[];
}

interface XeroBankSummaryResponse {
  Reports: XeroBankSummaryReport[];
}

export interface BankAccountBalance {
  accountId: string;
  accountName: string;
  openingBalance: number;
  closingBalance: number;
  currency: string;
}

export class XeroProvider extends BankingProvider {
  config: BankingProviderConfig = {
    providerId: 'xero',
    displayName: 'Xero',
    logo: '/logos/xero.svg',
    color: '#13B5EA',
    description: 'Connect to Xero accounting software to sync bank accounts and transactions.',
    authType: 'oauth',
    supportsSync: true,
    supportedCountries: ['US', 'GB', 'AU', 'NZ', 'CA', 'ZA', 'IE', 'SG', 'HK'],
    website: 'https://www.xero.com',
    integrationType: 'redirect',
  };

  private readonly baseUrl = 'https://api.xero.com';
  private readonly authUrl = 'https://login.xero.com/identity/connect/authorize';
  private readonly tokenUrl = 'https://identity.xero.com/connect/token';
  private readonly connectionsUrl = 'https://api.xero.com/connections';

  // Rate limiting configuration
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 1000;
  private readonly maxDelayMs = 60000;

  // Xero pagination
  private readonly pageSize = 100; // Xero's default/max page size

  validateConfiguration(): boolean {
    return (
      !!process.env.XERO_CLIENT_ID &&
      !!process.env.XERO_CLIENT_SECRET &&
      !!process.env.XERO_REDIRECT_URI
    );
  }

  // =====================================================
  // Token Management
  // =====================================================

  /**
   * Ensure we have a valid access token before making API calls
   * Automatically refreshes if token is expired or about to expire
   */
  private async ensureValidToken(credentials: ConnectionCredentials): Promise<string> {
    // Check if token needs refresh (expires within 5 minutes)
    if (tokenRefreshService.needsRefresh(credentials.tokens.expiresAt)) {
      xeroLogger.info('Token expiring soon, refreshing...');

      if (!credentials.tokens.refreshToken) {
        throw new XeroApiError(
          401,
          'Access token expired and no refresh token available. Please reconnect your Xero account.'
        );
      }

      // Use the token refresh service to get a valid token
      const result = await tokenRefreshService.getValidAccessToken(
        credentials.connectionId,
        'xero',
        (refreshToken) => this.refreshAccessToken(refreshToken)
      );

      if (!result.success || !result.tokens) {
        throw new XeroApiError(
          401,
          result.error || 'Failed to refresh token. Please reconnect your Xero account.'
        );
      }

      // Update credentials with new token
      credentials.tokens.accessToken = result.tokens.accessToken;
      credentials.tokens.expiresAt = result.tokens.expiresAt;
      if (result.tokens.refreshToken) {
        credentials.tokens.refreshToken = result.tokens.refreshToken;
      }

      xeroLogger.info('Token refreshed successfully');
    }

    return credentials.tokens.accessToken;
  }

  // =====================================================
  // Rate-Limited Fetch with Retry
  // =====================================================

  /**
   * Fetch with automatic retry and exponential backoff for rate limiting
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    context: string = 'API call'
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);

        // Handle rate limiting (429)
        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
          const delayMs = Math.min(retryAfterSeconds * 1000, this.maxDelayMs);

          xeroLogger.warn(
            `Rate limited (${context}). Attempt ${attempt + 1}/${this.maxRetries}. ` +
            `Waiting ${delayMs / 1000}s before retry...`
          );

          await this.delay(delayMs);
          continue;
        }

        // Handle other errors
        if (!response.ok) {
          const errorData = await this.parseErrorResponse(response);
          throw new XeroApiError(
            response.status,
            errorData.message,
            errorData.data,
            errorData.retryAfter
          );
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on non-retryable errors
        if (error instanceof XeroApiError && !error.isRateLimited()) {
          throw error;
        }

        // Exponential backoff for other errors
        if (attempt < this.maxRetries - 1) {
          const delayMs = Math.min(
            this.baseDelayMs * Math.pow(2, attempt),
            this.maxDelayMs
          );
          xeroLogger.warn(
            `${context} failed. Attempt ${attempt + 1}/${this.maxRetries}. ` +
            `Retrying in ${delayMs / 1000}s...`
          );
          await this.delay(delayMs);
        }
      }
    }

    throw lastError || new Error(`Xero ${context} failed after ${this.maxRetries} attempts`);
  }

  /**
   * Parse Xero error response into structured format
   */
  private async parseErrorResponse(response: Response): Promise<{
    message: string;
    data?: any;
    retryAfter?: number;
  }> {
    try {
      const data = await response.json();

      // Xero error format: { "Type": "ValidationException", "Message": "...", "Elements": [...] }
      if (data.Message) {
        return {
          message: data.Message,
          data,
          retryAfter: response.headers.get('Retry-After')
            ? parseInt(response.headers.get('Retry-After')!, 10)
            : undefined,
        };
      }

      // OAuth error format: { "error": "...", "error_description": "..." }
      if (data.error_description) {
        return {
          message: data.error_description,
          data,
        };
      }

      return {
        message: `Xero API error: ${response.status} ${response.statusText}`,
        data,
      };
    } catch {
      return {
        message: `Xero API error: ${response.status} ${response.statusText}`,
      };
    }
  }

  /**
   * Delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // =====================================================
  // OAuth Methods
  // =====================================================

  getAuthorizationUrl(state: string, metadata?: Record<string, any>): string {
    const scopes = [
      'offline_access',
      'accounting.transactions.read',
      'accounting.settings.read',
      'accounting.contacts.read',
      'accounting.reports.read',  // Required for Bank Summary (balances)
    ];

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.XERO_CLIENT_ID!,
      redirect_uri: process.env.XERO_REDIRECT_URI!,
      scope: scopes.join(' '),
      state,
    });

    return `${this.authUrl}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<OAuthTokens> {
    try {
      xeroLogger.info('Exchanging authorization code for token...');

      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.XERO_CLIENT_ID!,
        client_secret: process.env.XERO_CLIENT_SECRET!,
        redirect_uri: process.env.XERO_REDIRECT_URI!,
        code,
      });

      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        xeroLogger.error('Token exchange failed', { errorText, status: response.statusText });
        throw new Error(`Xero token exchange failed: ${response.statusText}`);
      }

      const data = await response.json();

      xeroLogger.info('Token exchange successful');

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000)
          : undefined,
        tokenType: data.token_type || 'Bearer',
        scope: data.scope?.split(' '),
      };
    } catch (error) {
      xeroLogger.error('Error exchanging code for token', { error });
      throw new Error(
        `Failed to exchange Xero authorization code: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    try {
      xeroLogger.info('Refreshing access token...');

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.XERO_CLIENT_ID!,
        client_secret: process.env.XERO_CLIENT_SECRET!,
        refresh_token: refreshToken,
      });

      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        xeroLogger.error('Token refresh failed', { errorText, status: response.statusText });
        throw new Error(`Xero token refresh failed: ${response.statusText}`);
      }

      const data = await response.json();

      xeroLogger.info('Token refreshed successfully');

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000)
          : undefined,
        tokenType: data.token_type || 'Bearer',
        scope: data.scope?.split(' '),
      };
    } catch (error) {
      xeroLogger.error('Error refreshing token', { error });
      throw new Error(
        `Failed to refresh Xero token: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  // =====================================================
  // Xero-Specific: Fetch Tenant ID (Organization)
  // =====================================================

  async fetchUserInfo(
    credentials: ConnectionCredentials
  ): Promise<{ userId: string; name: string; email?: string; metadata?: Record<string, any> }> {
    xeroLogger.info('Fetching Xero connections (tenants)...');

    try {
      const response = await this.fetchWithRetry(
        this.connectionsUrl,
        {
          headers: {
            Authorization: `Bearer ${credentials.tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
        'fetch connections'
      );

      const connections: XeroConnection[] = await response.json();

      if (!connections || connections.length === 0) {
        throw new XeroApiError(
          404,
          'No Xero organizations found. Please authorize at least one organization.'
        );
      }

      // Use the first connected organization
      const primaryConnection = connections[0];

      xeroLogger.info('Xero tenant fetched', {
        tenantId: primaryConnection.tenantId,
        tenantName: primaryConnection.tenantName,
        tenantType: primaryConnection.tenantType,
        totalOrganizations: connections.length,
      });

      return {
        userId: primaryConnection.tenantId,
        name: primaryConnection.tenantName,
        metadata: {
          xeroTenantId: primaryConnection.tenantId,
          xeroTenantName: primaryConnection.tenantName,
          xeroTenantType: primaryConnection.tenantType,
          allConnections: connections.map((c) => ({
            id: c.id,
            tenantId: c.tenantId,
            tenantName: c.tenantName,
            tenantType: c.tenantType,
          })),
        },
      };
    } catch (error) {
      xeroLogger.error('Error fetching Xero user info', { error });
      if (error instanceof XeroApiError) {
        throw error;
      }
      throw new XeroApiError(
        500,
        `Failed to fetch Xero tenant information: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  // =====================================================
  // Bank Balance Fetching (via Reports API)
  // =====================================================

  /**
   * Fetch bank account balances using Xero's Bank Summary Report
   * This is the ONLY reliable way to get current balances from Xero
   * 
   * @param credentials - Connection credentials with Xero tenant ID
   * @param date - Date to get balances for (defaults to today)
   * @returns Map of AccountID to balance info
   */
  async fetchBankBalances(
    credentials: ConnectionCredentials,
    date?: Date
  ): Promise<Map<string, BankAccountBalance>> {
    return this.fetchBankBalancesForDate(credentials, date || new Date());
  }

  /**
   * Fetch bank account balances for a specific date
   */
  private async fetchBankBalancesForDate(
    credentials: ConnectionCredentials,
    date: Date
  ): Promise<Map<string, BankAccountBalance>> {
    const xeroTenantId = credentials.metadata?.xeroTenantId;
    if (!xeroTenantId) {
      throw new XeroApiError(400, 'Xero tenant ID not found in credentials metadata');
    }

    const targetDate = date || new Date();
    const dateStr = targetDate.toISOString().split('T')[0];

    xeroLogger.info(`Fetching bank balances for date: ${dateStr}`, { xeroTenantId });

    try {
      const accessToken = await this.ensureValidToken(credentials);

      // Call Bank Summary Report with same fromDate and toDate to get current balances
      const params = new URLSearchParams({
        fromDate: dateStr,
        toDate: dateStr,
      });

      const response = await this.fetchWithRetry(
        `${this.baseUrl}/api.xro/2.0/Reports/BankSummary?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Xero-Tenant-Id': xeroTenantId,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
        'fetch bank summary'
      );

      const data: XeroBankSummaryResponse = await response.json();
      const balances = new Map<string, BankAccountBalance>();

      if (!data.Reports || data.Reports.length === 0) {
        xeroLogger.warn('No Bank Summary report returned from Xero');
        return balances;
      }

      const report = data.Reports[0];
      
      // Log report structure for debugging
      xeroLogger.debug(`Report structure: ${report.Rows?.length || 0} top-level rows`);
      
      // Parse the report structure
      // Bank Summary has sections (Rows with RowType: "Section") containing account rows
      for (const section of report.Rows || []) {
        if (section.RowType === 'Section' && section.Rows) {
          xeroLogger.debug(`Processing section with ${section.Rows.length} rows`);
          for (const row of section.Rows) {
            if (row.RowType === 'Row' && row.Cells) {
              // Row structure: [AccountName, OpeningBalance, CashReceived, CashSpent, ClosingBalance]
              // Each cell may have Attributes with AccountID
              const cells = row.Cells;
              
              if (cells.length >= 5) {
                const accountName = cells[0]?.Value || '';
                const openingBalance = this.parseReportAmount(cells[1]?.Value);
                const closingBalance = this.parseReportAmount(cells[4]?.Value);
                
                // Get AccountID from Attributes - check all cells for account attribute
                let accountId: string | undefined;
                for (const cell of cells) {
                  const accountIdAttr = cell?.Attributes?.find((a: any) => a.Id === 'account');
                  if (accountIdAttr?.Value) {
                    accountId = accountIdAttr.Value;
                    break;
                  }
                }
                
                // Also check if accountName matches a known account pattern
                // Sometimes the AccountID might be in a different attribute
                if (!accountId && accountName) {
                  // Try to find account ID from other attributes
                  for (const cell of cells) {
                    if (cell?.Attributes) {
                      for (const attr of cell.Attributes) {
                        if (attr.Id && attr.Value && attr.Value.length === 36) {
                          // UUID-like value, might be AccountID
                          accountId = attr.Value;
                          break;
                        }
                      }
                    }
                    if (accountId) break;
                  }
                }
                
                if (accountId) {
                  balances.set(accountId, {
                    accountId,
                    accountName,
                    openingBalance,
                    closingBalance,
                    currency: 'USD', // Bank Summary is in base currency
                  });
                  xeroLogger.debug(`Found balance for ${accountName} (${accountId}): ${closingBalance.toFixed(2)}`);
                } else {
                  xeroLogger.warn(`Row found but no AccountID: ${accountName}`, { cellsCount: cells.length });
                  // Log cell structure for debugging
                  xeroLogger.debug('Cell structure', { cells });
                }
              } else {
                xeroLogger.warn(`Row has insufficient cells: ${cells.length} (expected 5+)`);
              }
            } else if (row.RowType === 'Row') {
              xeroLogger.warn('Row found but no Cells array');
            }
          }
        } else {
          xeroLogger.debug(`Skipping row with RowType="${section.RowType}" (not a Section)`);
        }
      }

      xeroLogger.info(`Fetched balances for ${balances.size} bank accounts`);
      
      // Log balance summary for debugging
      if (balances.size === 0) {
        xeroLogger.warn('No balances found in Bank Summary report', { reportStructure: JSON.stringify(report, null, 2).substring(0, 500) });
      } else {
        balances.forEach((balance, accountId) => {
          xeroLogger.debug(`Balance: ${balance.accountName}`, { accountId, closingBalance: balance.closingBalance, openingBalance: balance.openingBalance });
        });
      }

      return balances;
    } catch (error) {
      xeroLogger.error('Error fetching bank balances', { error, dateStr, xeroTenantId });
      if (error instanceof XeroApiError) {
        throw error;
      }
      throw new XeroApiError(
        500,
        `Failed to fetch Xero bank balances: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Fetch historical bank account balances for a date range
   * Strategy:
   * - Weekly balances for the past 2 years (if available)
   * - Daily balances from the 1st of the current month to today
   * 
   * @param credentials - Connection credentials with Xero tenant ID
   * @returns Map of date strings to Maps of AccountID to balance info
   */
  async fetchHistoricalBalances(
    credentials: ConnectionCredentials
  ): Promise<Map<string, Map<string, BankAccountBalance>>> {
    const xeroTenantId = credentials.metadata?.xeroTenantId;
    if (!xeroTenantId) {
      throw new XeroApiError(400, 'Xero tenant ID not found in credentials metadata');
    }

    console.log(`📊 Fetching historical Xero balances (tenant: ${xeroTenantId})...`);

    const historicalBalances = new Map<string, Map<string, BankAccountBalance>>();
    const today = new Date();
    const datesToFetch: Date[] = [];
    
    // 1. Daily balances from the 1st of the current month to today
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    for (let d = new Date(firstOfMonth); d <= today; d.setDate(d.getDate() + 1)) {
      datesToFetch.push(new Date(d));
    }
    
    // 2. Weekly balances for the past 2 years (104 weeks)
    // Start from yesterday to avoid overlap with daily balances
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Go back 2 years (730 days) in weekly increments
    // Use the same day of week as yesterday to maintain consistency
    const dayOfWeek = yesterday.getDay(); // 0 = Sunday, 6 = Saturday
    
    for (let weeksBack = 1; weeksBack <= 104; weeksBack++) {
      const date = new Date(yesterday);
      date.setDate(date.getDate() - (weeksBack * 7));
      
      // Skip if this date is in the current month (already covered by daily)
      if (date >= firstOfMonth) {
        continue;
      }
      
      datesToFetch.push(date);
    }

    // Sort dates reverse chronologically (newest first) to fetch recent data first
    // This ensures that if we hit consecutive failures (e.g. no data before 2024),
    // we still get the recent data before stopping
    datesToFetch.sort((a, b) => b.getTime() - a.getTime());

    const dailyCount = datesToFetch.filter(d => d >= firstOfMonth).length;
    const weeklyCount = datesToFetch.length - dailyCount;
    
    xeroLogger.info(`Fetching balances for ${datesToFetch.length} dates`, {
      dailyCount,
      weeklyCount,
      estimatedApiCalls: datesToFetch.length,
    });

    // Track success/failure for smart error handling
    let successCount = 0;
    let failureCount = 0;
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 10; // Stop if we hit 10 consecutive failures (likely hit data limit)

    // Fetch balances for each date (with rate limiting)
    for (const date of datesToFetch) {
      try {
        const dateStr = date.toISOString().split('T')[0];
        const balances = await this.fetchBankBalancesForDate(credentials, date);
        
        if (balances.size > 0) {
          historicalBalances.set(dateStr, balances);
          successCount++;
          consecutiveFailures = 0; // Reset failure counter on success
          xeroLogger.debug(`Fetched ${balances.size} balances for ${dateStr}`);
        } else {
          xeroLogger.warn(`No balances found for ${dateStr} (account may not exist yet)`);
          consecutiveFailures++;
        }
        
        // Rate limiting: Xero allows 60 requests per minute
        // Add small delay between requests (1 second = 60 requests/minute max)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // If we hit too many consecutive failures, likely reached data availability limit
        if (consecutiveFailures >= maxConsecutiveFailures) {
          xeroLogger.warn(`Stopping historical fetch after ${maxConsecutiveFailures} consecutive failures (likely reached data availability limit)`);
          break;
        }
      } catch (error) {
        failureCount++;
        consecutiveFailures++;
        const dateStr = date.toISOString().split('T')[0];
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        // Check if it's a "no data" error vs a real API error
        if (errorMsg.includes('404') || errorMsg.includes('not found') || errorMsg.includes('No Bank Summary')) {
          xeroLogger.debug(`No data available for ${dateStr} (account may not exist yet)`);
        } else {
          xeroLogger.warn(`Failed to fetch balances for ${dateStr}`, { error: errorMsg });
        }
        
        // Stop if we hit too many consecutive failures
        if (consecutiveFailures >= maxConsecutiveFailures) {
          xeroLogger.warn(`Stopping historical fetch after ${maxConsecutiveFailures} consecutive failures`);
          break;
        }
        
        // Continue with other dates even on error
      }
    }

    xeroLogger.info('Historical balance fetch complete', {
      successCount,
      failureCount,
      totalRecords: historicalBalances.size,
    });
    
    return historicalBalances;
  }

  /**
   * Parse amount from Bank Summary report cell
   * Handles formats like "1,234.56" or "(1,234.56)" for negative
   */
  private parseReportAmount(value: string | undefined): number {
    if (!value) return 0;
    
    // Remove currency symbols and whitespace
    let cleanValue = value.replace(/[$€£¥]/g, '').trim();
    
    // Check if negative (in parentheses)
    const isNegative = cleanValue.startsWith('(') && cleanValue.endsWith(')');
    if (isNegative) {
      cleanValue = cleanValue.slice(1, -1);
    }
    
    // Remove commas and parse
    const amount = parseFloat(cleanValue.replace(/,/g, '')) || 0;
    
    return isNegative ? -amount : amount;
  }

  /**
   * Fetch accounts WITH their current balances
   * Combines Accounts API + Bank Summary Report for complete data
   */
  async fetchAccountsWithBalances(credentials: ConnectionCredentials): Promise<ProviderAccount[]> {
    xeroLogger.info('Fetching Xero accounts with balances...');
    
    // Fetch accounts and balances in parallel
    const [accounts, balances] = await Promise.all([
      this.fetchAccounts(credentials),
      this.fetchBankBalances(credentials).catch(err => {
        xeroLogger.warn('Failed to fetch balances, continuing with zero balances', { error: err.message });
        return new Map<string, BankAccountBalance>();
      }),
    ]);

    // Merge balances into accounts
    const accountsWithBalances = accounts.map(account => {
      const balance = balances.get(account.externalAccountId);
      if (balance) {
        return {
          ...account,
          balance: balance.closingBalance,
          metadata: {
            ...account.metadata,
            openingBalance: balance.openingBalance,
            closingBalance: balance.closingBalance,
            balanceFetchedAt: new Date().toISOString(),
          },
        };
      }
      return account;
    });

    xeroLogger.info(`Fetched ${accountsWithBalances.length} accounts with balances`);
    return accountsWithBalances;
  }

  // =====================================================
  // Account Fetching (Normalized)
  // =====================================================

  async fetchAccounts(credentials: ConnectionCredentials): Promise<ProviderAccount[]> {
    const xeroTenantId = credentials.metadata?.xeroTenantId;
    if (!xeroTenantId) {
      throw new XeroApiError(400, 'Xero tenant ID not found in credentials metadata');
    }

    xeroLogger.info('Fetching Xero accounts...');

    try {
      // Ensure we have a valid token before making API calls
      const accessToken = await this.ensureValidToken(credentials);

      const response = await this.fetchWithRetry(
        `${this.baseUrl}/api.xro/2.0/Accounts`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Xero-Tenant-Id': xeroTenantId,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
        'fetch accounts'
      );

      const data: XeroAccountsResponse = await response.json();

      // Filter to only BANK accounts
      const bankAccounts = data.Accounts.filter(
        (account) => account.Type === 'BANK' && account.Status === 'ACTIVE'
      );

      xeroLogger.info(`Found ${bankAccounts.length} active bank accounts`);

      return bankAccounts.map((account) => ({
        externalAccountId: account.AccountID,
        accountName: account.Name,
        accountNumber: account.BankAccountNumber || undefined,
        accountType: this.mapXeroAccountType(account.Type, account.BankAccountType),
        currency: account.CurrencyCode || 'USD',
        balance: 0, // Xero doesn't provide balances in Accounts API (use Reports API or BankTransactions)
        status: account.Status === 'ACTIVE' ? 'active' : 'inactive',
        institutionName: 'Xero',
        metadata: {
          accountId: account.AccountID,
          code: account.Code,
          name: account.Name,
          type: account.Type,
          class: account.Class,
          description: account.Description,
          taxType: account.TaxType,
          bankAccountType: account.BankAccountType,
          currencyCode: account.CurrencyCode,
          updatedDateUTC: account.UpdatedDateUTC,
          xeroTenantId,
        },
      }));
    } catch (error) {
      xeroLogger.error('Error fetching Xero accounts', { error });
      if (error instanceof XeroApiError) {
        throw error;
      }
      throw new XeroApiError(
        500,
        `Failed to fetch Xero accounts: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // =====================================================
  // Transaction Fetching (Normalized)
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
    const xeroTenantId = credentials.metadata?.xeroTenantId;
    if (!xeroTenantId) {
      throw new XeroApiError(400, 'Xero tenant ID not found in credentials metadata');
    }

    xeroLogger.info(`Fetching Xero transactions for account: ${accountId}`);

    try {
      // Ensure we have a valid token before making API calls
      const accessToken = await this.ensureValidToken(credentials);

      // Build base query with account filter
      const whereConditions: string[] = [`BankAccount.AccountID=Guid("${accountId}")`];

      if (options?.startDate) {
        const startDate = options.startDate.toISOString().split('T')[0];
        whereConditions.push(`Date>=DateTime(${startDate})`);
      }

      if (options?.endDate) {
        const endDate = options.endDate.toISOString().split('T')[0];
        whereConditions.push(`Date<=DateTime(${endDate})`);
      }

      const whereClause = whereConditions.join(' AND ');

      // Paginate through all results
      const allTransactions: XeroBankTransaction[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const params = new URLSearchParams();
        params.append('where', whereClause);
        params.append('page', page.toString());

        // Re-check token validity on each page (for long-running syncs)
        const currentToken = page > 1 ? await this.ensureValidToken(credentials) : accessToken;

        const response = await this.fetchWithRetry(
          `${this.baseUrl}/api.xro/2.0/BankTransactions?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${currentToken}`,
              'Xero-Tenant-Id': xeroTenantId,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
          },
          `fetch transactions page ${page}`
        );

        const pageData: XeroBankTransactionsResponse = await response.json();
        allTransactions.push(...pageData.BankTransactions);

        hasMore = pageData.BankTransactions.length === this.pageSize;
        page++;

        if (page > 1000) {
          xeroLogger.warn('Xero pagination safety limit reached');
          break;
        }
      }

      xeroLogger.info(`Fetched ${allTransactions.length} transactions`);

      return allTransactions
        .filter((tx) => tx.Status === 'AUTHORISED' || tx.Status === 'SUBMITTED')
        .map((transaction) => this.mapTransaction(transaction, xeroTenantId));
    } catch (error) {
      xeroLogger.error('Error fetching Xero transactions', { error, accountId });
      if (error instanceof XeroApiError) {
        throw error;
      }
      throw new XeroApiError(
        500,
        `Failed to fetch Xero transactions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // =====================================================
  // Raw Data Methods (for JSONB storage)
  // =====================================================

  async fetchRawAccounts(credentials: ConnectionCredentials): Promise<RawAccountsResponse> {
    const startTime = Date.now();

    const xeroTenantId = credentials.metadata?.xeroTenantId;
    if (!xeroTenantId) {
      throw new XeroApiError(400, 'Xero tenant ID not found in credentials metadata');
    }

    xeroLogger.info(`Fetching Xero accounts with balances`, { xeroTenantId });

    try {
      // Ensure we have a valid token before making API calls
      const accessToken = await this.ensureValidToken(credentials);

      // Fetch accounts and current balances in parallel for better performance
      // NOTE: Historical balances are fetched AFTER initial sync completes (non-blocking)
      // to avoid hanging the OAuth callback with 2-3 minutes of API calls
      const [accountsResponse, currentBalances] = await Promise.all([
        this.fetchWithRetry(
          `${this.baseUrl}/api.xro/2.0/Accounts`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Xero-Tenant-Id': xeroTenantId,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
          },
          'fetch accounts'
        ),
        this.fetchBankBalances(credentials).catch(err => {
          xeroLogger.warn('Failed to fetch current balances, continuing without', { error: err.message });
          return new Map<string, BankAccountBalance>();
        }),
      ]);
      
      // Historical balances will be fetched in background after accounts are stored
      const historicalBalances = new Map<string, Map<string, BankAccountBalance>>();

      const rawData = await accountsResponse.json();
      const accountCount = rawData.Accounts?.length || 0;

      // Enrich accounts with balance data
      const balanceMap: Record<string, BankAccountBalance> = {};
      currentBalances.forEach((balance, accountId) => {
        balanceMap[accountId] = balance;
      });

      xeroLogger.info(`Fetched ${accountCount} Xero accounts with ${currentBalances.size} current balances`);
      xeroLogger.info('Historical balances will be fetched in background after accounts are stored');

      return {
        provider: 'xero',
        connectionId: credentials.connectionId,
        tenantId: credentials.tenantId,
        responseType: 'accounts',
        rawData,
        accountCount,
        fetchedAt: new Date(),
        apiEndpoint: '/api.xro/2.0/Accounts',
        // Include xeroTenantId and balances for storage service
        requestParams: {
          xeroTenantId,
          balances: balanceMap, // Current balances only
        },
        responseMetadata: {
          statusCode: accountsResponse.status,
          headers: {},
          duration: Date.now() - startTime,
        },
      };
    } catch (error) {
      xeroLogger.error('Error fetching raw Xero accounts', { error });
      if (error instanceof XeroApiError) {
        throw error;
      }
      throw new XeroApiError(
        500,
        `Failed to fetch Xero accounts: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async fetchRawTransactions(
    credentials: ConnectionCredentials,
    accountId: string,
    options?: TransactionFetchOptions
  ): Promise<RawTransactionsResponse> {
    const startTime = Date.now();

    const xeroTenantId = credentials.metadata?.xeroTenantId;
    if (!xeroTenantId) {
      throw new XeroApiError(400, 'Xero tenant ID not found in credentials metadata');
    }

    // Log if this is an incremental sync
    const isIncremental = !!options?.modifiedSince;
    xeroLogger.info(
      `Fetching Xero transactions for account ${accountId}`,
      {
        xeroTenantId,
        isIncremental,
        modifiedSince: options?.modifiedSince,
      }
    );

    try {
      // Ensure we have a valid token before making API calls
      const accessToken = await this.ensureValidToken(credentials);

      // Build base query with account filter
      const whereConditions: string[] = [`BankAccount.AccountID=Guid("${accountId}")`];

      // Add date filters if provided
      if (options?.startDate) {
        const startDate = new Date(options.startDate).toISOString().split('T')[0];
        whereConditions.push(`Date>=DateTime(${startDate})`);
      }

      if (options?.endDate) {
        const endDate = new Date(options.endDate).toISOString().split('T')[0];
        whereConditions.push(`Date<=DateTime(${endDate})`);
      }

      // Combine where conditions with AND
      const whereClause = whereConditions.join(' AND ');

      // Build headers - add If-Modified-Since for incremental sync
      const buildHeaders = (token: string): Record<string, string> => {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          'Xero-Tenant-Id': xeroTenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        };

        // Xero supports If-Modified-Since header for incremental sync
        // This returns only transactions modified after the specified date
        if (options?.modifiedSince) {
          headers['If-Modified-Since'] = new Date(options.modifiedSince).toUTCString();
        }

        return headers;
      };

      // Paginate through all results
      const allTransactions: any[] = [];
      let page = 1;
      let hasMore = true;
      let totalPages = 0;

      while (hasMore) {
        const params = new URLSearchParams();
        params.append('where', whereClause);
        params.append('page', page.toString());

        // Re-check token validity on each page (for long-running syncs)
        const currentToken = page > 1 ? await this.ensureValidToken(credentials) : accessToken;

        const response = await this.fetchWithRetry(
          `${this.baseUrl}/api.xro/2.0/BankTransactions?${params.toString()}`,
          {
            headers: buildHeaders(currentToken),
          },
          `fetch transactions page ${page}`
        );

        const pageData = await response.json();
        const pageTransactions = pageData.BankTransactions || [];

        allTransactions.push(...pageTransactions);
        totalPages = page;

        // Xero returns up to 100 items per page
        // If we get less than 100, we've reached the last page
        hasMore = pageTransactions.length === this.pageSize;
        page++;

        // Safety limit to prevent infinite loops
        if (page > 1000) {
          xeroLogger.warn('Xero pagination safety limit reached (1000 pages)');
          break;
        }
      }

      xeroLogger.info(
        `Fetched ${allTransactions.length} Xero transactions across ${totalPages} page(s)`,
        { isIncremental }
      );

      return {
        provider: 'xero',
        connectionId: credentials.connectionId,
        tenantId: credentials.tenantId,
        accountId,
        responseType: 'transactions',
        rawData: { BankTransactions: allTransactions },
        transactionCount: allTransactions.length,
        fetchedAt: new Date(),
        apiEndpoint: '/api.xro/2.0/BankTransactions',
        // Include xeroTenantId for storage service
        requestParams: {
          xeroTenantId,
          accountId,
          startDate: options?.startDate,
          endDate: options?.endDate,
          modifiedSince: options?.modifiedSince, // Track if this was an incremental sync
          isIncrementalSync: isIncremental,
        },
        responseMetadata: {
          statusCode: 200,
          headers: {},
          duration: Date.now() - startTime,
        },
        // Store pagination info in requestParams for reference
        pagination: {
          hasMore: false,
        },
      };
    } catch (error) {
      xeroLogger.error('Error fetching raw Xero transactions', { error, accountId });
      if (error instanceof XeroApiError) {
        throw error;
      }
      throw new XeroApiError(
        500,
        `Failed to fetch Xero transactions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // =====================================================
  // Abstract Method Implementations
  // =====================================================

  /**
   * Fetch a specific account by ID
   */
  async fetchAccount(
    credentials: ConnectionCredentials,
    accountId: string
  ): Promise<ProviderAccount> {
    const accounts = await this.fetchAccounts(credentials);
    const account = accounts.find((a) => a.externalAccountId === accountId);
    
    if (!account) {
      throw new XeroApiError(404, `Account ${accountId} not found`);
    }
    
    return account;
  }

  /**
   * Map Xero account type to Stratiri standard type
   */
  mapAccountType(providerAccountType: string): string {
    const typeMap: Record<string, string> = {
      'BANK': 'checking',
      'CREDITCARD': 'credit_card',
      'SAVINGS': 'savings',
      'CURRENT': 'checking',
      'FIXED': 'savings',
      'LOAN': 'loan',
    };
    return typeMap[providerAccountType] || 'other';
  }

  /**
   * Get human-readable error message from Xero error
   */
  getErrorMessage(error: any): string {
    if (error instanceof XeroApiError) {
      return error.message;
    }
    if (error?.Message) {
      return error.Message;
    }
    if (error?.error_description) {
      return error.error_description;
    }
    return error?.message || 'Unknown Xero error';
  }

  /**
   * Format amount from Xero (already numeric)
   */
  formatAmount(amount: string | number): number {
    if (typeof amount === 'number') {
      return amount;
    }
    return parseFloat(amount) || 0;
  }

  // =====================================================
  // Helper Methods
  // =====================================================

  /**
   * Map Xero account type with bank account subtype
   */
  private mapXeroAccountType(xeroType: string, bankAccountType?: string): string {
    // Map Xero account types to Stratiri standard types
    if (xeroType === 'BANK') {
      if (bankAccountType === 'CREDITCARD') {
        return 'Credit Card';
      }
      if (bankAccountType === 'SAVINGS') {
        return 'Savings';
      }
      return 'Checking'; // Default for BANK type
    }

    return 'Other';
  }

  private mapTransaction(
    transaction: XeroBankTransaction,
    xeroTenantId: string
  ): ProviderTransaction {
    // Determine transaction type (Credit/Debit)
    const isCredit = transaction.Type === 'RECEIVE' || transaction.Type === 'RECEIVE-OVERPAYMENT';
    const amount = Math.abs(transaction.Total || 0);

    // Get description from line items if available
    const description =
      transaction.Reference ||
      transaction.LineItems?.[0]?.Description ||
      transaction.Contact?.Name ||
      'Xero Transaction';

    // Parse date - Xero returns dates in format "/Date(1234567890000)/" or ISO string
    const dateValue = transaction.Date || transaction.DateString;
    let parsedDate: Date;
    if (dateValue) {
      // Handle Xero's /Date(timestamp)/ format
      const timestampMatch = dateValue.match(/\/Date\((\d+)\)\//);
      if (timestampMatch) {
        parsedDate = new Date(parseInt(timestampMatch[1], 10));
      } else {
        parsedDate = new Date(dateValue);
      }
    } else {
      parsedDate = new Date();
    }

    return {
      externalTransactionId: transaction.BankTransactionID,
      accountId: transaction.BankAccount?.AccountID || '',
      date: parsedDate,
      description,
      amount: isCredit ? amount : -amount,
      currency: transaction.CurrencyCode || 'USD',
      type: isCredit ? 'credit' : 'debit',
      counterpartyName: transaction.Contact?.Name || undefined,
      reference: transaction.Reference || undefined,
      category: transaction.LineItems?.[0]?.AccountCode || undefined,
      metadata: {
        bankTransactionId: transaction.BankTransactionID,
        xeroTenantId,
        type: transaction.Type,
        status: transaction.Status,
        subTotal: transaction.SubTotal,
        totalTax: transaction.TotalTax,
        total: transaction.Total,
        isReconciled: transaction.IsReconciled,
        contact: transaction.Contact,
        lineItems: transaction.LineItems,
        updatedDateUTC: transaction.UpdatedDateUTC,
      },
    };
  }

  async testConnection(credentials: ConnectionCredentials): Promise<boolean> {
    xeroLogger.info('Testing Xero connection...');

    const xeroTenantId = credentials.metadata?.xeroTenantId;
    if (!xeroTenantId) {
      xeroLogger.error('Xero tenant ID not found');
      return false;
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.baseUrl}/api.xro/2.0/Organisation`,
        {
          headers: {
            Authorization: `Bearer ${credentials.tokens.accessToken}`,
            'Xero-Tenant-Id': xeroTenantId,
            Accept: 'application/json',
          },
        },
        'test connection'
      );

      const data = await response.json();
      xeroLogger.info('Xero connection test successful', {
        organizationName: data.Organisations?.[0]?.Name,
        organizationId: data.Organisations?.[0]?.OrganisationID,
      });
      return true;
    } catch (error) {
      xeroLogger.error('Xero connection test failed', { error });
      return false;
    }
  }
}

// Export singleton instance
export const xeroProvider = new XeroProvider();

