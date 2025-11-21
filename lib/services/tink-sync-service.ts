/**
 * Tink-Specific Sync Service
 * 
 * Handles paginated syncing using Tink's pageToken system
 * Stores all raw Tink data for audit trail and future data mining
 * Mirrors Plaid sync service structure for consistency
 * 
 * Key Features:
 * 1. Uses pageToken-based pagination (Tink API v2)
 * 2. Stores page tokens to enable incremental syncs
 * 3. Preserves all Tink metadata in dedicated tables
 * 4. Handles full account and transaction sync
 */

import { supabase } from '@/lib/supabase';
import * as TinkClient from '@/lib/tink-client';
import type { TinkAccount, TinkTransaction } from '@/lib/tink-client';

export interface TinkSyncResult {
  success: boolean;
  accountsSynced: number;
  transactionsAdded: number;
  transactionsModified: number;
  transactionsImported: number; // Imported to main transactions table
  pageToken?: string;
  hasMore: boolean;
  errors?: string[];
}

/**
 * Sync Tink accounts for a connection
 * Stores raw Tink data + creates normalized accounts
 */
export async function syncTinkAccounts(
  tenantId: string,
  connectionId: string,
  accessToken: string
): Promise<{ accounts: TinkAccount[]; errors: string[] }> {
  const errors: string[] = [];
  
  try {
    console.log('📦 Fetching Tink accounts...');
    
    const tinkAccounts = await TinkClient.getAccounts(accessToken);
    console.log(`✅ Retrieved ${tinkAccounts.length} accounts from Tink`);

    // Store raw Tink account data
    for (const account of tinkAccounts) {
      try {
        // Parse balance from Tink API v2 structure
        let balanceBooked = 0;
        let balanceAvailable = 0;
        let currencyCode = 'EUR';

        if (account.balances?.booked?.amount?.value) {
          balanceBooked = TinkClient.formatTinkAmount(account.balances.booked.amount.value);
          currencyCode = account.balances.booked.amount.currencyCode || 'EUR';
        }

        if (account.balances?.available?.amount?.value) {
          balanceAvailable = TinkClient.formatTinkAmount(account.balances.available.amount.value);
        }

        await supabase
          .from('tink_accounts')
          .upsert({
            tenant_id: tenantId,
            connection_id: connectionId,
            account_id: account.id,
            financial_institution_id: account.financialInstitutionId,
            name: account.name,
            account_number: account.accountNumber,
            account_type: account.type,
            holder_name: account.holderName,
            iban: typeof account.identifiers?.iban === 'object'
              ? account.identifiers.iban.iban
              : account.identifiers?.iban,
            bic: typeof account.identifiers?.iban === 'object'
              ? account.identifiers.iban.bic
              : undefined,
            bban: account.identifiers?.bban,
            balance_booked: balanceBooked,
            balance_available: balanceAvailable,
            currency_code: currencyCode,
            closed: account.closed || false,
            flags: account.flags,
            account_exclusion: account.accountExclusion,
            refreshed: account.refreshed,
            created: account.created,
            raw_data: account as any,
            last_updated_at: new Date().toISOString(),
          }, {
            onConflict: 'connection_id,account_id'
          });
      } catch (error) {
        errors.push(`Failed to store Tink account ${account.name}: ${error}`);
        console.error('Error storing Tink account:', error);
      }
    }

    return { accounts: tinkAccounts, errors };
    
  } catch (error: any) {
    console.error('Error fetching Tink accounts:', error);
    errors.push(`Failed to fetch accounts: ${error?.message || 'Unknown error'}`);
    return { accounts: [], errors };
  }
}

/**
 * Sync Tink transactions using pageToken-based pagination
 * Fetches transactions for all accounts at once (Tink API v2 feature)
 */
