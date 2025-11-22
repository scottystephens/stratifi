// Generic Banking Provider Sync
// Syncs accounts and transactions for any banking provider

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
import {
  determineSyncDateRange,
  calculateSyncMetrics,
  formatSyncMetrics,
} from '@/lib/services/transaction-sync-service';
import { performPlaidSync } from '@/lib/services/plaid-sync-service';

export async function POST(
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const {
      connectionId,
      tenantId,
      syncAccounts = true,
      syncTransactions = true,
      transactionLimit = 500,
      // Transaction sync options
      transactionDaysBack = 90, // Default to last 90 days
      transactionStartDate, // Optional: override with specific start date
      transactionEndDate, // Optional: override with specific end date
      forceSync = false, // Force sync to bypass throttling
    } = body;

    if (!connectionId || !tenantId) {
      return NextResponse.json(
        { error: 'Connection ID and Tenant ID are required' },
        { status: 400 }
      );
    }

    // Get connection
    const { data: connection, error: connectionError } = await supabase
      .from('connections')
      .select('*')
      .eq('id', connectionId)
      .eq('tenant_id', tenantId)
      .eq('provider', providerId)
      .single();

    if (connectionError || !connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    // 🚀 Use Optimized Plaid Sync Service if provider is Plaid
    if (providerId === 'plaid') {
      console.log('🚀 Using optimized Plaid sync service...');
      
      // Get active token
      const { data: tokenData } = await supabase
        .from('provider_tokens')
        .select('access_token')
        .eq('connection_id', connectionId)
        .eq('provider_id', 'plaid')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (!tokenData?.access_token) {
        throw new Error('No active Plaid access token found');
      }

      // Create ingestion job for tracking
      const ingestionJob = await createIngestionJob({
        tenant_id: tenantId,
        connection_id: connectionId,
        job_type: 'plaid_sync',
        status: 'running',
      });

      try {
        const result = await performPlaidSync(
          tenantId,
          connectionId,
          tokenData.access_token,
          {
            syncAccounts,
            syncTransactions,
            forceFullSync: forceSync,
            importJobId: ingestionJob.id,
          }
        );

        // Update job status
        await updateIngestionJob(ingestionJob.id, {
          status: result.success ? 'completed' : 'completed_with_errors',
          records_fetched: result.accountsSynced + (result.transactionsAdded || 0),
          records_imported: result.accountsSynced + (result.transactionsImported || 0),
          records_failed: (result.errors?.length || 0),
          completed_at: new Date().toISOString(),
          summary: result,
        });

        // Update connection last_sync_at
        await updateConnection(tenantId, connectionId, {
          last_sync_at: new Date().toISOString(),
        });

        return NextResponse.json({
          success: result.success,
          message: `Synced ${result.accountsSynced} accounts and ${result.transactionsImported} transactions`,
          summary: result,
          jobId: ingestionJob.id,
        });
      } catch (error) {
        // Update job as failed
        await updateIngestionJob(ingestionJob.id, {
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        });
        throw error;
      }
    }

    // ==========================================
    // Generic Sync Logic (for other providers)
    // ==========================================
    
    // Get the banking provider
    const provider = getProvider(providerId);

    // Create ingestion job
    const ingestionJob = await createIngestionJob({
      tenant_id: tenantId,
      connection_id: connectionId,
      job_type: `${providerId}_sync`,
      status: 'running',
    });

    try {
      // Get provider tokens - using maybeSingle() to handle edge cases
      const { data: tokenData, error: tokenError } = await supabase
        .from('provider_tokens')
        .select('*')
        .eq('connection_id', connectionId)
        .eq('provider_id', providerId)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tokenError) {
        console.error('❌ Token query error:', {
          connectionId,
          providerId,
          error: tokenError,
          code: tokenError.code,
          message: tokenError.message,
        });
        
        throw new Error(
          `Token query failed: ${tokenError.message}. Please reconnect your account.`
        );
      }

      if (!tokenData) {
        console.error('❌ No active token found:', {
          connectionId,
          providerId,
        });
        
        // Check if any tokens exist for this connection (for debugging)
        const { data: allTokens, error: allTokensError } = await supabase
          .from('provider_tokens')
          .select('*')
          .eq('connection_id', connectionId)
          .eq('provider_id', providerId);
        
        console.error('🔍 All tokens for connection:', {
          count: allTokens?.length || 0,
          tokens: allTokens?.map(t => ({
            id: t.id,
            status: t.status,
            created_at: t.created_at,
            updated_at: t.updated_at,
            expires_at: t.expires_at,
          })),
          error: allTokensError,
        });
        
        throw new Error(
          'OAuth token not found. Please reconnect your account via the Connections page.'
        );
      }

      // Check if token needs refresh
      const tokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || undefined,
        expiresAt: tokenData.expires_at ? new Date(tokenData.expires_at) : undefined,
        tokenType: tokenData.token_type || 'Bearer',
        scope: tokenData.scopes,
      };

      // Log token state for debugging
      console.log('🔑 Token state:', {
        connectionId,
        providerId,
        hasRefreshToken: !!tokens.refreshToken,
        expiresAt: tokens.expiresAt?.toISOString(),
        isExpired: tokens.expiresAt ? provider.isTokenExpired(tokens.expiresAt) : false,
        tokenCreatedAt: tokenData.created_at,
        tokenUpdatedAt: tokenData.updated_at,
      });

      if (tokens.expiresAt && provider.isTokenExpired(tokens.expiresAt)) {
        if (!tokens.refreshToken) {
          console.error('❌ Token expired but no refresh token available:', {
            connectionId,
            providerId,
            tokenId: tokenData.id,
            expiresAt: tokens.expiresAt.toISOString(),
            hasRefreshTokenInDb: !!tokenData.refresh_token,
          });
          
          // Update token status to indicate it needs reconnection
          await supabase
            .from('provider_tokens')
            .update({
              status: 'expired',
              error_message: 'Access token expired and no refresh token available. Please reconnect.',
              updated_at: new Date().toISOString(),
            })
            .eq('id', tokenData.id);
          
          throw new Error(
            'Access token expired and no refresh token available. Please reconnect your Tink account by going to Connections and clicking "Reconnect".'
          );
        }

        console.log('🔄 Refreshing access token...');
        const newTokens = await provider.refreshAccessToken(tokens.refreshToken);

        // Update stored token
        await supabase
          .from('provider_tokens')
          .update({
            access_token: newTokens.accessToken,
            refresh_token: newTokens.refreshToken || tokenData.refresh_token,
            expires_at: newTokens.expiresAt?.toISOString() || null,
            last_used_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', tokenData.id);

        tokens.accessToken = newTokens.accessToken;
        tokens.expiresAt = newTokens.expiresAt;
      }

      const credentials = {
        connectionId,
        tenantId,
        tokens,
        metadata: tokenData.provider_metadata,
      };

      const syncStartTime = Date.now();
      let accountsSynced = 0;
      let accountsCreated = 0;
      let accountsUpdated = 0;
      let transactionsSynced = 0;
      const errors: string[] = [];
      const warnings: string[] = [];

      // Sync accounts using new account service
      if (syncAccounts) {
        try {
          const providerAccounts = await provider.fetchAccounts(credentials);
          console.log(`📦 Fetched ${providerAccounts.length} accounts from ${providerId}`);

          // Batch create/update accounts
          const batchResult = await batchCreateOrUpdateAccounts(
            tenantId,
            connectionId,
            providerId,
            providerAccounts,
            user.id
          );

          accountsSynced = batchResult.summary.total;
          accountsCreated = batchResult.summary.created;
          accountsUpdated = batchResult.summary.updated;

          // Record errors from batch operation
          if (batchResult.failed.length > 0) {
            errors.push(...batchResult.failed.map(f => 
              `${f.account.accountName}: ${f.error}`
            ));
          }

          // Sync account closures (mark accounts as closed if they no longer exist)
          const activeExternalIds = providerAccounts.map(a => a.externalAccountId);
          const closedCount = await syncAccountClosures(
            tenantId,
            connectionId,
            providerId,
            activeExternalIds
          );

          if (closedCount > 0) {
            warnings.push(`${closedCount} accounts marked as closed`);
          }

          console.log(`✅ Account sync: ${accountsCreated} created, ${accountsUpdated} updated, ${batchResult.summary.failed} failed`);
        } catch (accountsError) {
          const errorMsg = `Failed to fetch accounts: ${provider.getErrorMessage(accountsError)}`;
          errors.push(errorMsg);
          console.error('❌', errorMsg);
        }
      }

      // Sync transactions with intelligent date range
      if (syncTransactions) {
        try {
          const { data: providerAccounts } = await supabase
            .from('provider_accounts')
            .select('*, accounts!inner(account_id, account_type, last_synced_at)')
            .eq('connection_id', connectionId)
            .eq('provider_id', providerId)
            .eq('sync_enabled', true);

          if (providerAccounts && providerAccounts.length > 0) {
            console.log(`💳 Syncing transactions for ${providerAccounts.length} account(s)...`);

            for (const providerAccount of providerAccounts) {
              try {
                // Use intelligent date range calculation (unless user provided explicit dates)
                let startDate: Date;
                let endDate: Date;
                let syncReason: string;

                if (transactionStartDate && transactionEndDate) {
                  // User provided explicit date range - use it
                  startDate = new Date(transactionStartDate);
                  endDate = new Date(transactionEndDate);
                  syncReason = 'manual_override';
                  console.log(`📅 Using manual date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
                } else {
                  // Use intelligent sync service
                  const accountData = providerAccount.accounts as any;
                  const dateRange = await determineSyncDateRange(
                    accountData.account_id,
                    connectionId,
                    accountData.account_type || 'checking',
                    forceSync // Use forceSync parameter
                  );

                  // Calculate and log metrics
                  const metrics = calculateSyncMetrics(dateRange);
                  console.log(formatSyncMetrics(metrics));

                  // Skip if recommended
                  if (dateRange.skip) {
                    console.log(`⏭️  Skipping ${providerAccount.account_name} - synced recently`);
                    warnings.push(`${providerAccount.account_name}: Skipped (synced ${dateRange.daysSinceLastSync?.toFixed(1)}h ago)`);
                    continue;
                  }

                  startDate = dateRange.startDate;
                  endDate = dateRange.endDate;
                  syncReason = dateRange.reason;
                }

                const transactions = await provider.fetchTransactions(
                  credentials,
                  providerAccount.external_account_id,
                  { 
                    limit: transactionLimit,
                    startDate,
                    endDate,
                  }
                );

                for (const transaction of transactions) {
                  try {
                    // Generate consistent transaction_id for linking
                    const transactionId = `${providerId}_${connectionId}_${transaction.externalTransactionId}`;
                    
                    // ✨ STEP 1: Import to main transactions table FIRST (required for foreign key)
                    // Need to get the TEXT account_id (not UUID id) from the accounts table
                    if (providerAccount.account_id) {
                      // Fetch the account to get the TEXT account_id field
                      const { data: account, error: accountError } = await supabase
                        .from('accounts')
                        .select('account_id')
                        .eq('id', providerAccount.account_id)
                        .single();

                      if (accountError) {
                        console.error(`Error fetching account for provider account ${providerAccount.id}:`, accountError);
                        errors.push(`Account lookup failed for ${providerAccount.account_name}: ${accountError.message}`);
                        continue;
                      }

                      if (account && account.account_id) {
                        const { data: mainTxData, error: txError } = await supabase
                          .from('transactions')
                          .upsert(
                            {
                              transaction_id: transactionId, // Required primary key
                              tenant_id: tenantId,
                              account_id: account.account_id, // Use TEXT account_id, not UUID id
                              date: transaction.date.toISOString().split('T')[0], // Use 'date' column, format as YYYY-MM-DD
                              amount: transaction.type === 'credit' ? transaction.amount : -transaction.amount,
                              currency: transaction.currency,
                              description: transaction.description,
                              type: transaction.type === 'credit' ? 'Credit' : 'Debit',
                              category: transaction.category || 'Uncategorized', // Required field
                              status: 'Completed', // Required field
                              reference: transaction.reference,
                              connection_id: connectionId,
                              external_transaction_id: transaction.externalTransactionId,
                              source_type: `${providerId}_api`,
                              import_job_id: ingestionJob.id,
                              metadata: {
                                counterparty_name: transaction.counterpartyName,
                                counterparty_account: transaction.counterpartyAccount,
                                reference: transaction.reference,
                                provider_id: providerId,
                                ...transaction.metadata,
                              },
                            },
                            {
                              onConflict: 'transaction_id', // Use transaction_id as conflict key
                            }
                          )
                          .select()
                          .single();

                        if (txError) {
                          console.error(`Error storing transaction ${transaction.externalTransactionId}:`, txError);
                          errors.push(`Failed to import transaction ${transaction.externalTransactionId}: ${txError.message}`);
                        } else {
                          transactionsSynced++;
                          
                          // ✨ STEP 2: Store in provider_transactions table AFTER main transaction exists
                          const { data: providerTxData, error: providerTxError } = await supabase
                            .from('provider_transactions')
                            .upsert(
                              {
                                tenant_id: tenantId,
                                connection_id: connectionId,
                                provider_id: providerId,
                                provider_account_id: providerAccount.id,
                                external_transaction_id: transaction.externalTransactionId,
                                external_account_id: providerAccount.external_account_id,
                                amount: transaction.amount,
                                currency: transaction.currency,
                                description: transaction.description,
                                transaction_type: transaction.type,
                                counterparty_name: transaction.counterpartyName,
                                counterparty_account: transaction.counterpartyAccount,
                                reference: transaction.reference,
                                category: transaction.category,
                                transaction_date: transaction.date.toISOString(),
                                import_status: 'imported', // Mark as imported since main tx exists
                                import_job_id: ingestionJob.id,
                                // ✨ Store COMPLETE provider metadata (now includes raw_transaction)
                                provider_metadata: transaction.metadata || {},
                                // ✨ Link to main transaction (now exists)
                                transaction_id: transactionId,
                              },
                              {
                                onConflict: 'connection_id,provider_id,external_transaction_id',
                              }
                            )
                            .select()
                            .single();

                          if (providerTxError) {
                            console.error(`Error storing provider transaction ${transaction.externalTransactionId}:`, providerTxError);
                            // Don't fail the whole sync, just log the error
                            errors.push(`Failed to store provider transaction ${transaction.externalTransactionId}: ${providerTxError.message}`);
                          }
                        }
                      } else {
                        console.warn(`Account not found for provider account ${providerAccount.id}, skipping transaction import`);
                        errors.push(`Account not found for ${providerAccount.account_name}, transaction ${transaction.externalTransactionId} skipped`);
                      }
                    } else {
                      console.warn(`Provider account ${providerAccount.id} has no linked account_id`);
                      errors.push(`No account_id for ${providerAccount.account_name}, transaction ${transaction.externalTransactionId} skipped`);
                    }
                  } catch (txError) {
                    console.error(`Error importing transaction ${transaction.externalTransactionId}:`, txError);
                    errors.push(`Transaction import error: ${txError instanceof Error ? txError.message : String(txError)}`);
                  }
                }
              } catch (txFetchError) {
                errors.push(`Account ${providerAccount.account_name}: ${provider.getErrorMessage(txFetchError)}`);
              }
            }
          }
        } catch (transactionsError) {
          errors.push(`Failed to sync transactions: ${provider.getErrorMessage(transactionsError)}`);
        }
      }

      // Calculate sync duration
      const syncDuration = Date.now() - syncStartTime;
      const completedAt = new Date().toISOString();

      // Create comprehensive sync summary
      const syncSummary: SyncSummary = {
        accounts_synced: accountsSynced,
        accounts_created: accountsCreated,
        accounts_updated: accountsUpdated,
        transactions_synced: transactionsSynced,
        sync_duration_ms: syncDuration,
        errors,
        warnings,
        started_at: new Date(syncStartTime).toISOString(),
        completed_at: completedAt,
      };

      // Update ingestion job with detailed summary
      await updateIngestionJob(ingestionJob.id, {
        status: errors.length > 0 ? 'completed_with_errors' : 'completed',
        records_fetched: accountsSynced + transactionsSynced,
        records_imported: accountsCreated + accountsUpdated + transactionsSynced,
        records_failed: errors.length,
        completed_at: completedAt,
        summary: syncSummary,
      });

      // Update connection metadata and health
      await refreshConnectionMetadata(connectionId);
      
      // Record sync success/failure for health tracking
      if (errors.length === 0) {
        await recordSyncSuccess(connectionId);
      } else if (accountsSynced === 0 && transactionsSynced === 0) {
        // Complete failure
        await recordSyncFailure(connectionId, errors.join('; '));
      }

      // Update connection last_sync_at
      await updateConnection(tenantId, connectionId, {
        last_sync_at: completedAt,
      });

      // Update token last_used_at
      await supabase
        .from('provider_tokens')
        .update({ last_used_at: completedAt })
        .eq('id', tokenData.id);

      console.log(`✅ Sync completed in ${syncDuration}ms`);

      return NextResponse.json({
        success: true,
        message: `Synced ${accountsSynced} accounts (${accountsCreated} new, ${accountsUpdated} updated) and ${transactionsSynced} transactions`,
        summary: {
          accountsSynced,
          accountsCreated,
          accountsUpdated,
          transactionsSynced,
          errors: errors.length > 0 ? errors : undefined,
          warnings: warnings.length > 0 ? warnings : undefined,
          syncDurationMs: syncDuration,
        },
        jobId: ingestionJob.id,
      });
    } catch (error) {
      // Update job as failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await updateIngestionJob(ingestionJob.id, {
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      });

      // Record failure for health tracking
      await recordSyncFailure(connectionId, errorMessage);

      throw error;
    }
  } catch (error) {
    console.error('Provider sync error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to sync with provider',
      },
      { status: 500 }
    );
  }
}
