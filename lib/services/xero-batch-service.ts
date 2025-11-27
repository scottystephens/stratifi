/**
 * Xero Batch Service
 *
 * Provides optimized batch operations for Xero data processing.
 * Xero supports batch operations for certain endpoints with up to 50 items per request.
 */

import { supabase } from '@/lib/supabase';
import type { ProviderTransaction, ProviderAccount } from '@/lib/banking-providers/base-provider';

/**
 * Parse Xero's date format: "/Date(1757808000000+0000)/" or ISO string
 * Returns ISO date string for PostgreSQL
 */
function parseXeroDate(dateValue: string | null | undefined): string | null {
  if (!dateValue) return null;
  
  // Handle Xero's /Date(timestamp)/ format
  const timestampMatch = dateValue.match(/\/Date\((\d+)([+-]\d{4})?\)\//);
  if (timestampMatch) {
    const timestamp = parseInt(timestampMatch[1], 10);
    return new Date(timestamp).toISOString().split('T')[0]; // Return YYYY-MM-DD
  }
  
  // Handle ISO string format
  try {
    const parsed = new Date(dateValue);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0]; // Return YYYY-MM-DD
    }
  } catch {
    // Fall through to return null
  }
  
  return null;
}

// =====================================================
// Configuration
// =====================================================

const BATCH_CONFIG = {
  // Xero recommends max 50 items per batch request
  XERO_API_BATCH_SIZE: 50,
  // Database batch size for upserts
  DB_BATCH_SIZE: 100,
  // Max concurrent database operations
  MAX_CONCURRENT_DB_OPS: 3,
  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
};

// =====================================================
// Types
// =====================================================

export interface BatchProcessingResult<T> {
  success: boolean;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  errors: Array<{ item: T; error: string }>;
  duration: number;
}

export interface XeroBatchStats {
  totalAccounts: number;
  totalTransactions: number;
  batchesProcessed: number;
  averageBatchTime: number;
  errors: string[];
}

// =====================================================
// Account Batch Processing
// =====================================================

/**
 * Process Xero accounts in optimized batches
 */
export async function batchProcessXeroAccounts(
  connectionId: string,
  tenantId: string,
  xeroTenantId: string,
  accounts: any[]
): Promise<BatchProcessingResult<any>> {
  const startTime = Date.now();
  const errors: Array<{ item: any; error: string }> = [];
  let created = 0;
  let updated = 0;

  console.log(`[XeroBatch] Processing ${accounts.length} accounts in batches...`);

  // Process in database-optimized batches
  for (let i = 0; i < accounts.length; i += BATCH_CONFIG.DB_BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_CONFIG.DB_BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_CONFIG.DB_BATCH_SIZE) + 1;

    try {
      const records = batch.map((account) => ({
        tenant_id: tenantId,
        connection_id: connectionId,
        account_id: account.AccountID,
        xero_tenant_id: xeroTenantId,
        raw_account_data: account,
        first_fetched_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      }));

      const { data, error } = await supabase
        .from('xero_accounts')
        .upsert(records, {
          onConflict: 'connection_id,account_id',
          ignoreDuplicates: false,
        })
        .select('id');

      if (error) {
        console.error(`[XeroBatch] Batch ${batchNum} error:`, error);
        batch.forEach((item) => errors.push({ item, error: error.message }));
        continue;
      }

      // Approximate created vs updated
      created += data?.length || batch.length;
      console.log(`[XeroBatch] Batch ${batchNum} complete: ${batch.length} accounts`);
    } catch (batchError) {
      const errorMsg = batchError instanceof Error ? batchError.message : 'Unknown error';
      console.error(`[XeroBatch] Batch ${batchNum} failed:`, errorMsg);
      batch.forEach((item) => errors.push({ item, error: errorMsg }));
    }
  }

  return {
    success: errors.length === 0,
    processed: accounts.length,
    created,
    updated: 0, // Upsert doesn't distinguish
    failed: errors.length,
    errors,
    duration: Date.now() - startTime,
  };
}

// =====================================================
// Transaction Batch Processing
// =====================================================

/**
 * Process Xero transactions in optimized batches
 */
export async function batchProcessXeroTransactions(
  connectionId: string,
  tenantId: string,
  xeroTenantId: string,
  transactions: any[],
  accountId: string
): Promise<BatchProcessingResult<any>> {
  const startTime = Date.now();
  const errors: Array<{ item: any; error: string }> = [];
  let created = 0;
  let updated = 0;

  console.log(`[XeroBatch] Processing ${transactions.length} transactions for account ${accountId}...`);

  // Process in database-optimized batches
  for (let i = 0; i < transactions.length; i += BATCH_CONFIG.DB_BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_CONFIG.DB_BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_CONFIG.DB_BATCH_SIZE) + 1;

    try {
      const records = batch.map((tx) => ({
        tenant_id: tenantId,
        connection_id: connectionId,
        transaction_id: tx.BankTransactionID,
        xero_tenant_id: xeroTenantId,
        account_id: accountId,
        raw_transaction_data: tx,
        amount: parseXeroAmount(tx),
        date: parseXeroDate(tx.Date) || parseXeroDate(tx.DateString),  // Parse Xero's /Date(timestamp)/ format
        currency: tx.CurrencyCode || 'USD',
        first_fetched_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      }));

      const { data, error } = await supabase
        .from('xero_transactions')
        .upsert(records, {
          onConflict: 'connection_id,transaction_id',
          ignoreDuplicates: false,
        })
        .select('id');

      if (error) {
        console.error(`[XeroBatch] Transaction batch ${batchNum} error:`, error);
        batch.forEach((item) => errors.push({ item, error: error.message }));
        continue;
      }

      created += data?.length || batch.length;
      console.log(`[XeroBatch] Transaction batch ${batchNum} complete: ${batch.length} transactions`);
    } catch (batchError) {
      const errorMsg = batchError instanceof Error ? batchError.message : 'Unknown error';
      console.error(`[XeroBatch] Transaction batch ${batchNum} failed:`, errorMsg);
      batch.forEach((item) => errors.push({ item, error: errorMsg }));
    }
  }

  return {
    success: errors.length === 0,
    processed: transactions.length,
    created,
    updated: 0,
    failed: errors.length,
    errors,
    duration: Date.now() - startTime,
  };
}

