// Bunq API Client for OAuth and banking operations
// Documentation: https://doc.bunq.com

import crypto from 'crypto';

// =====================================================
// Types and Interfaces
// =====================================================

export interface BunqOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
  refresh_token?: string;
  scope?: string;
}

export interface BunqUserInfo {
  id: number;
  created: string;
  updated: string;
  public_uuid: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  legal_name?: string;
  display_name?: string;
  public_nick_name?: string;
  alias?: BunqAlias[];
  avatar?: BunqAvatar;
  status: string;
  sub_status: string;
}

export interface BunqAlias {
  type: string; // 'EMAIL', 'PHONE_NUMBER', 'IBAN'
  value: string;
  name?: string;
}

export interface BunqAvatar {
  uuid: string;
  image: Array<{
    attachment_public_uuid: string;
    content_type: string;
    height: number;
    width: number;
  }>;
}

export interface BunqMonetaryAccount {
  id: number;
  created: string;
  updated: string;
  avatar?: BunqAvatar;
  currency: string;
  description: string;
  daily_limit?: {
    value: string;
    currency: string;
  };
  balance: {
    value: string;
    currency: string;
  };
  alias: BunqAlias[];
  public_uuid: string;
  status: string;
  sub_status: string;
  reason?: string;
  reason_description?: string;
  user_id: number;
  monetary_account_profile?: any;
  setting?: any;
}

export interface BunqPayment {
  id: number;
  created: string;
  updated: string;
  monetary_account_id: number;
  amount: {
    value: string;
    currency: string;
  };
  description: string;
  type: string; // 'IDEAL', 'BUNQ', 'MASTERCARD', etc.
  merchant_reference?: string;
  alias: BunqAlias;
  counterparty_alias: BunqAlias;
  attachment?: any[];
  geolocation?: any;
  batch_id?: number;
  scheduled_id?: number;
  address_shipping?: any;
  address_billing?: any;
  balance_after_mutation: {
    value: string;
    currency: string;
  };
}

export interface BunqAPIError {
  error_description: string;
  error_description_translated: string;
}

// =====================================================
// Bunq Client Configuration
// =====================================================

const BUNQ_CONFIG = {
  clientId: process.env.BUNQ_CLIENT_ID!,
  clientSecret: process.env.BUNQ_CLIENT_SECRET!,
  redirectUri: process.env.BUNQ_REDIRECT_URI!,
  environment: process.env.BUNQ_ENVIRONMENT || 'sandbox',
  
  // OAuth URLs
  authorizeUrl: process.env.BUNQ_OAUTH_AUTHORIZE_URL || 'https://oauth.bunq.com/auth',
  tokenUrl: process.env.BUNQ_OAUTH_TOKEN_URL || 'https://api.oauth.bunq.com/v1/token',
  
  // API Base URL
  apiBaseUrl: process.env.BUNQ_API_BASE_URL || 'https://api.bunq.com/v1',
};

// Validate configuration
export function validateBunqConfig(): boolean {
  const required = ['clientId', 'clientSecret', 'redirectUri'];
  const missing = required.filter(key => !BUNQ_CONFIG[key as keyof typeof BUNQ_CONFIG]);
  
  console.log('🔍 Bunq Config Check:', {
    clientId: BUNQ_CONFIG.clientId ? '✓ Set' : '✗ Missing',
    clientSecret: BUNQ_CONFIG.clientSecret ? '✓ Set' : '✗ Missing',
    redirectUri: BUNQ_CONFIG.redirectUri ? '✓ Set' : '✗ Missing',
    environment: BUNQ_CONFIG.environment,
  });
  
  if (missing.length > 0) {
    console.error(`❌ Missing Bunq configuration: ${missing.join(', ')}`);
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
export function getBunqAuthorizationUrl(state: string): string {
  console.log('🔗 getBunqAuthorizationUrl called with state:', state);
  
  if (!validateBunqConfig()) {
    const missingVars = [];
    if (!process.env.BUNQ_CLIENT_ID) missingVars.push('BUNQ_CLIENT_ID');
    if (!process.env.BUNQ_CLIENT_SECRET) missingVars.push('BUNQ_CLIENT_SECRET');
    if (!process.env.BUNQ_REDIRECT_URI) missingVars.push('BUNQ_REDIRECT_URI');
    
    throw new Error(`Bunq configuration is incomplete. Missing: ${missingVars.join(', ')}`);
  }
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: BUNQ_CONFIG.clientId,
    redirect_uri: BUNQ_CONFIG.redirectUri,
    state: state,
  });
  
  const url = `${BUNQ_CONFIG.authorizeUrl}?${params.toString()}`;
  console.log('✅ Generated OAuth URL');
  
  return url;
}

