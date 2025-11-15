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
  createAccount,
} from '@/lib/supabase';

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

      // Update connection status
      await updateConnection(connection.tenant_id, connection.id, {
        status: 'active',
        config: {
          ...connection.config,
          provider_user_id: userInfo.userId,
          provider_user_name: userInfo.name,
          connected_at: new Date().toISOString(),
        },
      });

      // Clear OAuth state (one-time use)
      await supabase
        .from('connections')
        .update({ oauth_state: null })
        .eq('id', connection.id);

      // Automatically sync accounts and transactions after successful OAuth
      // This runs in the background and won't block the redirect
      // Use the tokenData we just inserted to avoid race conditions
      (async () => {
        try {
          console.log('Starting automatic sync after OAuth...');
          
          // Small delay to ensure token is fully committed
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Create ingestion job
          const ingestionJob = await createIngestionJob({
            tenant_id: connection.tenant_id,
            connection_id: connection.id,
            job_type: `${providerId}_sync`,
            status: 'running',
          });

          // Use the tokenData we just inserted (avoid race condition)
          if (tokenData) {
            const credentials = {
              connectionId: connection.id,
              tenantId: connection.tenant_id,
              tokens: {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token || undefined,
                expiresAt: tokenData.expires_at ? new Date(tokenData.expires_at) : undefined,
                tokenType: tokenData.token_type || 'Bearer',
                scope: tokenData.scopes,
              },
              metadata: tokenData.provider_metadata,
            };

            // Fetch accounts
            try {
              const providerAccounts = await provider.fetchAccounts(credentials);
              let accountsSynced = 0;

              for (const providerAccount of providerAccounts) {
                try {
                  const { data: existingAccount } = await supabase
                    .from('provider_accounts')
                    .select('*')
                    .eq('connection_id', connection.id)
                    .eq('provider_id', providerId)
                    .eq('external_account_id', providerAccount.externalAccountId)
                    .single();

                  if (existingAccount) {
                    await supabase
                      .from('provider_accounts')
                      .update({
                        account_name: providerAccount.accountName,
                        currency: providerAccount.currency,
                        balance: providerAccount.balance,
                        last_synced_at: new Date().toISOString(),
                      })
                      .eq('id', existingAccount.id);
                  } else {
                    const { data: newProviderAccount } = await supabase
                      .from('provider_accounts')
                      .insert({
                        tenant_id: connection.tenant_id,
                        connection_id: connection.id,
                        provider_id: providerId,
                        external_account_id: providerAccount.externalAccountId,
                        account_name: providerAccount.accountName,
                        account_number: providerAccount.accountNumber,
                        account_type: providerAccount.accountType,
                        currency: providerAccount.currency,
                        balance: providerAccount.balance,
                        iban: providerAccount.iban,
                        status: providerAccount.status,
                        provider_metadata: providerAccount.metadata || {},
                        last_synced_at: new Date().toISOString(),
                      })
                      .select()
                      .single();

                    if (newProviderAccount) {
                      const newAccount = await createAccount({
                        tenant_id: connection.tenant_id,
                        account_name: providerAccount.accountName,
                        account_number: providerAccount.accountNumber || providerAccount.externalAccountId,
                        account_type: providerAccount.accountType,
                        account_status: providerAccount.status,
                        bank_name: provider.config.displayName,
                        currency: providerAccount.currency,
                        current_balance: providerAccount.balance,
                        external_account_id: providerAccount.externalAccountId,
                        sync_enabled: true,
                        last_synced_at: new Date().toISOString(),
                        created_by: user.id,
                      });

                      await supabase
                        .from('provider_accounts')
                        .update({ account_id: newAccount.id })
                        .eq('id', newProviderAccount.id);
                    }
                  }
                  accountsSynced++;
                } catch (accountError) {
                  console.error('Error syncing account:', accountError);
                }
              }

              // Update job
              await updateIngestionJob(ingestionJob.id, {
                status: 'completed',
                records_fetched: accountsSynced,
                records_imported: accountsSynced,
                completed_at: new Date().toISOString(),
              });

              console.log(`✅ Automatic sync completed: ${accountsSynced} accounts synced`);
            } catch (syncError) {
              console.error('Automatic sync error:', syncError);
              
              // Properly format error message
              let errorMessage = 'Unknown error';
              if (syncError instanceof Error) {
                errorMessage = syncError.message;
              } else if (typeof syncError === 'object' && syncError !== null) {
                errorMessage = JSON.stringify(syncError);
              } else {
                errorMessage = String(syncError);
              }
              
              await updateIngestionJob(ingestionJob.id, {
                status: 'failed',
                error_message: errorMessage,
                completed_at: new Date().toISOString(),
              });
            }
          } else {
            console.warn('Token data not available for automatic sync');
          }
        } catch (syncError) {
          // Don't fail the OAuth flow if sync fails - user can sync manually later
          console.error('Automatic sync error (non-blocking):', syncError);
        }
      })();

      // Redirect to connection details page
      return NextResponse.redirect(
        new URL(
          `/connections/${connection.id}?success=true&message=Successfully connected to ${provider.config.displayName}`,
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

