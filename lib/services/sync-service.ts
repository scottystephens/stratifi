// Shared sync service that can be called from both API routes and callbacks
// Avoids internal HTTP calls which don't work reliably in serverless environments

import { getProvider } from '@/lib/banking-providers/provider-registry';
import {
  supabase,
  createIngestionJob,
  updateIngestionJob,
  updateConnection,
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

export interface SyncOptions {
  connectionId: string;
  tenantId: string;
  providerId: string;
  userId: string;
  syncAccounts?: boolean;
  syncTransactions?: boolean;
  transactionLimit?: number;
  transactionDaysBack?: number;
  transactionStartDate?: string;
  transactionEndDate?: string;
  forceSync?: boolean;
  jobId?: string; // Optional: use existing job instead of creating new one
}

export interface SyncResult {
  success: boolean;
  jobId: string;
  summary: {
    accountsSynced: number;
    accountsCreated: number;
    accountsUpdated: number;
    transactionsSynced: number;
    errors?: string[];
    warnings?: string[];
    syncDurationMs: number;
  };
  error?: string;
}

export async function performSync(options: SyncOptions): Promise<SyncResult> {
  const {
    connectionId,
    tenantId,
    providerId,
    userId,
    syncAccounts = true,
    syncTransactions = true,
    transactionLimit = 500,
    transactionDaysBack = 90,
    transactionStartDate,
    transactionEndDate,
    forceSync = false,
    jobId,
  } = options;

  // Get the banking provider
  const provider = getProvider(providerId);

  // Get connection
  const { data: connection, error: connectionError } = await supabase
    .from('connections')
    .select('*')
    .eq('id', connectionId)
    .eq('tenant_id', tenantId)
    .eq('provider', providerId)
    .single();

  if (connectionError || !connection) {
    throw new Error('Connection not found');
  }

  // Use existing job or create new one
  const ingestionJob = jobId 
    ? { id: jobId } // Use existing job ID
    : await createIngestionJob({
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
      throw new Error(`OAuth token not found. Please reconnect your account. ${tokenError?.message || ''}`);
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
        await supabase
          .from('provider_tokens')
          .update({
            status: 'expired',
            error_message: 'Access token expired and no refresh token available. Please reconnect.',
            updated_at: new Date().toISOString(),
          })
          .eq('id', tokenData.id);
        
        throw new Error(
          'Access token expired and no refresh token available. Please reconnect your account.'
        );
      }

      const newTokens = await provider.refreshAccessToken(tokens.refreshToken);

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

    // Sync accounts
    if (syncAccounts) {
      try {
        const providerAccounts = await provider.fetchAccounts(credentials);
        console.log(`📦 Fetched ${providerAccounts.length} accounts from ${providerId}`);

        const batchResult = await batchCreateOrUpdateAccounts(
          tenantId,
          connectionId,
          providerId,
          providerAccounts,
          userId
        );

        accountsSynced = batchResult.summary.total;
        accountsCreated = batchResult.summary.created;
        accountsUpdated = batchResult.summary.updated;

        if (batchResult.failed.length > 0) {
          errors.push(...batchResult.failed.map(f => 
            `${f.account.accountName}: ${f.error}`
          ));
        }

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
              let startDate: Date;
              let endDate: Date;

              if (transactionStartDate && transactionEndDate) {
                startDate = new Date(transactionStartDate);
                endDate = new Date(transactionEndDate);
              } else {
                const accountData = providerAccount.accounts as any;
                const dateRange = await determineSyncDateRange(
                  accountData.account_id,
                  connectionId,
                  accountData.account_type || 'checking',
                  forceSync
                );

                if (dateRange.skip) {
                  warnings.push(`${providerAccount.account_name}: Skipped (synced recently)`);
                  continue;
                }

                startDate = dateRange.startDate;
                endDate = dateRange.endDate;
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
                  const transactionId = `${providerId}_${connectionId}_${transaction.externalTransactionId}`;
                  
                  if (providerAccount.account_id) {
                    const { data: account, error: accountError } = await supabase
                      .from('accounts')
                      .select('account_id')
                      .eq('id', providerAccount.account_id)
                      .single();

                    if (accountError || !account?.account_id) {
                      errors.push(`Account lookup failed for ${providerAccount.account_name}`);
                      continue;
                    }

                    const { data: mainTxData, error: txError } = await supabase
                      .from('transactions')
                      .upsert(
                        {
                          transaction_id: transactionId,
                          tenant_id: tenantId,
                          account_id: account.account_id,
                          date: transaction.date.toISOString().split('T')[0],
                          amount: transaction.type === 'credit' ? transaction.amount : -transaction.amount,
                          currency: transaction.currency,
                          description: transaction.description,
                          type: transaction.type === 'credit' ? 'Credit' : 'Debit',
                          category: transaction.category || 'Uncategorized',
                          status: 'Completed',
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
                        { onConflict: 'transaction_id' }
                      )
                      .select()
                      .single();

                    if (txError) {
                      errors.push(`Failed to import transaction ${transaction.externalTransactionId}: ${txError.message}`);
                    } else {
                      transactionsSynced++;
                      
                      await supabase
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
                            import_status: 'imported',
                            import_job_id: ingestionJob.id,
                            provider_metadata: transaction.metadata || {},
                            transaction_id: transactionId,
                          },
                          { onConflict: 'connection_id,provider_id,external_transaction_id' }
                        );
                    }
                  }
                } catch (txError) {
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

    // Update ingestion job
    await updateIngestionJob(ingestionJob.id, {
      status: errors.length > 0 ? 'completed_with_errors' : 'completed',
      records_fetched: accountsSynced + transactionsSynced,
      records_imported: accountsCreated + accountsUpdated + transactionsSynced,
      records_failed: errors.length,
      completed_at: completedAt,
      summary: syncSummary,
    });

    // Update connection metadata
    await refreshConnectionMetadata(connectionId);
    
    if (errors.length === 0) {
      await recordSyncSuccess(connectionId);
    } else if (accountsSynced === 0 && transactionsSynced === 0) {
      await recordSyncFailure(connectionId, errors.join('; '));
    }

    await updateConnection(tenantId, connectionId, {
      last_sync_at: completedAt,
    });

    await supabase
      .from('provider_tokens')
      .update({ last_used_at: completedAt })
      .eq('id', tokenData.id);

    console.log(`✅ Sync completed in ${syncDuration}ms`);

    return {
      success: true,
      jobId: ingestionJob.id,
      summary: {
        accountsSynced,
        accountsCreated,
        accountsUpdated,
        transactionsSynced,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        syncDurationMs: syncDuration,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await updateIngestionJob(ingestionJob.id, {
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    });

    await recordSyncFailure(connectionId, errorMessage);

    return {
      success: false,
      jobId: ingestionJob.id,
      summary: {
        accountsSynced: 0,
        accountsCreated: 0,
        accountsUpdated: 0,
        transactionsSynced: 0,
        syncDurationMs: 0,
      },
      error: errorMessage,
    };
  }
}