/**
 * Generate a secure random state parameter for OAuth
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string
): Promise<BunqOAuthTokenResponse> {
  if (!validateBunqConfig()) {
    throw new Error('Bunq configuration is incomplete');
  }
  
  // Hybrid approach: Basic Auth for client credentials + query params for OAuth params
  // (Bunq error said "Missing required GET parameter" suggesting query params)
  const basicAuth = Buffer.from(
    `${BUNQ_CONFIG.clientId}:${BUNQ_CONFIG.clientSecret}`
  ).toString('base64');
  
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: BUNQ_CONFIG.redirectUri,
  });
  
  // Bunq wants parameters as query string (confirmed by error message)
  const tokenUrl = `${BUNQ_CONFIG.tokenUrl}?${params.toString()}`;
  
  console.log('🔄 Exchanging code for token...');
  console.log('Token URL:', BUNQ_CONFIG.tokenUrl);
  console.log('Redirect URI:', BUNQ_CONFIG.redirectUri);
  console.log('Client ID:', BUNQ_CONFIG.clientId?.substring(0, 20) + '...');
  console.log('Code:', code?.substring(0, 20) + '...');
  console.log('Using Basic Auth + query params');
  
  try {
    // Bunq's non-standard OAuth: POST with Basic Auth + query string params
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Cache-Control': 'no-cache',
      },
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response body:', errorText);
      
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error_description: errorText };
      }
      
      throw new Error(
        `Bunq token exchange failed: ${error.error_description || error.error || response.statusText}`
      );
    }
    
    const data: BunqOAuthTokenResponse = await response.json();
    console.log('✅ Token exchange successful!');
    return data;
  } catch (error) {
    console.error('❌ Error exchanging Bunq authorization code:', error);
    throw error;
  }
}

/**
 * Refresh an expired access token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<BunqOAuthTokenResponse> {
  if (!validateBunqConfig()) {
    throw new Error('Bunq configuration is incomplete');
  }
  
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: BUNQ_CONFIG.clientId,
    client_secret: BUNQ_CONFIG.clientSecret,
  });
  
  try {
    const response = await fetch(BUNQ_CONFIG.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        `Bunq token refresh failed: ${error.error_description || response.statusText}`
      );
    }
    
    const data: BunqOAuthTokenResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error refreshing Bunq access token:', error);
    throw error;
  }
}

// =====================================================
// API Request Functions
// =====================================================

/**
 * Make an authenticated API request to Bunq
 */