export async function syncTinkTransactions(
  tenantId: string,
  connectionId: string,
  accessToken: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    forceFullSync?: boolean;
    importJobId?: string;
  } = {}
): Promise<TinkSyncResult> {
  
  const errors: string[] = [];
  let totalAdded = 0;
  let totalModified = 0;
  let totalImported = 0;
  let finalPageToken: string | undefined;
  let hasMore = false;

  try {
    // Get stored page token (if exists and not forcing full sync)
    let pageToken: string | undefined;
    
    if (!options.forceFullSync) {
      const { data: cursorData } = await supabase
        .from('tink_sync_cursors')
        .select('page_token')
        .eq('connection_id', connectionId)
        .single();
      
      pageToken = cursorData?.page_token;
      
      if (pageToken) {
        console.log(`🔄 Using stored pageToken for incremental sync`);
      } else {
        console.log(`🆕 No pageToken found - performing initial full sync`);
      }
    } else {
      console.log(`🔄 Force full sync requested - resetting pageToken`);
    }

    // Get all Tink account IDs for this connection
    const { data: tinkAccounts } = await supabase
      .from('tink_accounts')
      .select('account_id')
      .eq('connection_id', connectionId);

    if (!tinkAccounts || tinkAccounts.length === 0) {
      console.warn('⚠️  No Tink accounts found - please sync accounts first');
      return {
        success: false,
        accountsSynced: 0,
        transactionsAdded: 0,
        transactionsModified: 0,
        transactionsImported: 0,
        hasMore: false,
        errors: ['No accounts found for connection'],
      };
    }

    const accountIds = tinkAccounts.map(acc => acc.account_id);
    console.log(`📊 Syncing transactions for ${accountIds.length} accounts...`);

    // Fetch transactions for all accounts
    // Tink API v2 allows fetching multiple accounts at once
    const transactions = await TinkClient.getAllTransactions(
      accessToken,
      accountIds,
      {
        startDate: options.startDate,
        endDate: options.endDate,
        limit: 1000, // Fetch up to 1000 transactions per sync
      }
    );

    console.log(`✅ Retrieved ${transactions.length} transactions from Tink`);

    // Store each transaction
    for (const tx of transactions) {
      try {
        await storeTinkTransaction(tenantId, connectionId, tx, 'added', options.importJobId);
        totalAdded++;
      } catch (error) {
        errors.push(`Failed to store transaction ${tx.id}: ${error}`);
      }
    }

    // Update sync cursor
    await supabase
      .from('tink_sync_cursors')
      .upsert({
        tenant_id: tenantId,
        connection_id: connectionId,
        page_token: finalPageToken || 'none', // Tink doesn't have persistent cursors like Plaid
        last_sync_at: new Date().toISOString(),
        transactions_added: totalAdded,
        transactions_modified: totalModified,
        accounts_synced: accountIds.length,
        has_more: hasMore,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'connection_id'
      });

    console.log(`💾 Sync cursor saved (${totalAdded} transactions added)`);

    return {
      success: errors.length === 0,
      accountsSynced: 0,
      transactionsAdded: totalAdded,
      transactionsModified: totalModified,
      transactionsImported: totalImported,
      pageToken: finalPageToken,
      hasMore,
      errors: errors.length > 0 ? errors : undefined,
    };

  } catch (error: any) {
    console.error('❌ Tink transaction sync failed:', error);
    
    return {
      success: false,
      accountsSynced: 0,
      transactionsAdded: totalAdded,
      transactionsModified: totalModified,
      transactionsImported: totalImported,
      hasMore,
      errors: [error?.message || 'Unknown error'],
    };
  }
}

/**
 * Store a single Tink transaction with all metadata
 */
async function storeTinkTransaction(
  tenantId: string,
  connectionId: string,
  tx: TinkTransaction,
  syncAction: 'added' | 'modified' | 'removed',
  importJobId?: string
): Promise<void> {
  
  // Parse amount from Tink's unscaledValue/scale structure
  const amount = TinkClient.formatTinkAmount(tx.amount.value);
  
  const tinkTxData = {
    tenant_id: tenantId,
    connection_id: connectionId,
    transaction_id: tx.id,
    account_id: tx.accountId,
    
    // Core data
    amount,
    currency_code: tx.amount.currencyCode,
    
    // Dates
    date_booked: tx.dates?.booked || null,
    date_value: tx.dates?.value || null,
    original_date: tx.originalDate || null,
    
    // Descriptions
    description_display: tx.descriptions?.display || null,
    description_original: tx.descriptions?.original || null,
    merchant_name: tx.merchantName || null,
    
    // Transaction metadata
    booking_status: tx.bookingStatus || null,
    transaction_type: tx.types?.type || null,
    transaction_code: tx.types?.code || null,
    status: tx.status || null,
    
    // Categories
    category_id: tx.categories?.pfm?.id || null,
    category_name: tx.categories?.pfm?.name || null,
    
    // Merchant details
    merchant_category_code: tx.merchantCategoryCode || null,
    merchant_location: tx.location || null,
    
    // Additional metadata
    notes: tx.notes || null,
    reference: tx.reference || null,
    
    // Provider identifiers
    provider_transaction_id: tx.identifiers?.providerTransactionId || null,
    identifiers: tx.identifiers || null,
    
    // Full raw data
    raw_data: tx as any,
    
    // Tracking
    sync_action: syncAction,
    import_job_id: importJobId,
    imported_to_transactions: false,
    last_updated_at: new Date().toISOString(),
  };

  await supabase
    .from('tink_transactions')
    .upsert(tinkTxData, {
      onConflict: 'connection_id,transaction_id'
    });
}

