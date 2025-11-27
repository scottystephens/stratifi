/**
 * Transaction Sync Service
 * Intelligent transaction syncing with cost optimization
 */

import { supabase } from '../supabase';

export interface SyncDateRange {
  startDate: Date;
  endDate: Date;
  reason: 'initial_backfill' | 'incremental' | 'moderate_gap' | 'long_gap_backfill' | 'forced';
  skip?: boolean;
  daysSinceLastSync?: number;
}

export interface BackfillConfig {
  checking: number;
  savings: number;
  credit_card: number;
  loan: number;
  investment: number;
  default: number;
}

// Configurable backfill periods by account type (in days)
const BACKFILL_PERIODS: BackfillConfig = {
  checking: 90,
  savings: 180,
  credit_card: 365,
  loan: 365,
  investment: 180,
  default: 90,
};

// Initial connections should fetch the deepest range possible (2 years)
const INITIAL_BACKFILL_DAYS = 730;

// Sync throttling settings
const MIN_SYNC_INTERVAL_HOURS = 1; // Don't sync more than once per hour (unless forced)
const INCREMENTAL_OVERLAP_DAYS = 3; // 3-day overlap for incremental syncs
const MODERATE_GAP_OVERLAP_DAYS = 10; // Larger overlap for weekly/monthly syncs

/**
 * Determine the optimal date range for syncing transactions
 * Uses intelligent logic to minimize API calls while ensuring data completeness
 */
export async function determineSyncDateRange(
  accountId: string,
  connectionId: string,
  accountType: string = 'checking',
  force: boolean = false
): Promise<SyncDateRange> {
  const now = new Date();

  // Get the last sync time for this account
  const { data: account } = await supabase
    .from('accounts')
    .select('last_synced_at')
    .eq('account_id', accountId)
    .eq('connection_id', connectionId)
    .single();

  const lastSyncAt = account?.last_synced_at ? new Date(account.last_synced_at) : null;
  const lastTransactionDate = await getLastTransactionDate(accountId, connectionId);
  const mostRecentSyncPoint = getMostRecentDate(lastSyncAt, lastTransactionDate);

  // First-time sync - do a full backfill
  if (!mostRecentSyncPoint) {
    const backfillDays = getInitialBackfillPeriod(accountType);
    return {
      startDate: new Date(now.getTime() - backfillDays * 24 * 60 * 60 * 1000),
      endDate: now,
      reason: 'initial_backfill',
    };
  }

  // Calculate hours since last sync
  const hoursSinceSync = (now.getTime() - mostRecentSyncPoint.getTime()) / (60 * 60 * 1000);
  const daysSinceSync = hoursSinceSync / 24;

  // Very recent sync - skip unless forced
  if (hoursSinceSync < MIN_SYNC_INTERVAL_HOURS && !force) {
    return {
      startDate: mostRecentSyncPoint,
      endDate: now,
      reason: 'incremental',
      skip: true,
      daysSinceLastSync: daysSinceSync,
    };
  }

  // Forced sync - always sync, but use incremental window
  if (force) {
    return {
      startDate: new Date(mostRecentSyncPoint.getTime() - INCREMENTAL_OVERLAP_DAYS * 24 * 60 * 60 * 1000),
      endDate: now,
      reason: 'forced',
      daysSinceLastSync: daysSinceSync,
    };
  }

  // Recent sync (< 7 days) - incremental with 1-day overlap
  if (daysSinceSync <= 7) {
    return {
      startDate: new Date(mostRecentSyncPoint.getTime() - INCREMENTAL_OVERLAP_DAYS * 24 * 60 * 60 * 1000),
      endDate: now,
      reason: 'incremental',
      daysSinceLastSync: daysSinceSync,
    };
  }

  // Moderate gap (7-30 days) - larger window with 1-week overlap
  if (daysSinceSync <= 30) {
    return {
      startDate: new Date(mostRecentSyncPoint.getTime() - MODERATE_GAP_OVERLAP_DAYS * 24 * 60 * 60 * 1000),
      endDate: now,
      reason: 'moderate_gap',
      daysSinceLastSync: daysSinceSync,
    };
  }

  // Large gap (> 30 days) - full backfill
  const backfillDays = getBackfillPeriod(accountType);
  return {
    startDate: new Date(now.getTime() - backfillDays * 24 * 60 * 60 * 1000),
    endDate: now,
    reason: 'long_gap_backfill',
    daysSinceLastSync: daysSinceSync,
  };
}

/**
 * Get the backfill period for a given account type
 */
