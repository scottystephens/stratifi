/**
 * Token Refresh Service
 *
 * Manages automatic token refresh for OAuth providers.
 * Ensures tokens are refreshed before they expire during long-running syncs.
 */

import { supabase } from '@/lib/supabase';
import type { OAuthTokens } from '@/lib/banking-providers/base-provider';

export interface TokenRefreshResult {
  success: boolean;
  tokens?: OAuthTokens;
  error?: string;
}

export interface StoredToken {
  id: string;
  connection_id: string;
  provider_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  token_type: string;
  scopes: string[];
  provider_metadata: Record<string, any>;
  status: string;
}

/**
 * Token Refresh Service
 * 
 * Provides automatic token refresh functionality for OAuth providers.
 * Call getValidAccessToken() before making API calls to ensure the token is valid.
 */
export class TokenRefreshService {
  // Buffer time before expiration to trigger refresh (5 minutes)
  private readonly refreshBufferMs = 5 * 60 * 1000;

  /**
   * Check if a token needs to be refreshed
   */
  needsRefresh(expiresAt: Date | string | null | undefined): boolean {
    if (!expiresAt) {
      // No expiration means token doesn't expire (or we don't know)
      return false;
    }

    const expirationDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
    const refreshThreshold = new Date(Date.now() + this.refreshBufferMs);

    return expirationDate <= refreshThreshold;
  }

  /**
   * Get a valid access token for a connection
   * Automatically refreshes if needed
   */
  async getValidAccessToken(
    connectionId: string,
    providerId: string,
    refreshFunction: (refreshToken: string) => Promise<OAuthTokens>
  ): Promise<TokenRefreshResult> {
    try {
      // Get current token
      const { data: tokenData, error: tokenError } = await supabase
        .from('provider_tokens')
        .select('*')
        .eq('connection_id', connectionId)
        .eq('provider_id', providerId)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tokenError || !tokenData) {
        return {
          success: false,
          error: 'No active token found for connection',
        };
      }

      // Check if token needs refresh
      if (this.needsRefresh(tokenData.expires_at)) {
        if (!tokenData.refresh_token) {
          return {
            success: false,
            error: 'Token expired and no refresh token available',
          };
        }

        console.log(`🔄 [TokenRefresh] Refreshing token for ${providerId} connection ${connectionId}...`);

        try {
          const newTokens = await refreshFunction(tokenData.refresh_token);

          // Update stored token
          const { error: updateError } = await supabase
            .from('provider_tokens')
            .update({
              access_token: newTokens.accessToken,
              refresh_token: newTokens.refreshToken || tokenData.refresh_token,
              expires_at: newTokens.expiresAt?.toISOString() || null,
              token_type: newTokens.tokenType || 'Bearer',
              scopes: newTokens.scope || tokenData.scopes,
              last_used_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', tokenData.id);

          if (updateError) {
            console.error('[TokenRefresh] Failed to update token:', updateError);
            return {
              success: false,
              error: `Failed to store refreshed token: ${updateError.message}`,
            };
          }

          console.log(`✅ [TokenRefresh] Token refreshed successfully`);

          return {
            success: true,
            tokens: newTokens,
          };
        } catch (refreshError) {
          console.error('[TokenRefresh] Token refresh failed:', refreshError);

          // Mark token as expired
          await supabase
            .from('provider_tokens')
            .update({
              status: 'expired',
              error_message: refreshError instanceof Error ? refreshError.message : 'Token refresh failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', tokenData.id);

          return {
            success: false,
            error: `Token refresh failed: ${refreshError instanceof Error ? refreshError.message : 'Unknown error'}`,
          };
        }
      }

      // Token is still valid
      return {
        success: true,
        tokens: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || undefined,
          expiresAt: tokenData.expires_at ? new Date(tokenData.expires_at) : undefined,
          tokenType: tokenData.token_type || 'Bearer',
          scope: tokenData.scopes,
        },
      };
    } catch (error) {
      console.error('[TokenRefresh] Error getting valid token:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get the full token record from database
   */
  async getTokenRecord(connectionId: string, providerId: string): Promise<StoredToken | null> {
    const { data, error } = await supabase
      .from('provider_tokens')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('provider_id', providerId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data as StoredToken;
  }

  /**
   * Update token metadata (e.g., xeroTenantId)
   */
  async updateTokenMetadata(
    connectionId: string,
    providerId: string,
    metadata: Record<string, any>
  ): Promise<boolean> {
    const tokenRecord = await this.getTokenRecord(connectionId, providerId);
    if (!tokenRecord) {
      return false;
    }

    const { error } = await supabase
      .from('provider_tokens')
      .update({
        provider_metadata: {
          ...tokenRecord.provider_metadata,
          ...metadata,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', tokenRecord.id);

    return !error;
  }

  /**
   * Mark a token as revoked (e.g., user disconnected)
   */
  async revokeToken(connectionId: string, providerId: string): Promise<boolean> {
    const { error } = await supabase
      .from('provider_tokens')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('connection_id', connectionId)
      .eq('provider_id', providerId);

    return !error;
  }

  /**
   * Get time until token expires (in milliseconds)
   * Returns null if token doesn't expire or expiration is unknown
   */
  getTimeUntilExpiry(expiresAt: Date | string | null | undefined): number | null {
    if (!expiresAt) {
      return null;
    }

    const expirationDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
    return Math.max(0, expirationDate.getTime() - Date.now());
  }
}

// Export singleton instance
export const tokenRefreshService = new TokenRefreshService();

