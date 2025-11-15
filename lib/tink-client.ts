// Tink API Client for Banking Aggregation
// Documentation: https://docs.tink.com

// =====================================================
// Types and Interfaces
// =====================================================

export interface TinkOAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  token_type: string;
  scope?: string;
}

export interface TinkAccount {
  id: string;
  name: string;
  type: string;
  accountNumber?: string;
  balance?: {
    amount: number;
    currency: string;
  };
  identifiers?: {
    iban?: string;
    bban?: string;
    accountNumber?: string;
  };
  holderName?: string;
  closed?: boolean;
  flags?: string[];
  accountExclusion?: string;
  currencyDenominatedBalance?: {
    amount: number;
    currencyCode: string;
  };
  refreshed?: number; // timestamp
  financialInstitutionId?: string;
  created?: number; // timestamp
}

export interface TinkTransaction {
  id: string;
  accountId: string;
  amount: {
    value: {
      unscaledValue: number;
      scale: number;
    };
    currencyCode: string;
  };
  dates: {
    booked?: string; // ISO date
    value?: string; // ISO date
  };
  descriptions?: {
    original?: string;
    display?: string;
  };
  categories?: {
    pfm?: {
      id: string;
      name: string;
    };
  };
  types?: {
    type?: string;
    code?: string;
  };
  merchantName?: string;
  notes?: string;
  reference?: string;
  bookingStatus?: string;
  originalDate?: string;
}

export interface TinkUser {
  userId: string;
  market: string;
  locale: string;
  timeZone?: string;
}

// =====================================================
// Tink Client Configuration
// =====================================================

const TINK_CONFIG = {
  clientId: process.env.TINK_CLIENT_ID!,
  clientSecret: process.env.TINK_CLIENT_SECRET!,
  // Trim whitespace and newlines from redirect URI to prevent mismatches
  redirectUri: process.env.TINK_REDIRECT_URI?.trim() || '',
  
  // API URLs
  apiBaseUrl: process.env.TINK_API_BASE_URL || 'https://api.tink.com',
  authorizeUrl: process.env.TINK_OAUTH_AUTHORIZE_URL || 'https://link.tink.com/1.0/authorize',
  tokenUrl: process.env.TINK_OAUTH_TOKEN_URL || 'https://api.tink.com/api/v1/oauth/token',
};

// Validate configuration
export function validateTinkConfig(): boolean {
  const required = ['clientId', 'clientSecret', 'redirectUri'];
  const missing = required.filter(key => !TINK_CONFIG[key as keyof typeof TINK_CONFIG]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing Tink configuration: ${missing.join(', ')}`);
    return false;
  }
  
  return true;
}

// =====================================================
// OAuth Functions
// =====================================================

/**
 * Generate OAuth authorization URL for user to grant access
 */
export function getTinkAuthorizationUrl(state: string, market: string = 'NL'): string {
  if (!validateTinkConfig()) {
    throw new Error('Tink configuration is incomplete');
  }
  
  // Log redirect URI for debugging
  console.log('🔗 Tink OAuth Configuration:');
  console.log('   Redirect URI:', TINK_CONFIG.redirectUri);
  console.log('   Redirect URI length:', TINK_CONFIG.redirectUri.length);
  console.log('   Client ID:', TINK_CONFIG.clientId);
  
  const params = new URLSearchParams({
    client_id: TINK_CONFIG.clientId,
    redirect_uri: TINK_CONFIG.redirectUri,
    response_type: 'code',
    scope: 'accounts:read,transactions:read',
    state: state,
    market: market,
    prompt: 'login', // Force login screen every time (don't use cached sessions)
  });
  
  const authUrl = `${TINK_CONFIG.authorizeUrl}?${params.toString()}`;
  console.log('   Authorization URL:', authUrl.substring(0, 200) + '...');
  
  return authUrl;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string
): Promise<TinkOAuthTokenResponse> {
  if (!validateTinkConfig()) {
    throw new Error('Tink configuration is incomplete');
  }
  
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: TINK_CONFIG.redirectUri,
    client_id: TINK_CONFIG.clientId,
    client_secret: TINK_CONFIG.clientSecret,
  });
  
  try {
    const response = await fetch(TINK_CONFIG.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error_description: errorText };
      }
      throw new Error(
        `Tink token exchange failed: ${error.error_description || error.error || response.statusText}`
      );
    }
    
    const data: TinkOAuthTokenResponse = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Error exchanging Tink authorization code:', error);
    throw error;
  }
}

/**
 * Refresh an expired access token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<TinkOAuthTokenResponse> {
  if (!validateTinkConfig()) {
    throw new Error('Tink configuration is incomplete');
  }
  
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: TINK_CONFIG.clientId,
    client_secret: TINK_CONFIG.clientSecret,
  });
  
  try {
    const response = await fetch(TINK_CONFIG.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tink token refresh failed: ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('❌ Error refreshing Tink access token:', error);
    throw error;
  }
}

/**
 * Calculate expiration date from expires_in (seconds)
 */
export function calculateExpirationDate(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}

// =====================================================
// API Request Functions
// =====================================================

/**
 * Make an authenticated API request to Tink
 */
async function tinkApiRequest<T>(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${TINK_CONFIG.apiBaseUrl}${endpoint}`;
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { message: errorText };
      }
      
      // Properly stringify error object for better error messages
      const errorMessage = error.error_description || error.error || error.message || JSON.stringify(error) || response.statusText;
      console.error(`❌ Tink API Error (${response.status}):`, {
        url,
        status: response.status,
        statusText: response.statusText,
        error: errorMessage,
        fullError: error,
      });
      
      throw new Error(`Tink API error: ${errorMessage}`);
    }
    
    const data = await response.json();
    return data as T;
  } catch (error) {
    console.error(`Tink API request failed for ${endpoint}:`, error);
    throw error;
  }
}