export function getBackfillPeriod(accountType: string): number {
  const normalizedType = accountType.toLowerCase().replace(/[_\s-]/g, '');

  if (normalizedType.includes('checking')) return BACKFILL_PERIODS.checking;
  if (normalizedType.includes('saving')) return BACKFILL_PERIODS.savings;
  if (normalizedType.includes('credit')) return BACKFILL_PERIODS.credit_card;
  if (normalizedType.includes('loan') || normalizedType.includes('mortgage')) return BACKFILL_PERIODS.loan;
  if (normalizedType.includes('investment') || normalizedType.includes('brokerage'))
    return BACKFILL_PERIODS.investment;

  return BACKFILL_PERIODS.default;
}

function getInitialBackfillPeriod(accountType: string): number {
  return Math.max(getBackfillPeriod(accountType), INITIAL_BACKFILL_DAYS);
}

function getMostRecentDate(
  lastSyncAt: Date | null,
  lastTransactionDate: Date | null
): Date | null {
  if (lastSyncAt && lastTransactionDate) {
    return lastSyncAt > lastTransactionDate ? lastSyncAt : lastTransactionDate;
  }

  return lastSyncAt || lastTransactionDate || null;
}

/**
 * Get the last transaction date for an account
 * Useful for determining incremental sync windows
 */
export async function getLastTransactionDate(
  accountId: string,
  connectionId: string
): Promise<Date | null> {
  const { data: transaction } = await supabase
    .from('transactions')
    .select('date')
    .eq('account_id', accountId)
    .eq('connection_id', connectionId)
    .order('date', { ascending: false })
    .limit(1)
    .single();

  return transaction?.date ? new Date(transaction.date) : null;
}

/**
 * Check if an account needs syncing
 */
export async function shouldSyncAccount(
  accountId: string,
  connectionId: string,
  minHoursSinceLastSync: number = MIN_SYNC_INTERVAL_HOURS
): Promise<boolean> {
  const { data: account } = await supabase
    .from('accounts')
    .select('last_synced_at, sync_enabled')
    .eq('account_id', accountId)
    .eq('connection_id', connectionId)
    .single();

  if (!account) return true; // Account doesn't exist, should sync

  // Check if sync is enabled
  if (account.sync_enabled === false) return false;

  // Check if never synced
  if (!account.last_synced_at) return true;

  // Check if enough time has passed
  const lastSyncAt = new Date(account.last_synced_at);
  const hoursSinceSync = (Date.now() - lastSyncAt.getTime()) / (60 * 60 * 1000);

  return hoursSinceSync >= minHoursSinceLastSync;
}

/**
 * Calculate sync metrics for monitoring
 */
export interface SyncMetrics {
  dateRange: SyncDateRange;
  estimatedDays: number;
  estimatedApiCalls: number;
  costOptimization: 'high' | 'medium' | 'low'; // How much we're saving vs naive approach
}

