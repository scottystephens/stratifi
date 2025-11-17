// Generic Banking Provider OAuth Callback
// Handles OAuth callback for any banking provider

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getProvider } from '@/lib/banking-providers/provider-registry';
import {
  supabase,
  updateConnection,
  createIngestionJob,
  updateIngestionJob,
} from '@/lib/supabase';
import { performSync } from '@/lib/services/sync-service';
import { recordSyncFailure } from '@/lib/services/connection-metadata-service';

export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  try {
    const providerId = params.provider;

    // Get user from server-side client
    const supabaseClient = await createClient();
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        new URL(
          '/login?error=unauthorized&message=Please log in to continue',
          req.url
        )
      );
    }

    // Get the banking provider
    let provider;
    try {
      provider = getProvider(providerId);
    } catch (error) {
      return NextResponse.redirect(
        new URL(
          `/connections/new?error=provider_not_found&message=${encodeURIComponent(
            `Provider '${providerId}' not found`
          )}`,
          req.url
        )
      );
    }

    // Get OAuth parameters from query string
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        new URL(
          `/connections/new?error=oauth_failed&message=${encodeURIComponent(
            errorDescription || 'OAuth authorization failed'
          )}`,
          req.url
        )
      );
    }

    // Validate required parameters
    if (!code || !state) {
      return NextResponse.redirect(
        new URL(
          '/connections/new?error=invalid_oauth&message=Missing OAuth parameters',
          req.url
        )
      );
    }

    // Find the connection with this OAuth state
    const { data: connections, error: connectionError } = await supabase
      .from('connections')
      .select('*')
      .eq('oauth_state', state)
      .eq('created_by', user.id)
      .eq('provider', providerId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (connectionError || !connections || connections.length === 0) {
      console.error('Connection not found for state:', state, connectionError);
      return NextResponse.redirect(
        new URL(
          '/connections/new?error=invalid_state&message=Invalid OAuth state. Please try again.',
          req.url
        )
      );
    }

    const connection = connections[0];

    try {
      // Exchange authorization code for access token
      console.log('Exchanging code for token...');
      const tokens = await provider.exchangeCodeForToken(code);
      
      // Log token details (without exposing full token values)
      console.log('✅ Token exchange successful:', {
        providerId,
        connectionId: connection.id,
        hasAccessToken: !!tokens.accessToken,
        hasRefreshToken: !!tokens.refreshToken,
        refreshTokenLength: tokens.refreshToken?.length || 0,
        expiresAt: tokens.expiresAt?.toISOString(),
        tokenType: tokens.tokenType,
        scopeCount: tokens.scope?.length || 0,
      });

      // Try to get user info from provider (optional - some providers don't support it)
      let userInfo: { userId: string; name: string; email?: string; metadata?: Record<string, any> } | null = null;
      try {
        console.log('Fetching user info...');
        userInfo = await provider.fetchUserInfo({
          connectionId: connection.id,
          tenantId: connection.tenant_id,
          tokens,
        });
        console.log('✅ User info fetched successfully');
      } catch (userInfoError) {
        console.warn('⚠️  Failed to fetch user info (non-blocking):', userInfoError instanceof Error ? userInfoError.message : userInfoError);
        // Use connection ID as fallback user ID
        userInfo = {
          userId: connection.id,
          name: connection.name || `${providerId}_user`,
          metadata: { note: 'User info not available from provider' },
        };
      }

      // Store OAuth tokens in generic provider_tokens table
      // Use upsert to handle case where token already exists (e.g., reconnection)
      console.log('💾 Attempting to store OAuth token:', {
        connectionId: connection.id,
        providerId,
        tenantId: connection.tenant_id,
        hasAccessToken: !!tokens.accessToken,
        hasRefreshToken: !!tokens.refreshToken,
      });
      
      const { data: tokenData, error: tokenError } = await supabase
        .from('provider_tokens')
        .upsert({
          tenant_id: connection.tenant_id,
          connection_id: connection.id,
          provider_id: providerId,
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken || null,
          token_type: tokens.tokenType || 'Bearer',
          expires_at: tokens.expiresAt?.toISOString() || null,
          scopes: tokens.scope || [],
          provider_user_id: userInfo.userId,
          provider_metadata: userInfo.metadata || {},
          status: 'active',
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'connection_id,provider_id',
        })
        .select()
        .single();

      if (tokenError || !tokenData) {
        console.error('❌ Failed to store OAuth token:', {
          error: tokenError,
          connectionId: connection.id,
          providerId,
          tenantId: connection.tenant_id,
          tokenErrorDetails: tokenError?.message,
          tokenErrorCode: tokenError?.code,
          tokenErrorHint: tokenError?.hint,
          fullError: JSON.stringify(tokenError),
        });
        throw new Error(`Failed to store OAuth token: ${tokenError?.message || 'Unknown error'}`);
      }
      
      console.log('✅ OAuth token stored successfully:', {
        tokenId: tokenData.id,
        connectionId: connection.id,
        providerId,
        hasRefreshToken: !!tokenData.refresh_token,
      });

      // Create ingestion job for tracking sync progress
      const ingestionJob = await createIngestionJob({
        tenant_id: connection.tenant_id,
        connection_id: connection.id,
        job_type: `${providerId}_oauth_sync`,
        status: 'running',
      });

      // Update connection status and store job ID for UI polling
      await updateConnection(connection.tenant_id, connection.id, {
        status: 'active',
        config: {
          ...connection.config,
          provider_user_id: userInfo.userId,
          provider_user_name: userInfo.name,
          connected_at: new Date().toISOString(),
          sync_job_id: ingestionJob.id, // Store job ID for UI polling
        },
      });

      // Clear OAuth state (one-time use)
      await supabase
        .from('connections')
        .update({ oauth_state: null })
        .eq('id', connection.id);

      // Automatically sync accounts and transactions after successful OAuth
      // Use the shared sync service directly (avoids internal HTTP calls which don't work in serverless)
      // This runs in the background and won't block the redirect
      (async () => {
        try {
          console.log('🔄 Starting automatic sync after OAuth...');
          
          // Small delay to ensure token is fully committed
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Call sync service directly (pass existing job ID)
          const syncResult = await performSync({
            connectionId: connection.id,
            tenantId: connection.tenant_id,
            providerId: providerId,
            userId: user.id,
            syncAccounts: true,
            syncTransactions: true,
            forceSync: true, // Force initial sync to get full history
            transactionDaysBack: 90, // Initial sync: get last 90 days
            jobId: ingestionJob.id, // Use the job created earlier for tracking
          });

          if (!syncResult.success) {
            console.error('❌ OAuth sync failed:', syncResult.error);
            // Job is already updated by performSync
            return;
          }

          console.log(`✅ OAuth sync completed:`, {
            accountsSynced: syncResult.summary?.accountsSynced || 0,
            transactionsSynced: syncResult.summary?.transactionsSynced || 0,
            jobId: syncResult.jobId,
          });
        } catch (syncError) {
          console.error('❌ Automatic sync error:', syncError);
          
          // Format error message
          const errorMessage = syncError instanceof Error 
            ? syncError.message 
            : String(syncError);
          
          // Update job as failed
          await updateIngestionJob(ingestionJob.id, {
            status: 'failed',
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
          });

          // Record failure for health tracking
          await recordSyncFailure(connection.id, errorMessage);
        }
      })();

      // Redirect to connection details page with sync status
      return NextResponse.redirect(
        new URL(
          `/connections/${connection.id}?success=true&message=Successfully connected to ${provider.config.displayName}&syncing=true&jobId=${ingestionJob.id}`,
          req.url
        )
      );
    } catch (tokenError) {
      console.error('Error during token exchange or user info fetch:', tokenError);

      // Properly format error message
      let errorMessage = 'Unknown error';
      if (tokenError instanceof Error) {
        errorMessage = tokenError.message;
      } else if (typeof tokenError === 'object' && tokenError !== null) {
        errorMessage = JSON.stringify(tokenError);
      } else {
        errorMessage = String(tokenError);
      }

      // Update connection with error
      await updateConnection(connection.tenant_id, connection.id, {
        status: 'error',
        last_error: errorMessage,
      });

      return NextResponse.redirect(
        new URL(
          `/connections/new?error=oauth_failed&message=${encodeURIComponent(
            tokenError instanceof Error ? tokenError.message : 'Failed to complete OAuth flow'
          )}`,
          req.url
        )
      );
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(
      new URL(
        `/connections/new?error=server_error&message=${encodeURIComponent(
          'An unexpected error occurred. Please try again.'
        )}`,
        req.url
      )
    );
  }
}

