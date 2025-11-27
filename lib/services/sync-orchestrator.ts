/**
 * Sync Orchestrator
 *
 * Universal sync orchestrator for ALL banking providers. This single service
 * coordinates the entire sync process using the layered architecture:
 *
 * 1. Fetch Raw Data → 2. Store Raw Data → 3. Normalize → 4. Save to Standard Tables
 *
 * Works with Plaid, Tink, Standard Bank, and any future banking providers.
 */

import { supabase } from '@/lib/supabase';
import { BankingProvider } from '@/lib/banking-providers/base-provider';
import { rawStorageService } from './raw-storage-service';
import { normalizationService } from './normalization-service';
import { batchCreateOrUpdateAccounts, syncHistoricalBalances } from './account-service';
import { batchCreateOrUpdateTransactions } from './transaction-sync-service';
import type { ConnectionCredentials } from '@/lib/banking-providers/raw-types';
import {
  startSyncTracking,
  updateSyncMetrics,
  completeSyncTracking,
} from './xero-observability-service';

export interface SyncOptions {
  provider: BankingProvider;
  connectionId: string;
  tenantId: string;
  credentials: ConnectionCredentials;
  syncAccounts?: boolean;
  syncTransactions?: boolean;
  userId: string;
  accountIds?: string[]; // Specific accounts to sync (optional)
  startDate?: string;    // For transaction sync
  endDate?: string;      // For transaction sync
  modifiedSince?: string; // For incremental sync (webhook-triggered)
}

export interface SyncResult {
  success: boolean;
  accountsSynced: number;
  transactionsSynced: number;
  errors: string[];
  duration: number;
  provider: string;
  connectionId: string;
  metadata?: Record<string, any>;
}

/**
 * Universal sync orchestrator for all banking providers
 */
