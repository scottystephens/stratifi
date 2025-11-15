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
import {
  batchCreateOrUpdateAccounts,
  syncAccountClosures,
} from '@/lib/services/account-service';
import {
  refreshConnectionMetadata,
  recordSyncSuccess,
  recordSyncFailure,
  type SyncSummary,
} from '@/lib/services/connection-metadata-service';

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
        const syncStartTime = Date.now();
        const syncSummary: SyncSummary = {
          accounts_synced: 0,
          accounts_created: 0,
          accounts_updated: 0,
          sync_duration_ms: 0,
          errors: [],
          warnings: [],
          started_at: new Date().toISOString(),
          completed_at: '',
        };

        try {
          console.log('🔄 Starting automatic sync after OAuth...');
          
          // Small delay to ensure token is fully committed
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Create ingestion job
          const ingestionJob = await createIngestionJob({
            tenant_id: connection.tenant_id,
            connection_id: connection.id,
            job_type: `${providerId}_oauth_sync`,
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

            // Fetch and sync accounts using new service
            try {
              const providerAccounts = await provider.fetchAccounts(credentials);
              console.log(`📦 Fetched ${providerAccounts.length} accounts from ${providerId}`);

              // Batch create/update accounts
              const batchResult = await batchCreateOrUpdateAccounts(
                connection.tenant_id,
                connection.id,
                providerId,
                providerAccounts,
                user.id
              );

              syncSummary.accounts_synced = batchResult.summary.total;
              syncSummary.accounts_created = batchResult.summary.created;
              syncSummary.accounts_updated = batchResult.summary.updated;

              // Record errors from batch operation
              if (batchResult.failed.length > 0) {
                syncSummary.errors = batchResult.failed.map(f => 
                  `${f.account.accountName}: ${f.error}`
                );
              }

              // Sync account closures (mark accounts as closed if they no longer exist)
              const activeExternalIds = providerAccounts.map(a => a.externalAccountId);
              const closedCount = await syncAccountClosures(
                connection.tenant_id,
                connection.id,
                providerId,
                activeExternalIds
              );

              if (closedCount > 0) {
                syncSummary.warnings.push(`${closedCount} accounts marked as closed`);
              }

              // Optional: Sync initial transactions (last 30 days for first sync)
              // Only if provider supports transactions
              if (provider.config.supportsSync) {
                try {
                  console.log('💳 Starting initial transaction sync (last 30 days)...');
                  
                  const endDate = new Date();
                  const startDate = new Date(endDate.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days back
                  
                  let transactionsCount = 0;

                  // Fetch transactions for successful accounts
                  for (const result of batchResult.successful) {
                    if (!result.account) continue;

                    try {
                      const { data: providerAccount } = await supabase
                        .from('provider_accounts')
                        .select('*')
                        .eq('account_id', result.account.id)
                        .eq('connection_id', connection.id)
                        .single();

                      if (!providerAccount) continue;

                      const transactions = await provider.fetchTransactions(
                        credentials,
                        providerAccount.external_account_id,
                        { 
                          startDate, 
                          endDate, 
                          limit: 100, // Limit initial sync per account
                        }
                      );

                      // Import transactions
                      for (const transaction of transactions) {
                        try {
                          await supabase.from('provider_transactions').upsert({
                            tenant_id: connection.tenant_id,
                            connection_id: connection.id,
                            provider_id: providerId,
                            provider_account_id: providerAccount.id,
                            external_transaction_id: transaction.externalTransactionId,
                            external_account_id: providerAccount.external_account_id,
                            amount: transaction.amount,
                            currency: transaction.currency,
                            description: transaction.description,
                            transaction_type: transaction.type,
                            counterparty_name: transaction.counterpartyName,
                            transaction_date: transaction.date.toISOString(),
                            import_status: 'pending',
                            import_job_id: ingestionJob.id,
                            provider_metadata: transaction.metadata || {},
                          }, {
                            onConflict: 'connection_id,provider_id,external_transaction_id',
                          });

                          // Import to main transactions table
                          await supabase.from('transactions').upsert({
                            tenant_id: connection.tenant_id,
                            account_id: result.account.id,
                            transaction_date: transaction.date.toISOString(),
                            amount: transaction.type === 'credit' ? transaction.amount : -transaction.amount,
                            currency: transaction.currency,
                            description: transaction.description,
                            transaction_type: transaction.type === 'credit' ? 'Credit' : 'Debit',
                            connection_id: connection.id,
                            external_transaction_id: transaction.externalTransactionId,
                            source_type: `${providerId}_api`,
                            import_job_id: ingestionJob.id,
                          }, {
                            onConflict: 'tenant_id,connection_id,external_transaction_id',
                          });

                          transactionsCount++;
                        } catch (txError) {
                          console.error('Error importing transaction:', txError);
                        }
                      }
                    } catch (accountTxError) {
                      // Log but don't fail the entire sync
                      console.warn(`Failed to sync transactions for account:`, accountTxError);
                    }
                  }

                  syncSummary.transactions_synced = transactionsCount;
                  console.log(`✅ Initial transaction sync: ${transactionsCount} transactions imported`);
                } catch (txSyncError) {
                  // Transaction sync is optional - log warning but don't fail
                  const warningMsg = `Transaction sync skipped: ${txSyncError instanceof Error ? txSyncError.message : 'Unknown error'}`;
                  syncSummary.warnings.push(warningMsg);
                  console.warn(`⚠️  ${warningMsg}`);
                }
              }

              // Calculate sync duration
              syncSummary.sync_duration_ms = Date.now() - syncStartTime;
              syncSummary.completed_at = new Date().toISOString();

              // Update job with results
              await updateIngestionJob(ingestionJob.id, {
                status: syncSummary.errors.length > 0 ? 'completed_with_errors' : 'completed',
                records_fetched: batchResult.summary.total,
                records_imported: batchResult.summary.created + batchResult.summary.updated,
                records_failed: batchResult.summary.failed,
                completed_at: syncSummary.completed_at,
                summary: syncSummary,
              });

              // Update connection metadata and health
              await refreshConnectionMetadata(connection.id);
              
              if (syncSummary.errors.length === 0) {
                await recordSyncSuccess(connection.id);
              }

              console.log(`✅ OAuth sync completed: ${batchResult.summary.created} created, ${batchResult.summary.updated} updated, ${batchResult.summary.failed} failed`);
            } catch (syncError) {
              console.error('❌ Automatic sync error:', syncError);
              
              // Format error message
              const errorMessage = syncError instanceof Error 
                ? syncError.message 
                : String(syncError);
              
              syncSummary.errors.push(errorMessage);
              syncSummary.completed_at = new Date().toISOString();
              syncSummary.sync_duration_ms = Date.now() - syncStartTime;
              
              await updateIngestionJob(ingestionJob.id, {
                status: 'failed',
                error_message: errorMessage,
                completed_at: syncSummary.completed_at,
                summary: syncSummary,
              });

              // Record failure for health tracking
              await recordSyncFailure(connection.id, errorMessage);
            }
          } else {
            const errorMsg = 'Token data not available for automatic sync';
            console.warn(`⚠️  ${errorMsg}`);
            syncSummary.errors.push(errorMsg);
          }
        } catch (outerError) {
          // Don't fail the OAuth flow if sync fails - user can sync manually later
          console.error('Automatic sync error (non-blocking):', outerError);
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

