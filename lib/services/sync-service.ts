// Shared sync service that can be called from both API routes and callbacks
// Avoids internal HTTP calls which don't work reliably in serverless environments

import { getProvider } from '@/lib/banking-providers/provider-registry';
import {
  supabase,
  createIngestionJob,
  updateIngestionJob,
  updateConnection,
  upsertAccountStatement,
  convertAmountToUsd,
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
        // First, check raw provider_accounts without JOIN to diagnose
        const { data: rawProviderAccounts, error: rawError } = await supabase
          .from('provider_accounts')
          .select('id, account_id, account_name, external_account_id, sync_enabled')
          .eq('connection_id', connectionId)
          .eq('provider_id', providerId);

        console.log(`🔍 Raw provider_accounts query returned ${rawProviderAccounts?.length || 0} rows`);
        if (rawProviderAccounts && rawProviderAccounts.length > 0) {
          console.log('📋 Provider accounts:', rawProviderAccounts.map(pa => ({
            name: pa.account_name,
            account_id_fk: pa.account_id,
            sync_enabled: pa.sync_enabled
          })));
        }

        const { data: providerAccounts, error: joinError } = await supabase
          .from('provider_accounts')
          .select('*, accounts!inner(account_id, account_type, last_synced_at)')
          .eq('connection_id', connectionId)
          .eq('provider_id', providerId)
          .eq('sync_enabled', true);

        if (joinError) {
          console.error('❌ Error fetching provider accounts with JOIN:', joinError);
        }

        console.log(`🔍 JOIN query returned ${providerAccounts?.length || 0} rows`);

        // FALLBACK: If JOIN returns 0 rows but raw query returned data,
        // the account_id FK is likely null/broken. Try without the JOIN.
        let accountsToSync = providerAccounts;
        if ((!providerAccounts || providerAccounts.length === 0) && 
            rawProviderAccounts && rawProviderAccounts.length > 0) {
          console.warn('⚠️  JOIN returned 0 rows but provider_accounts exist. Using fallback query without JOIN.');
          console.warn('⚠️  This indicates provider_accounts.account_id FK is null or invalid.');
          
          // Fetch accounts separately and manually join
          const { data: accounts } = await supabase
            .from('accounts')
            .select('id, account_id, account_type, last_synced_at')
            .eq('connection_id', connectionId)
            .eq('provider_id', providerId);

          console.log(`📦 Found ${accounts?.length || 0} accounts for connection`);

          // Map provider_accounts to accounts by external_id
          accountsToSync = rawProviderAccounts
            .filter(pa => pa.sync_enabled)
            .map(pa => {
              // Try to find matching account
              const matchingAccount = accounts?.find(a => a.id === pa.account_id);
              
              if (!matchingAccount) {
                console.warn(`⚠️  No matching account found for provider_account ${pa.account_name} (id: ${pa.id}, account_id FK: ${pa.account_id})`);
              }
              
              return {
                ...pa,
                accounts: matchingAccount || { 
                  account_id: pa.account_id, 
                  account_type: 'checking', 
                  last_synced_at: null 
                }
              };
            }) as any;

          console.log(`🔄 Fallback: Will attempt to sync ${accountsToSync?.length || 0} accounts`);
        }

        if (accountsToSync && accountsToSync.length > 0) {
          console.log(`💳 Syncing transactions for ${accountsToSync.length} account(s)...`);

          for (const providerAccount of accountsToSync) {
            try {
              let startDate: Date;
              let endDate: Date;
              let dateRangeInfo: Awaited<ReturnType<typeof determineSyncDateRange>> | null = null;
              const accountSyncStart = Date.now();
              const accountErrors: string[] = [];

              const recordAccountError = (message: string) => {
                errors.push(message);
                accountErrors.push(message);
              };

              if (transactionStartDate && transactionEndDate) {
                startDate = new Date(transactionStartDate);
                endDate = new Date(transactionEndDate);
              } else {
                const accountData = providerAccount.accounts as any;
                dateRangeInfo = await determineSyncDateRange(
                  accountData.account_id,
                  connectionId,
                  accountData.account_type || 'checking',
                  forceSync
                );

                if (dateRangeInfo.skip) {
                  const skipMessage = `${providerAccount.account_name}: Skipped (synced recently)`;
                  warnings.push(skipMessage);
                  continue;
                }

                startDate = dateRangeInfo.startDate;
                endDate = dateRangeInfo.endDate;

                const metrics = calculateSyncMetrics(dateRangeInfo);
                console.log(formatSyncMetrics(metrics));
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

              console.log(`📊 Fetched ${transactions.length} transactions for account ${providerAccount.account_name}`);
              console.log(`🔑 Provider account details: { id: ${providerAccount.id}, account_id: ${providerAccount.account_id}, name: ${providerAccount.account_name} }`);

              let cachedAccountRecord: { account_id: string; currency?: string | null; current_balance?: number | null } | null = null;

              for (const transaction of transactions) {
                try {
                  const transactionId = `${providerId}_${connectionId}_${transaction.externalTransactionId}`;
                  
                  console.log(`🔍 Processing transaction ${transactionId}, provider_account.account_id = ${providerAccount.account_id}`);
                  
                  if (providerAccount.account_id) {
                    console.log(`✅ Entering transaction insert block for ${providerAccount.account_name}`);
                    const { data: account, error: accountError } = await supabase
                      .from('accounts')
                      .select('account_id, currency, current_balance')
                      .eq('id', providerAccount.account_id)
                      .single();

                    if (accountError || !account?.account_id) {
                      recordAccountError(`Account lookup failed for ${providerAccount.account_name}: ${accountError?.message || 'account_id not found'}`);
                      console.error(`❌ Account lookup failed - provider_account.account_id: ${providerAccount.account_id}, error:`, accountError);
                      continue;
                    }

                    cachedAccountRecord = account;

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
                      recordAccountError(`Failed to import transaction ${transaction.externalTransactionId}: ${txError.message}`);
                      console.error(`❌ Transaction upsert failed:`, txError);
                    } else {
                      transactionsSynced++;
                      if (transactionsSynced <= 3) {
                        console.log(`✅ Transaction saved: ${transaction.description} (${transaction.amount} ${transaction.currency})`);
                      }
                      
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
                  } else {
                    console.warn(`⚠️  Skipping transactions for ${providerAccount.account_name} - account_id is null/undefined`);
                    recordAccountError(`Cannot import transactions: provider_account.account_id is null`);
                    break; // Skip remaining transactions for this account
                  }
                } catch (txError) {
                  recordAccountError(`Transaction import error: ${txError instanceof Error ? txError.message : String(txError)}`);
                  console.error(`❌ Transaction loop error:`, txError);
                }
              }
              
              console.log(`📊 Account ${providerAccount.account_name}: ${transactionsSynced} total transactions synced so far`);

              // Update account metadata to inform future incremental sync windows
              if (providerAccount.account_id) {
                const syncTimestamp = (dateRangeInfo?.endDate || endDate || new Date()).toISOString();
                const accountUpdates: Record<string, any> = {
                  last_synced_at: syncTimestamp,
                  updated_at: new Date().toISOString(),
                };

                await supabase
                  .from('accounts')
                  .update(accountUpdates)
                  .eq('id', providerAccount.account_id);
              }

              const providerSyncStatus = accountErrors.length > 0 ? 'error' : 'success';
              const providerSyncError = accountErrors.length > 0 ? accountErrors.join('; ').slice(0, 500) : null;

              await supabase
                .from('provider_accounts')
                .update({
                  last_synced_at: (dateRangeInfo?.endDate || endDate || new Date()).toISOString(),
                  last_sync_status: providerSyncStatus,
                  last_sync_error: providerSyncError,
                  last_sync_duration_ms: Date.now() - accountSyncStart,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', providerAccount.id);

              if (providerAccount.account_id) {
                const statementDate = (dateRangeInfo?.endDate || endDate || new Date())
                  .toISOString()
                  .split('T')[0];
                const statementCurrency = (providerAccount.currency || cachedAccountRecord?.currency || 'USD').toUpperCase();
                const statementBalance =
                  typeof providerAccount.balance === 'number'
                    ? providerAccount.balance
                    : cachedAccountRecord?.current_balance ?? 0;
                const availableBalance =
                  typeof (providerAccount as any).available_balance === 'number'
                    ? (providerAccount as any).available_balance
                    : null;

                let usdEquivalent: number | null = null;
                try {
                  usdEquivalent = await convertAmountToUsd(statementBalance, statementCurrency);
                } catch (conversionError) {
                  console.warn('Unable to convert statement to USD:', conversionError);
                }

                try {
                  await upsertAccountStatement({
                    tenantId,
                    accountId: providerAccount.account_id,
                    statementDate,
                    endingBalance: statementBalance,
                    availableBalance: availableBalance ?? statementBalance,
                    currency: statementCurrency,
                    usdEquivalent: usdEquivalent ?? undefined,
                    source: 'synced',
                    confidence: providerSyncStatus === 'error' ? 'medium' : 'high',
                    metadata: {
                      provider_account_id: providerAccount.id,
                      connection_id: connectionId,
                      provider: providerId,
                    },
                  });
                } catch (statementError) {
                  recordAccountError(
                    `Failed to record statement for ${providerAccount.account_name}: ${
                      statementError instanceof Error ? statementError.message : String(statementError)
                    }`
                  );
                }
              }
            } catch (txFetchError) {
              const message = `Account ${providerAccount.account_name}: ${provider.getErrorMessage(txFetchError)}`;
              errors.push(message);
              await supabase
                .from('provider_accounts')
                .update({
                  last_sync_status: 'error',
                  last_sync_error: message.slice(0, 500),
                  last_sync_duration_ms: null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', providerAccount.id);
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