async function bunqApiRequest<T>(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BUNQ_CONFIG.apiBaseUrl}${endpoint}`;
  
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Bunq-Client-Request-Id': crypto.randomUUID(),
    'X-Bunq-Geolocation': '0 0 0 0 NL', // Required by Bunq
    'X-Bunq-Language': 'en_US',
    'X-Bunq-Region': 'nl_NL',
    ...options.headers,
  };
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error_description: response.statusText }));
      throw new Error(
        `Bunq API error: ${error.error_description || response.statusText}`
      );
    }
    
    const data = await response.json();
    return data.Response as T;
  } catch (error) {
    console.error(`Bunq API request failed for ${endpoint}:`, error);
    throw error;
  }
}

// =====================================================
// User and Account Functions
// =====================================================

/**
 * Get user information
 */
export async function getUserInfo(accessToken: string): Promise<BunqUserInfo> {
  const response = await bunqApiRequest<any[]>('/user', accessToken);
  
  // Bunq returns user in different formats: UserPerson, UserCompany, UserApiKey
  const userObject = response[0];
  const userType = Object.keys(userObject)[0];
  const userData = userObject[userType];
  
  return userData as BunqUserInfo;
}

/**
 * Get all monetary accounts for a user
 */
export async function getMonetaryAccounts(
  accessToken: string,
  userId: number
): Promise<BunqMonetaryAccount[]> {
  const response = await bunqApiRequest<any[]>(
    `/user/${userId}/monetary-account`,
    accessToken
  );
  
  // Extract monetary accounts from response
  return response.map(item => {
    const accountType = Object.keys(item)[0];
    return item[accountType] as BunqMonetaryAccount;
  });
}

/**
 * Get a specific monetary account
 */
export async function getMonetaryAccount(
  accessToken: string,
  userId: number,
  accountId: number
): Promise<BunqMonetaryAccount> {
  const response = await bunqApiRequest<any[]>(
    `/user/${userId}/monetary-account/${accountId}`,
    accessToken
  );
  
  const accountObject = response[0];
  const accountType = Object.keys(accountObject)[0];
  return accountObject[accountType] as BunqMonetaryAccount;
}

// =====================================================
// Payment/Transaction Functions
// =====================================================

/**
 * Get payments (transactions) for a monetary account
 */
export async function getPayments(
  accessToken: string,
  userId: number,
  accountId: number,
  options?: {
    count?: number; // Number of payments to fetch (default 200)
    older_id?: number; // For pagination
    newer_id?: number; // For pagination
  }
): Promise<BunqPayment[]> {
  let endpoint = `/user/${userId}/monetary-account/${accountId}/payment`;
  
  if (options) {
    const params = new URLSearchParams();
    if (options.count) params.append('count', options.count.toString());
    if (options.older_id) params.append('older_id', options.older_id.toString());
    if (options.newer_id) params.append('newer_id', options.newer_id.toString());
    
    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }
  }
  
  const response = await bunqApiRequest<any[]>(endpoint, accessToken);
  
  return response.map(item => item.Payment as BunqPayment);
}

/**
 * Get a specific payment
 */
export async function getPayment(
  accessToken: string,
  userId: number,
  accountId: number,
  paymentId: number
): Promise<BunqPayment> {
  const response = await bunqApiRequest<any[]>(
    `/user/${userId}/monetary-account/${accountId}/payment/${paymentId}`,
    accessToken
  );
  
  return response[0].Payment as BunqPayment;
}

// =====================================================
// Utility Functions
// =====================================================

/**
 * Check if access token is expired or about to expire
 */
export function isTokenExpired(expiresAt: Date): boolean {
  // Consider token expired if it expires within 5 minutes
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  return expiresAt <= fiveMinutesFromNow;
}

/**
 * Calculate expiration date from expires_in seconds
 */
export function calculateExpirationDate(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}

/**
 * Format Bunq monetary amount to number
 */
export function formatBunqAmount(amount: { value: string; currency: string }): number {
  return parseFloat(amount.value);
}

/**
 * Get primary IBAN from account aliases
 */
export function getPrimaryIban(aliases: BunqAlias[]): string | null {
  const ibanAlias = aliases.find(alias => alias.type === 'IBAN');
  return ibanAlias?.value || null;
}

/**
 * Get display name from account aliases
 */
export function getDisplayName(aliases: BunqAlias[]): string {
  const nameAlias = aliases.find(alias => alias.name);
  return nameAlias?.name || aliases[0]?.value || 'Unknown';
}

// Export configuration for testing
export { BUNQ_CONFIG };