// =====================================================
// Account Functions
// =====================================================

/**
 * Get all accounts for a user
 */
export async function getAccounts(accessToken: string): Promise<TinkAccount[]> {
  const response = await tinkApiRequest<{ accounts: TinkAccount[] }>(
    '/api/v1/accounts/list',
    accessToken,
    { method: 'GET' }
  );
  
  // Tink returns accounts directly or wrapped in accounts array
  if (Array.isArray(response)) {
    return response;
  }
  return response.accounts || [];
}

/**
 * Get a specific account
 */
export async function getAccount(
  accessToken: string,
  accountId: string
): Promise<TinkAccount> {
  const response = await tinkApiRequest<{ account: TinkAccount }>(
    `/api/v1/accounts/${accountId}`,
    accessToken,
    { method: 'GET' }
  );
  
  return response.account;
}

/**
 * Format Tink amount to number
 * Handles both unscaledValue/scale format and direct number
 */
export function formatTinkAmount(amount: { unscaledValue: number; scale: number } | number): number {
  if (typeof amount === 'number') {
    return amount;
  }
  return amount.unscaledValue / Math.pow(10, amount.scale);
}

// =====================================================
// Transaction Functions
// =====================================================

/**
 * Get transactions for an account
 */
export async function getTransactions(
  accessToken: string,
  accountId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }
): Promise<TinkTransaction[]> {
  const params = new URLSearchParams();
  
  if (options?.startDate) {
    params.append('startDate', options.startDate.toISOString());
  }
  if (options?.endDate) {
    params.append('endDate', options.endDate.toISOString());
  }
  if (options?.limit) {
    params.append('max', options.limit.toString());
  }
  
  const queryString = params.toString();
  const endpoint = `/api/v1/transactions/${accountId}${queryString ? `?${queryString}` : ''}`;
  
  const response = await tinkApiRequest<{ transactions: TinkTransaction[] }>(
    endpoint,
    accessToken,
    { method: 'GET' }
  );
  
  return response.transactions || [];
}

/**
 * Get all transactions across all accounts
 */
export async function getAllTransactions(
  accessToken: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }
): Promise<TinkTransaction[]> {
  const params = new URLSearchParams();
  
  if (options?.startDate) {
    params.append('startDate', options.startDate.toISOString());
  }
  if (options?.endDate) {
    params.append('endDate', options.endDate.toISOString());
  }
  if (options?.limit) {
    params.append('max', options.limit.toString());
  }
  
  const queryString = params.toString();
  const endpoint = `/api/v1/transactions${queryString ? `?${queryString}` : ''}`;
  
  const response = await tinkApiRequest<{ transactions: TinkTransaction[] }>(
    endpoint,
    accessToken,
    { method: 'GET' }
  );
  
  return response.transactions || [];
}

// =====================================================
// User Functions
// =====================================================

/**
 * Get user information
 */
export async function getUserInfo(accessToken: string): Promise<TinkUser> {
  const response = await tinkApiRequest<{ user: TinkUser }>(
    '/api/v1/user',
    accessToken,
    { method: 'GET' }
  );
  
  return response.user;
}