export async function orchestrateSync(options: SyncOptions): Promise<SyncResult> {
  const {
    provider,
    connectionId,
    tenantId,
    credentials,
    syncAccounts = true,
    syncTransactions = true,
    userId,
    accountIds,
    startDate,
    endDate,
    modifiedSince, // For incremental sync (webhook-triggered)
  } = options;

  const startTime = Date.now();
  const providerId = provider.config.providerId;

  console.log(`[SyncOrchestrator] Starting sync orchestration for ${providerId} (connection: ${connectionId})`);

  // Start observability tracking for Xero
  let syncId: string | null = null;
  if (providerId === 'xero') {
    try {
      syncId = await startSyncTracking(connectionId, tenantId);
      console.log(`[SyncOrchestrator] Started Xero sync tracking: ${syncId}`);
    } catch (error) {
      console.warn('[SyncOrchestrator] Failed to start sync tracking (non-blocking):', error);
    }
  }

  let accountsSynced = 0;
  let transactionsSynced = 0;
  const errors: string[] = [];
  const metadata: Record<string, any> = {
    provider: providerId,
    connectionId,
    steps: [],
  };

  try {
    // ==========================================
    // STEP 1: Fetch Raw Accounts
    // ==========================================

    let normalizedAccounts: any[] = [];

    if (syncAccounts) {
      try {
        console.log('[SyncOrchestrator] STEP 1: Fetching raw accounts from provider API...');
        const stepStart = Date.now();

        const rawAccountsResponse = await provider.fetchRawAccounts(credentials);

        // Update observability metrics for Xero
        if (providerId === 'xero' && syncId) {
          await updateSyncMetrics(syncId, {
            accountsFetched: rawAccountsResponse.accountCount,
          });
        }

        metadata.steps.push({
          step: 1,
          name: 'fetch_raw_accounts',
          duration: Date.now() - stepStart,
          accountCount: rawAccountsResponse.accountCount,
        });

        console.log(`[SyncOrchestrator] STEP 2: Storing complete raw data to JSONB (${rawAccountsResponse.accountCount} accounts)...`);
        const step2Start = Date.now();

        // Store raw data based on provider
        console.log(`[SyncOrchestrator] Storing ${rawAccountsResponse.accountCount} raw accounts...`);
        if (providerId === 'plaid') {
          await rawStorageService.storePlaidAccounts(rawAccountsResponse);
          console.log(`[SyncOrchestrator] Stored raw Plaid accounts successfully`);
        } else if (providerId === 'tink') {
          await rawStorageService.storeTinkAccounts(rawAccountsResponse);
          console.log(`[SyncOrchestrator] Stored raw Tink accounts successfully`);
        } else if (providerId === 'xero') {
          await rawStorageService.storeXeroAccounts(rawAccountsResponse);
          console.log(`[SyncOrchestrator] Stored raw Xero accounts successfully`);
        } else {
          // Direct bank provider
          await rawStorageService.storeDirectBankAccounts(rawAccountsResponse, providerId);
          console.log(`[SyncOrchestrator] Stored raw ${providerId} accounts successfully`);
        }

        metadata.steps.push({
          step: 2,
          name: 'store_raw_accounts',
          duration: Date.now() - step2Start,
        });

        console.log('[SyncOrchestrator] STEP 3: Normalizing accounts to standard schema...');
        const step3Start = Date.now();

        // Normalize accounts based on provider
        if (providerId === 'plaid') {
          normalizedAccounts = await normalizationService.normalizePlaidAccounts(connectionId, tenantId);
        } else if (providerId === 'tink') {
          normalizedAccounts = await normalizationService.normalizeTinkAccounts(connectionId, tenantId);
        } else if (providerId === 'xero') {
          normalizedAccounts = await normalizationService.normalizeXeroAccounts(connectionId, tenantId);
        } else {
          // Direct bank provider
          normalizedAccounts = await normalizationService.normalizeDirectBankAccounts(connectionId, providerId);
        }

        metadata.steps.push({
          step: 3,
          name: 'normalize_accounts',
          duration: Date.now() - step3Start,
          normalizedCount: normalizedAccounts.length,
        });

        console.log(`[SyncOrchestrator] STEP 4: Saving ${normalizedAccounts.length} accounts to accounts table...`);
        const step4Start = Date.now();

        const batchResult = await batchCreateOrUpdateAccounts(
          tenantId,
          connectionId,
          providerId,
          normalizedAccounts,
          userId
        );

        accountsSynced = batchResult.summary.total;

        // Update observability metrics for Xero
        if (providerId === 'xero' && syncId) {
          await updateSyncMetrics(syncId, {
            accountsCreated: batchResult.summary.created,
            accountsUpdated: batchResult.summary.updated,
          });
        }

        metadata.steps.push({
          step: 4,
          name: 'save_accounts',
          duration: Date.now() - step4Start,
          savedCount: accountsSynced,
          batchResult: batchResult.summary,
        });

        console.log(`[SyncOrchestrator] Accounts sync complete: ${accountsSynced} accounts`);

        // 4.5 Sync Historical Balances (Specific to providers with historical balance support)
        if (providerId === 'xero') {
          console.log('[SyncOrchestrator] STEP 4.5: Syncing historical balances to statements...');
          const balanceStart = Date.now();
          const syncedStatements = await syncHistoricalBalances(tenantId, connectionId, providerId);
          
          metadata.steps.push({
            step: 4.5,
            name: 'sync_historical_balances',
            duration: Date.now() - balanceStart,
            statementsSynced: syncedStatements
          });
        }

      } catch (error) {
        const errorMsg = `Account sync failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        console.error('[SyncOrchestrator] Account sync error:', error);
        
        // Update observability metrics for Xero
        if (providerId === 'xero' && syncId) {
          await updateSyncMetrics(syncId, {
            errors: [errorMsg],
          });
        }
      }
    }

    // ==========================================
    // STEP 5: Fetch Raw Transactions
    // ==========================================

    if (syncTransactions && normalizedAccounts.length > 0) {
      try {
        console.log(`[SyncOrchestrator] STEP 5: Fetching raw transactions from provider API...`);
        const step5Start = Date.now();

        // Determine which accounts to sync transactions for
        const accountsToSync = accountIds || normalizedAccounts.map(acc => acc.externalAccountId);
        let totalTransactionsFetched = 0;

        for (const accountId of accountsToSync) {
          try {
            console.log(`[SyncOrchestrator] Fetching transactions for account ${accountId}...`);

            // Get cursor for incremental sync (Plaid only)
            let cursor: string | undefined;
            if (providerId === 'plaid') {
              cursor = await rawStorageService.getPlaidCursor(connectionId);
              if (cursor) {
                console.log(`[SyncOrchestrator] Using Plaid cursor for incremental sync: ${cursor.substring(0, 20)}...`);
              } else {
                console.log('[SyncOrchestrator] No Plaid cursor found - performing full sync');
              }
            }

            const rawTxResponse = await provider.fetchRawTransactions(
              credentials,
              accountId,
              {
                startDate,
                endDate,
                cursor, // Pass cursor for incremental sync
                modifiedSince, // For incremental sync (webhook-triggered)
              }
            );

            totalTransactionsFetched += rawTxResponse.transactionCount;

            // Update observability metrics for Xero
            if (providerId === 'xero' && syncId) {
              await updateSyncMetrics(syncId, {
                transactionsFetched: totalTransactionsFetched,
              });
            }

            // Store raw transaction data based on provider
            console.log(`[SyncOrchestrator] Storing ${rawTxResponse.transactionCount} raw transactions for account ${accountId}...`);
            if (providerId === 'plaid') {
              await rawStorageService.storePlaidTransactions(rawTxResponse);
              console.log(`[SyncOrchestrator] Stored raw Plaid transactions successfully`);
            } else if (providerId === 'tink') {
              await rawStorageService.storeTinkTransactions(rawTxResponse);
              console.log(`[SyncOrchestrator] Stored raw Tink transactions successfully`);
            } else if (providerId === 'xero') {
              await rawStorageService.storeXeroTransactions(rawTxResponse);
              console.log(`[SyncOrchestrator] Stored raw Xero transactions successfully`);
            } else {
              // Direct bank provider
              await rawStorageService.storeDirectBankTransactions(rawTxResponse, providerId);
              console.log(`[SyncOrchestrator] Stored raw ${providerId} transactions successfully`);
            }

          } catch (accountError) {
            console.error(`[SyncOrchestrator] Failed to sync transactions for account ${accountId}:`, accountError);
            // Continue with other accounts
          }
        }

        metadata.steps.push({
          step: 5,
          name: 'fetch_raw_transactions',
          duration: Date.now() - step5Start,
          accountsProcessed: accountsToSync.length,
          totalTransactionsFetched,
        });

        console.log('[SyncOrchestrator] STEP 6: Normalizing transactions to standard schema...');
        const step6Start = Date.now();

        // Normalize transactions based on provider
        let normalizedTxs: any[] = [];
        if (providerId === 'plaid') {
          normalizedTxs = await normalizationService.normalizePlaidTransactions(connectionId);
        } else if (providerId === 'tink') {
          normalizedTxs = await normalizationService.normalizeTinkTransactions(connectionId);
        } else if (providerId === 'xero') {
          normalizedTxs = await normalizationService.normalizeXeroTransactions(connectionId);
        } else {
          // Direct bank provider
          normalizedTxs = await normalizationService.normalizeDirectBankTransactions(connectionId, providerId);
        }

        metadata.steps.push({
          step: 6,
          name: 'normalize_transactions',
          duration: Date.now() - step6Start,
          normalizedCount: normalizedTxs.length,
        });

        console.log(`[SyncOrchestrator] STEP 7: Saving ${normalizedTxs.length} transactions to transactions table...`);
        const step7Start = Date.now();

        // Save transactions to standard table
        console.log(`[SyncOrchestrator] About to batch save ${normalizedTxs.length} transactions...`);
        console.log(`[SyncOrchestrator] Sample transaction:`, normalizedTxs[0] ? {
          externalTransactionId: normalizedTxs[0].externalTransactionId,
          accountId: normalizedTxs[0].accountId,
          amount: normalizedTxs[0].amount,
          description: normalizedTxs[0].description?.substring(0, 50)
        } : 'No transactions');

        const txBatchResult = await batchCreateOrUpdateTransactions(
          tenantId,
          connectionId,
          providerId,
          normalizedTxs,
          userId
        );

        console.log(`[SyncOrchestrator] Batch result:`, txBatchResult);
        transactionsSynced = txBatchResult.summary.total;

        // Update observability metrics for Xero
        if (providerId === 'xero' && syncId) {
          await updateSyncMetrics(syncId, {
            transactionsCreated: txBatchResult.summary.created,
            transactionsUpdated: txBatchResult.summary.updated,
          });
        }

        metadata.steps.push({
          step: 7,
          name: 'save_transactions',
          duration: Date.now() - step7Start,
          savedCount: transactionsSynced,
          batchResult: txBatchResult.summary,
        });

        console.log(`[SyncOrchestrator] Transactions sync complete: ${transactionsSynced} transactions`);

      } catch (error) {
        const errorMsg = `Transaction sync failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        console.error('[SyncOrchestrator] Transaction sync error:', error);
        
        // Update observability metrics for Xero
        if (providerId === 'xero' && syncId) {
          await updateSyncMetrics(syncId, {
            errors: errors,
          });
        }
      }
    }

    // ==========================================
    // STEP 8: Update Connection Status
    // ==========================================

    try {
      console.log('[SyncOrchestrator] STEP 8: Updating connection sync status...');

      await supabase
        .from('connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: errors.length === 0 ? 'success' : 'partial',
          last_sync_accounts: accountsSynced,
          last_sync_transactions: transactionsSynced,
          last_sync_error: errors.length > 0 ? errors.join('; ') : null,
          sync_summary: {
            accounts_synced: accountsSynced,
            transactions_synced: transactionsSynced,
            accounts_created: metadata.steps?.find((s: any) => s.name === 'save_accounts')?.batchResult?.created || 0,
            accounts_updated: metadata.steps?.find((s: any) => s.name === 'save_accounts')?.batchResult?.updated || 0,
            transactions_created: metadata.steps?.find((s: any) => s.name === 'save_transactions')?.batchResult?.created || 0,
            transactions_updated: metadata.steps?.find((s: any) => s.name === 'save_transactions')?.batchResult?.updated || 0,
            sync_duration_ms: Date.now() - startTime,
            errors: errors,
            warnings: [],
            started_at: new Date(startTime).toISOString(),
            completed_at: new Date().toISOString(),
          },
        })
        .eq('id', connectionId);

      // Refresh connection metadata (total_accounts, total_transactions, etc.)
      console.log('[SyncOrchestrator] Refreshing connection metadata...');
      const { refreshConnectionMetadata } = await import('./connection-metadata-service');
      await refreshConnectionMetadata(connectionId);
      console.log('[SyncOrchestrator] Connection metadata refreshed successfully');

    } catch (statusError) {
      console.error('[SyncOrchestrator] Failed to update connection status:', statusError);
      // Don't add to errors array as this is not a critical failure
    }

    const totalDuration = Date.now() - startTime;

    // Complete observability tracking for Xero
    if (providerId === 'xero' && syncId) {
      const finalStatus: 'completed' | 'failed' | 'partial' = 
        errors.length === 0 ? 'completed' : 
        errors.length < (accountsSynced + transactionsSynced) ? 'partial' : 'failed';
      
      await completeSyncTracking(syncId, finalStatus, {
        accountsFetched: accountsSynced,
        transactionsFetched: transactionsSynced,
        errors: errors,
      });
    }

    console.log(`[SyncOrchestrator] Sync orchestration complete for ${providerId}!`);
    console.log(`[SyncOrchestrator] Duration: ${totalDuration}ms`);
    console.log(`[SyncOrchestrator] Accounts: ${accountsSynced}, Transactions: ${transactionsSynced}`);
    if (errors.length > 0) {
      console.log(`[SyncOrchestrator] Errors: ${errors.length}`);
    }

    return {
      success: errors.length === 0,
      accountsSynced,
      transactionsSynced,
      errors,
      duration: totalDuration,
      provider: providerId,
      connectionId,
      metadata,
    };

  } catch (fatalError) {
    const totalDuration = Date.now() - startTime;
    const errorMsg = `Fatal sync error: ${fatalError instanceof Error ? fatalError.message : String(fatalError)}`;

    console.error('[SyncOrchestrator] Fatal error:', fatalError);

    // Complete observability tracking for Xero (failed status)
    if (providerId === 'xero' && syncId) {
      await completeSyncTracking(syncId, 'failed', {
        errors: [errorMsg],
      });
    }

    // Update connection with failure status
    try {
      await supabase
        .from('connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'failed',
          last_sync_error: errorMsg,
        })
        .eq('id', connectionId);
    } catch (statusError) {
      console.error('[SyncOrchestrator] Failed to update connection failure status:', statusError);
    }

    return {
      success: false,
      accountsSynced: 0,
      transactionsSynced: 0,
      errors: [errorMsg],
      duration: totalDuration,
      provider: providerId,
      connectionId,
      metadata,
    };
  }
}