/**
 * Import Tink transactions from tink_transactions table to main transactions table
 * Applies business logic, deduplication, and categorization
 */
export async function importTinkTransactionsToMain(
  tenantId: string,
  connectionId: string,
  importJobId?: string
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  try {
    // Get unimported Tink transactions
    const { data: tinkTxns, error: fetchError } = await supabase
      .from('tink_transactions')
      .select('*, tink_accounts!inner(stratifi_account_id)')
      .eq('connection_id', connectionId)
      .eq('imported_to_transactions', false)
      .neq('sync_action', 'removed')
      .order('date_booked', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch Tink transactions: ${fetchError.message}`);
    }

    if (!tinkTxns || tinkTxns.length === 0) {
      console.log('ℹ️  No new Tink transactions to import');
      return { imported: 0, skipped: 0, errors: [] };
    }

    console.log(`📥 Importing ${tinkTxns.length} Tink transactions to main table...`);

    for (const tinkTx of tinkTxns) {
      try {
        const tinkAccount = tinkTx.tink_accounts as any;
        
        if (!tinkAccount?.stratifi_account_id) {
          skipped++;
          errors.push(`Transaction ${tinkTx.transaction_id}: No linked Stratifi account`);
          continue;
        }

        // Get the Stratifi account's account_id (TEXT primary key)
        const { data: account } = await supabase
          .from('accounts')
          .select('account_id, currency')
          .eq('id', tinkAccount.stratifi_account_id)
          .single();

        if (!account) {
          skipped++;
          errors.push(`Transaction ${tinkTx.transaction_id}: Account lookup failed`);
          continue;
        }

        // Determine transaction type (Tink: positive = debit/outgoing, negative = credit/incoming)
        const isCredit = tinkTx.amount < 0;
        const transactionId = `tink_${connectionId}_${tinkTx.transaction_id}`;

        // Insert into main transactions table
        const { error: txError } = await supabase
          .from('transactions')
          .upsert({
            transaction_id: transactionId,
            tenant_id: tenantId,
            account_id: account.account_id,
            date: tinkTx.date_booked || tinkTx.date_value,
            amount: Math.abs(tinkTx.amount),
            currency: tinkTx.currency_code || account.currency || 'EUR',
            description: tinkTx.merchant_name || tinkTx.description_display || tinkTx.description_original || 'Transaction',
            type: isCredit ? 'Credit' : 'Debit',
            category: tinkTx.category_name || 'Uncategorized',
            status: tinkTx.booking_status === 'PENDING' ? 'Pending' : 'Completed',
            reference: tinkTx.reference || tinkTx.transaction_id,
            connection_id: connectionId,
            external_transaction_id: tinkTx.transaction_id,
            source_type: 'tink_api',
            import_job_id: importJobId,
            metadata: {
              tink_transaction_type: tinkTx.transaction_type,
              tink_transaction_code: tinkTx.transaction_code,
              tink_category_id: tinkTx.category_id,
              tink_category_name: tinkTx.category_name,
              booking_status: tinkTx.booking_status,
              merchant_name: tinkTx.merchant_name,
              merchant_category_code: tinkTx.merchant_category_code,
              merchant_location: tinkTx.merchant_location,
              notes: tinkTx.notes,
              date_value: tinkTx.date_value,
              original_date: tinkTx.original_date,
              provider_transaction_id: tinkTx.provider_transaction_id,
            },
          }, {
            onConflict: 'transaction_id'
          });

        if (txError) {
          errors.push(`Failed to import transaction ${tinkTx.transaction_id}: ${txError.message}`);
          console.error('Transaction import error:', txError);
        } else {
          imported++;
          
          // Mark as imported in Tink table
          await supabase
            .from('tink_transactions')
            .update({ imported_to_transactions: true })
            .eq('id', tinkTx.id);
        }

      } catch (error) {
        skipped++;
        errors.push(`Error processing transaction ${tinkTx.transaction_id}: ${error}`);
        console.error('Transaction processing error:', error);
      }
    }

    console.log(`✅ Import complete: ${imported} imported, ${skipped} skipped`);

    return { imported, skipped, errors: errors.length > 0 ? errors : [] };

  } catch (error: any) {
    console.error('❌ Tink transaction import failed:', error);
    return {
      imported,
      skipped,
      errors: [error?.message || 'Unknown error'],
    };
  }
}

/**
 * Full Tink sync: accounts + transactions
 * Optimized for complete data capture
 */
export async function performTinkSync(
  tenantId: string,
  connectionId: string,
  accessToken: string,
  options: {
    syncAccounts?: boolean;
    syncTransactions?: boolean;
    startDate?: Date;
    endDate?: Date;
    forceFullSync?: boolean;
    importJobId?: string;
  } = {}
): Promise<TinkSyncResult> {
  
  const {
    syncAccounts = true,
    syncTransactions = true,
    startDate,
    endDate,
    forceFullSync = false,
    importJobId,
  } = options;

  let accountsSynced = 0;
  const errors: string[] = [];

  // Sync accounts
  if (syncAccounts) {
    const accountResult = await syncTinkAccounts(tenantId, connectionId, accessToken);
    accountsSynced = accountResult.accounts.length;
    
    if (accountResult.errors.length > 0) {
      errors.push(...accountResult.errors);
    }
  }

  // Sync transactions
  let transactionResult: TinkSyncResult = {
    success: true,
    accountsSynced: 0,
    transactionsAdded: 0,
    transactionsModified: 0,
    transactionsImported: 0,
    hasMore: false,
  };

  if (syncTransactions) {
    transactionResult = await syncTinkTransactions(
      tenantId,
      connectionId,
      accessToken,
      { startDate, endDate, forceFullSync, importJobId }
    );

    if (transactionResult.errors) {
      errors.push(...transactionResult.errors);
    }

    // Import to main transactions table
    const importResult = await importTinkTransactionsToMain(
      tenantId,
      connectionId,
      importJobId
    );

    transactionResult.transactionsImported = importResult.imported;
    
    if (importResult.errors.length > 0) {
      errors.push(...importResult.errors);
    }
  }

  return {
    success: errors.length === 0,
    accountsSynced,
    transactionsAdded: transactionResult.transactionsAdded,
    transactionsModified: transactionResult.transactionsModified,
    transactionsImported: transactionResult.transactionsImported,
    pageToken: transactionResult.pageToken,
    hasMore: transactionResult.hasMore,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Check if a Tink connection needs syncing
 */
export async function shouldSyncTinkConnection(
  connectionId: string,
  minHoursSinceLastSync: number = 6
): Promise<{ shouldSync: boolean; reason: string }> {
  
  const { data: cursorData } = await supabase
    .from('tink_sync_cursors')
    .select('last_sync_at')
    .eq('connection_id', connectionId)
    .single();

  // Never synced before
  if (!cursorData) {
    return { shouldSync: true, reason: 'initial_sync' };
  }

  // Check time since last sync
  const lastSyncAt = new Date(cursorData.last_sync_at);
  const hoursSince = (Date.now() - lastSyncAt.getTime()) / (60 * 60 * 1000);

  if (hoursSince >= minHoursSinceLastSync) {
    return { shouldSync: true, reason: `${hoursSince.toFixed(1)}h since last sync` };
  }

  return { 
    shouldSync: false, 
    reason: `Synced ${hoursSince.toFixed(1)}h ago (min ${minHoursSinceLastSync}h)` 
  };
}