export function calculateSyncMetrics(dateRange: SyncDateRange): SyncMetrics {
  if (dateRange.skip) {
    return {
      dateRange,
      estimatedDays: 0,
      estimatedApiCalls: 0,
      costOptimization: 'high',
    };
  }

  const estimatedDays = Math.ceil(
    (dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (24 * 60 * 60 * 1000)
  );

  // Estimate API calls (assumes 1 call per 500 transactions, ~50 transactions/day average)
  const estimatedTransactions = estimatedDays * 50;
  const estimatedApiCalls = Math.ceil(estimatedTransactions / 500);

  // Compare to naive approach (always 90 days)
  const naiveApiCalls = Math.ceil((90 * 50) / 500);
  const savings = (naiveApiCalls - estimatedApiCalls) / naiveApiCalls;

  let costOptimization: 'high' | 'medium' | 'low' = 'low';
  if (savings > 0.7) costOptimization = 'high';
  else if (savings > 0.4) costOptimization = 'medium';

  return {
    dateRange,
    estimatedDays,
    estimatedApiCalls,
    costOptimization,
  };
}

/**
 * Format sync metrics for logging
 */
export function formatSyncMetrics(metrics: SyncMetrics): string {
  if (metrics.dateRange.skip) {
    return `⏭️  Skipping sync (last synced ${metrics.dateRange.daysSinceLastSync?.toFixed(1)} days ago, within throttle limit)`;
  }

  const days = metrics.estimatedDays;
  const calls = metrics.estimatedApiCalls;
  const reason = metrics.dateRange.reason.replace(/_/g, ' ');
  const optimization =
    metrics.costOptimization === 'high' ? '💰 High savings' : metrics.costOptimization === 'medium' ? '💵 Medium savings' : '💸 Standard cost';

  return `📊 Sync: ${days} days, ~${calls} API call(s), reason: ${reason} ${optimization}`;
}

/**
 * Batch create or update transactions with upsert logic
 * Handles large volumes of transactions efficiently
 */
export async function batchCreateOrUpdateTransactions(
  tenantId: string,
  connectionId: string,
  providerId: string,
  transactions: Array<{
    externalTransactionId: string;
    accountId: string;
    date: Date;
    amount: number;
    currency: string;
    description: string;
    type: 'credit' | 'debit';
    counterpartyName?: string;
    counterpartyAccount?: string;
    reference?: string;
    category?: string;
    metadata?: Record<string, any>;
  }>,
  userId: string
): Promise<{
  summary: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  errors: string[];
}> {
  if (!transactions || transactions.length === 0) {
    return {
      summary: { total: 0, created: 0, updated: 0, skipped: 0, errors: 0 },
      errors: [],
    };
  }

  console.log(`[TransactionBatch] Processing ${transactions.length} transactions for connection ${connectionId}`);

  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Process in batches of 100 to avoid overwhelming the database
  const BATCH_SIZE = 100;

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);

    try {
      // Prepare batch data for upsert
      const batchData = batch.map((tx) => ({
        tenant_id: tenantId,
        connection_id: connectionId,
        provider_id: providerId,
        transaction_id: tx.externalTransactionId,
        account_id: tx.accountId,
        date: tx.date.toISOString().split('T')[0], // Store as date string
        amount: tx.amount,
        currency: tx.currency,
        description: tx.description,
        type: tx.type,
        counterparty_name: tx.counterpartyName,
        counterparty_account: tx.counterpartyAccount,
        reference: tx.reference,
        category: (() => {
          const finalCategory = tx.category || 'Uncategorized';
          console.log(`[TransactionSync] Transaction ${tx.externalTransactionId}: final category =`, finalCategory);
          return finalCategory;
        })(),
        metadata: tx.metadata || {},
        created_by: userId,
        updated_at: new Date().toISOString(),
      }));

      // Use upsert to handle both create and update
      // Since transaction_id is the primary key (globally unique), use it for conflict resolution
      // When a transaction already exists (from a previous connection), we update it with new data
      // Note: Supabase upsert will update ALL columns on conflict, effectively overriding the existing transaction
      const { data, error } = await supabase
        .from('transactions')
        .upsert(batchData, {
          onConflict: 'transaction_id',
          ignoreDuplicates: false,
        })
        .select('transaction_id');

      if (error) {
        // If we get a duplicate key error, it means the upsert didn't work as expected
        // This can happen if Supabase's upsert doesn't properly handle primary key conflicts
        // In this case, we'll update existing transactions individually
        if (error.code === '23505' && error.message.includes('transactions_pkey')) {
          console.warn(`[TransactionBatch] Batch ${Math.floor(i / BATCH_SIZE) + 1} has duplicate transactions, updating individually...`);
          
          // Update each transaction individually to override existing data
          for (const txData of batchData) {
            const { error: updateError } = await supabase
              .from('transactions')
              .update({
                tenant_id: txData.tenant_id,
                connection_id: txData.connection_id,
                provider_id: txData.provider_id,
                account_id: txData.account_id,
                date: txData.date,
                amount: txData.amount,
                currency: txData.currency,
                description: txData.description,
                type: txData.type,
                counterparty_name: txData.counterparty_name,
                counterparty_account: txData.counterparty_account,
                reference: txData.reference,
                category: txData.category,
                metadata: txData.metadata,
                created_by: txData.created_by,
                updated_at: txData.updated_at,
              })
              .eq('transaction_id', txData.transaction_id);
            
            if (updateError) {
              // If update fails (transaction doesn't exist), try insert
              const { error: insertError } = await supabase
                .from('transactions')
                .insert(txData);
              
              if (insertError) {
                console.error(`[TransactionBatch] Failed to upsert transaction ${txData.transaction_id}:`, insertError);
                errors.push(`Transaction ${txData.transaction_id}: ${insertError.message}`);
              } else {
                created++;
              }
            } else {
              updated++;
            }
          }
          continue;
        }
        
        console.error(`[TransactionBatch] Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error);
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
        continue;
      }

      // Count created vs updated (approximate)
      // In a real implementation, you'd check the actual database response
      created += data?.length || 0;

    } catch (batchError) {
      console.error(`[TransactionBatch] Batch ${Math.floor(i / BATCH_SIZE) + 1} exception:`, batchError);
      errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchError instanceof Error ? batchError.message : String(batchError)}`);
    }
  }

  const summary = {
    total: transactions.length,
    created,
    updated, // Would need more complex logic to determine this
    skipped,
    errors: errors.length,
  };

  console.log(`[TransactionBatch] Completed: ${summary.created} created, ${summary.updated} updated, ${summary.errors} errors`);

  return {
    summary,
    errors,
  };
}

