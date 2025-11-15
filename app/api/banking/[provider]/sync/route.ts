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

    // Get the banking provider
    const provider = getProvider(providerId);

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

    // Create ingestion job
    const ingestionJob = await createIngestionJob({
      tenant_id: tenantId,
      connection_id: connectionId,
      job_type: `${providerId}_sync`,
      status: 'running',
    });

    try {
      // Get provider tokens
      const { data: tokenData, error: tokenError } = await supabase
        .from('provider_tokens')
        .select('*')
        .eq('connection_id', connectionId)
        .eq('provider_id', providerId)
        .eq('status', 'active')
        .single();

      if (tokenError || !tokenData) {
        console.error('❌ Token lookup failed:', {
          connectionId,
          providerId,
          error: tokenError,
          tokenData,
        });
        
        // Check if any tokens exist for this connection (for debugging)
        const { data: allTokens, error: allTokensError } = await supabase
          .from('provider_tokens')
          .select('*')
          .eq('connection_id', connectionId)
          .eq('provider_id', providerId);
        
        console.error('🔍 All tokens for connection:', {
          count: allTokens?.length || 0,
          tokens: allTokens,
          error: allTokensError,
        });
        
        throw new Error(
          `OAuth token not found. Please reconnect your account. ${tokenError?.message || ''}`
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

      if (tokens.expiresAt && provider.isTokenExpired(tokens.expiresAt)) {
        if (!tokens.refreshToken) {
          throw new Error('Access token expired and no refresh token available.');
        }

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

      // Sync transactions
      if (syncTransactions) {
        try {
          // Calculate date range for transaction sync
          const endDate = transactionEndDate 
            ? new Date(transactionEndDate)
            : new Date();
          
          const startDate = transactionStartDate
            ? new Date(transactionStartDate)
            : new Date(endDate.getTime() - (transactionDaysBack * 24 * 60 * 60 * 1000));

          console.log(`📅 Syncing transactions from ${startDate.toISOString()} to ${endDate.toISOString()}`);

          const { data: providerAccounts } = await supabase
            .from('provider_accounts')
            .select('*')
            .eq('connection_id', connectionId)
            .eq('provider_id', providerId)
            .eq('sync_enabled', true);

          if (providerAccounts && providerAccounts.length > 0) {
            for (const providerAccount of providerAccounts) {
              try {
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
                    // Store in provider_transactions table
                    await supabase.from('provider_transactions').upsert(
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
                        import_status: 'pending',
                        import_job_id: ingestionJob.id,
                        provider_metadata: transaction.metadata || {},
                      },
                      {
                        onConflict: 'connection_id,provider_id,external_transaction_id',
                      }
                    );

                    // Import to main transactions table
                    if (providerAccount.account_id) {
                      await supabase.from('transactions').upsert(
                        {
                          tenant_id: tenantId,
                          account_id: providerAccount.account_id,
                          transaction_date: transaction.date.toISOString(),
                          amount: transaction.type === 'credit' ? transaction.amount : -transaction.amount,
                          currency: transaction.currency,
                          description: transaction.description,
                          transaction_type: transaction.type === 'credit' ? 'Credit' : 'Debit',
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
                          onConflict: 'tenant_id,connection_id,external_transaction_id',
                        }
                      );

                      transactionsSynced++;
                    }
                  } catch (txError) {
                    console.error(`Error importing transaction:`, txError);
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