// =====================================================
// Parallel Batch Processing
// =====================================================

/**
 * Process multiple accounts' transactions in parallel with controlled concurrency
 */
export async function parallelBatchProcessTransactions(
  connectionId: string,
  tenantId: string,
  xeroTenantId: string,
  transactionsByAccount: Map<string, any[]>
): Promise<{
  totalProcessed: number;
  totalCreated: number;
  totalFailed: number;
  accountResults: Map<string, BatchProcessingResult<any>>;
  duration: number;
}> {
  const startTime = Date.now();
  const accountResults = new Map<string, BatchProcessingResult<any>>();
  let totalProcessed = 0;
  let totalCreated = 0;
  let totalFailed = 0;

  const accounts = Array.from(transactionsByAccount.entries());
  console.log(`[XeroBatch] Processing transactions for ${accounts.length} accounts in parallel...`);

  // Process accounts in parallel with controlled concurrency
  for (let i = 0; i < accounts.length; i += BATCH_CONFIG.MAX_CONCURRENT_DB_OPS) {
    const batch = accounts.slice(i, i + BATCH_CONFIG.MAX_CONCURRENT_DB_OPS);

    const results = await Promise.all(
      batch.map(async ([accountId, transactions]) => {
        const result = await batchProcessXeroTransactions(
          connectionId,
          tenantId,
          xeroTenantId,
          transactions,
          accountId
        );
        return { accountId, result };
      })
    );

    for (const { accountId, result } of results) {
      accountResults.set(accountId, result);
      totalProcessed += result.processed;
      totalCreated += result.created;
      totalFailed += result.failed;
    }
  }

  return {
    totalProcessed,
    totalCreated,
    totalFailed,
    accountResults,
    duration: Date.now() - startTime,
  };
}

// =====================================================
// Batch Statistics
// =====================================================

/**
 * Get batch processing statistics for a connection
 */
export async function getXeroBatchStats(connectionId: string): Promise<XeroBatchStats> {
  const [accountsResult, transactionsResult] = await Promise.all([
    supabase
      .from('xero_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('connection_id', connectionId),
    supabase
      .from('xero_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('connection_id', connectionId),
  ]);

  return {
    totalAccounts: accountsResult.count || 0,
    totalTransactions: transactionsResult.count || 0,
    batchesProcessed: 0, // Would need to track this separately
    averageBatchTime: 0,
    errors: [],
  };
}

// =====================================================
// Chunked Processing for Large Datasets
// =====================================================

/**
 * Process very large datasets in chunks with progress tracking
 */
export async function processLargeDataset<T>(
  items: T[],
  processor: (batch: T[]) => Promise<{ success: boolean; processed: number; errors: string[] }>,
  options: {
    batchSize?: number;
    onProgress?: (processed: number, total: number) => void;
    onBatchComplete?: (batchNum: number, result: { success: boolean; processed: number }) => void;
  } = {}
): Promise<{
  success: boolean;
  totalProcessed: number;
  totalBatches: number;
  errors: string[];
  duration: number;
}> {
  const startTime = Date.now();
  const batchSize = options.batchSize || BATCH_CONFIG.DB_BATCH_SIZE;
  const errors: string[] = [];
  let totalProcessed = 0;
  let batchNum = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    batchNum++;

    try {
      const result = await processor(batch);

      if (!result.success) {
        errors.push(...result.errors);
      }

      totalProcessed += result.processed;

      if (options.onBatchComplete) {
        options.onBatchComplete(batchNum, result);
      }

      if (options.onProgress) {
        options.onProgress(totalProcessed, items.length);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Batch ${batchNum}: ${errorMsg}`);
    }
  }

  return {
    success: errors.length === 0,
    totalProcessed,
    totalBatches: batchNum,
    errors,
    duration: Date.now() - startTime,
  };
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Parse Xero amount from transaction
 */
function parseXeroAmount(transaction: any): number {
  // Xero stores amounts in LineItems
  if (transaction.LineItems && transaction.LineItems.length > 0) {
    return transaction.LineItems.reduce(
      (sum: number, item: any) => sum + (parseFloat(item.LineAmount) || 0),
      0
    );
  }

  // Fallback to SubTotal or Total
  if (transaction.SubTotal !== undefined) {
    return parseFloat(transaction.SubTotal) || 0;
  }

  if (transaction.Total !== undefined) {
    return parseFloat(transaction.Total) || 0;
  }

  return 0;
}

/**
 * Retry a batch operation with exponential backoff
 */
export async function retryBatchOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = BATCH_CONFIG.MAX_RETRIES,
  initialDelay: number = BATCH_CONFIG.RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt - 1);
        console.log(`[XeroBatch] Retry ${attempt}/${maxRetries} after ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Batch operation failed after retries');
}