/**
 * Lightweight sync status check (doesn't perform actual sync)
 */
export async function getSyncStatus(connectionId: string): Promise<{
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  accountsCount: number;
  transactionsCount: number;
}> {
  const { data: connection } = await supabase
    .from('connections')
    .select('last_sync_at, last_sync_status')
    .eq('id', connectionId)
    .single();

  const { count: accountsCount } = await supabase
    .from('accounts')
    .select('*', { count: 'exact', head: true })
    .eq('connection_id', connectionId);

  const { count: transactionsCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('connection_id', connectionId);

  return {
    lastSyncAt: connection?.last_sync_at ? new Date(connection.last_sync_at) : null,
    lastSyncStatus: connection?.last_sync_status || null,
    accountsCount: accountsCount || 0,
    transactionsCount: transactionsCount || 0,
  };
}

/**
 * Bulk sync multiple connections (for background jobs)
 */
export async function bulkOrchestrateSyncs(
  syncRequests: Array<{
    provider: BankingProvider;
    connectionId: string;
    tenantId: string;
    credentials: ConnectionCredentials;
    userId: string;
    syncAccounts?: boolean;
    syncTransactions?: boolean;
  }>
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  console.log(`[SyncOrchestrator] Starting bulk sync of ${syncRequests.length} connections...`);

  for (const request of syncRequests) {
    try {
      const result = await orchestrateSync(request);
      results.push(result);
    } catch (error) {
      console.error(`[SyncOrchestrator] Bulk sync failed for connection ${request.connectionId}:`, error);
      results.push({
        success: false,
        accountsSynced: 0,
        transactionsSynced: 0,
        errors: [`Bulk sync failed: ${error instanceof Error ? error.message : String(error)}`],
        duration: 0,
        provider: request.provider.config.providerId,
        connectionId: request.connectionId,
      });
    }
  }

  console.log(`[SyncOrchestrator] Bulk sync complete. ${results.filter(r => r.success).length}/${results.length} successful.`);

  return results;
}
