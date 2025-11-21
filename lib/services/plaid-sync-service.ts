/**
 * Plaid-Specific Sync Service
 * 
 * Handles cursor-based incremental syncing to minimize API costs
 * Stores all raw Plaid data for audit trail and future data mining
 * 
 * Key Optimizations:
 * 1. Uses cursor-based pagination (not date ranges)
 * 2. Stores cursor to fetch only deltas on subsequent syncs
 * 3. Preserves all Plaid metadata in dedicated tables
 * 4. Handles added/modified/removed transactions
 */

import { supabase } from '@/lib/supabase';
import { plaidClient } from '@/lib/plaid';
import type { Transaction as PlaidTransaction, AccountBase as PlaidAccount } from 'plaid';

export interface PlaidSyncResult {
  success: boolean;
  accountsSynced: number;
  transactionsAdded: number;
  transactionsModified: number;
  transactionsRemoved: number;
  transactionsImported: number; // Imported to main transactions table
  cursor: string;
  hasMore: boolean;
  errors?: string[];
}

/**
 * Sync Plaid accounts for a connection
 * Stores raw Plaid data + creates normalized accounts
 */
export async function syncPlaidAccounts(
  tenantId: string,
  connectionId: string,
  accessToken: string
): Promise<{ accounts: PlaidAccount[]; errors: string[] }> {
  const errors: string[] = [];
  
  try {
    console.log('📦 Fetching Plaid accounts...');
    
    const response = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const plaidAccounts = response.data.accounts;
    console.log(`✅ Retrieved ${plaidAccounts.length} accounts from Plaid`);

    // Store raw Plaid account data
    for (const account of plaidAccounts) {
      try {
        await supabase
          .from('plaid_accounts')
          .upsert({
            tenant_id: tenantId,
            connection_id: connectionId,
            account_id: account.account_id,
            item_id: response.data.item.item_id,
            name: account.name,
            official_name: account.official_name,
            mask: account.mask,
            type: account.type,
            subtype: account.subtype,
            available: account.balances.available,
            current: account.balances.current,
            limit_amount: account.balances.limit,
            iso_currency_code: account.balances.iso_currency_code,
            unofficial_currency_code: account.balances.unofficial_currency_code,
            verification_status: account.verification_status,
            raw_data: account as any,
            last_updated_at: new Date().toISOString(),
          }, {
            onConflict: 'connection_id,account_id'
          });
      } catch (error) {
        errors.push(`Failed to store Plaid account ${account.name}: ${error}`);
        console.error('Error storing Plaid account:', error);
      }
    }

    return { accounts: plaidAccounts, errors };
    
  } catch (error: any) {
    console.error('Error fetching Plaid accounts:', error);
    errors.push(`Failed to fetch accounts: ${error?.message || 'Unknown error'}`);
    return { accounts: [], errors };
  }
}

/**
 * Sync Plaid transactions using cursor-based incremental updates
 * This is the KEY optimization - only fetches deltas, not full history
 */
export async function syncPlaidTransactions(
  tenantId: string,
  connectionId: string,
  accessToken: string,
  options: {
    forceFullSync?: boolean; // Reset cursor and fetch all
    importJobId?: string;
  } = {}
): Promise<PlaidSyncResult> {
  
  const errors: string[] = [];
  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;
  let totalImported = 0;
  let finalCursor = '';
  let hasMore = false;

  try {
    // Get the stored cursor (if exists and not forcing full sync)
    let cursor: string | undefined;
    
    if (!options.forceFullSync) {
      const { data: cursorData } = await supabase
        .from('plaid_sync_cursors')
        .select('cursor')
        .eq('connection_id', connectionId)
        .single();
      
      cursor = cursorData?.cursor;
      
      if (cursor) {
        console.log(`🔄 Using stored cursor for incremental sync (cursor: ${cursor.substring(0, 20)}...)`);
      } else {
        console.log(`🆕 No cursor found - performing initial full sync`);
      }
    } else {
      console.log(`🔄 Force full sync requested - resetting cursor`);
    }

    // Pagination loop - keep fetching while has_more is true
    let currentCursor = cursor;
    let pageCount = 0;
    
    do {
      pageCount++;
      console.log(`📄 Fetching page ${pageCount} from Plaid /transactions/sync...`);
      
      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor: currentCursor,
        options: {
          include_personal_finance_category: true,
        }
      });

      const { added, modified, removed, has_more, next_cursor } = response.data;
      
      console.log(`📊 Plaid sync page ${pageCount}:`, {
        added: added.length,
        modified: modified.length,
        removed: removed.length,
        hasMore: has_more,
      });

      // Process added transactions
      for (const tx of added) {
        try {
          await storePlaidTransaction(tenantId, connectionId, tx, 'added', options.importJobId);
          totalAdded++;
        } catch (error) {
          errors.push(`Failed to store added transaction ${tx.transaction_id}: ${error}`);
        }
      }

      // Process modified transactions
      for (const tx of modified) {
        try {
          await storePlaidTransaction(tenantId, connectionId, tx, 'modified', options.importJobId);
          totalModified++;
        } catch (error) {
          errors.push(`Failed to store modified transaction ${tx.transaction_id}: ${error}`);
        }
      }

      // Process removed transactions
      for (const txId of removed) {
        try {
          await supabase
            .from('plaid_transactions')
            .update({
              sync_action: 'removed',
              removed_at: new Date().toISOString(),
              last_updated_at: new Date().toISOString(),
            })
            .eq('connection_id', connectionId)
            .eq('transaction_id', txId.transaction_id);
          
          totalRemoved++;
        } catch (error) {
          errors.push(`Failed to mark transaction as removed ${txId.transaction_id}: ${error}`);
        }
      }

      // Update loop variables
      currentCursor = next_cursor;
      finalCursor = next_cursor;
      hasMore = has_more;
      
      // Safety check - prevent infinite loops
      if (pageCount > 100) {
        console.error('⚠️  Pagination exceeded 100 pages - stopping to prevent infinite loop');
        errors.push('Pagination limit exceeded');
        break;
      }
      
    } while (hasMore);

    console.log(`✅ Plaid sync complete: ${pageCount} page(s) fetched`);

    // Store the final cursor for next incremental sync
    await supabase
      .from('plaid_sync_cursors')
      .upsert({
        tenant_id: tenantId,
        connection_id: connectionId,
        cursor: finalCursor,
        last_sync_at: new Date().toISOString(),
        transactions_added: totalAdded,
        transactions_modified: totalModified,
        transactions_removed: totalRemoved,
        has_more: hasMore,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'connection_id'
      });

    console.log(`💾 Cursor saved: ${finalCursor.substring(0, 20)}... (next sync will be incremental)`);

    return {
      success: errors.length === 0,
      accountsSynced: 0, // Accounts are synced separately
      transactionsAdded: totalAdded,
      transactionsModified: totalModified,
      transactionsRemoved: totalRemoved,
      transactionsImported: totalImported,
      cursor: finalCursor,
      hasMore,
      errors: errors.length > 0 ? errors : undefined,
    };

  } catch (error: any) {
    console.error('❌ Plaid transaction sync failed:', error);
    
    return {
      success: false,
      accountsSynced: 0,
      transactionsAdded: totalAdded,
      transactionsModified: totalModified,
      transactionsRemoved: totalRemoved,
      transactionsImported: totalImported,
      cursor: finalCursor,
      hasMore,
      errors: [error?.message || 'Unknown error'],
    };
  }
}

/**
 * Store a single Plaid transaction with all metadata
 */
async function storePlaidTransaction(
  tenantId: string,
  connectionId: string,
  tx: PlaidTransaction,
  syncAction: 'added' | 'modified' | 'removed',
  importJobId?: string
): Promise<void> {
  
  const plaidTxData = {
    tenant_id: tenantId,
    connection_id: connectionId,
    transaction_id: tx.transaction_id,
    account_id: tx.account_id,
    
    // Core data
    amount: tx.amount,
    iso_currency_code: tx.iso_currency_code,
    unofficial_currency_code: tx.unofficial_currency_code,
    date: tx.date,
    authorized_date: tx.authorized_date,
    datetime: tx.datetime,
    
    // Descriptions
    name: tx.name,
    merchant_name: tx.merchant_name,
    original_description: tx.original_description,
    
    // Transaction metadata
    pending: tx.pending,
    pending_transaction_id: tx.pending_transaction_id,
    transaction_type: tx.transaction_type,
    transaction_code: tx.transaction_code,
    payment_channel: tx.payment_channel,
    
    // Categories
    category: tx.category,
    category_id: tx.category_id,
    
    // Personal Finance Category
    personal_finance_category_primary: tx.personal_finance_category?.primary,
    personal_finance_category_detailed: tx.personal_finance_category?.detailed,
    personal_finance_category_confidence_level: tx.personal_finance_category?.confidence_level,
    
    // Location
    location_address: tx.location?.address,
    location_city: tx.location?.city,
    location_region: tx.location?.region,
    location_postal_code: tx.location?.postal_code,
    location_country: tx.location?.country,
    location_lat: tx.location?.lat,
    location_lon: tx.location?.lon,
    location_store_number: tx.location?.store_number,
    
    // Payment metadata
    payment_meta_reference_number: tx.payment_meta?.reference_number,
    payment_meta_ppd_id: tx.payment_meta?.ppd_id,
    payment_meta_payee: tx.payment_meta?.payee,
    payment_meta_by_order_of: tx.payment_meta?.by_order_of,
    payment_meta_payer: tx.payment_meta?.payer,
    payment_meta_payment_method: tx.payment_meta?.payment_method,
    payment_meta_payment_processor: tx.payment_meta?.payment_processor,
    payment_meta_reason: tx.payment_meta?.reason,
    
    // Counterparty (new in Plaid API)
    counterparty_name: (tx as any).counterparties?.[0]?.name,
    counterparty_type: (tx as any).counterparties?.[0]?.type,
    counterparty_logo_url: (tx as any).counterparties?.[0]?.logo_url,
    counterparty_website: (tx as any).counterparties?.[0]?.website,
    counterparty_entity_id: (tx as any).counterparties?.[0]?.entity_id,
    counterparty_confidence_level: (tx as any).counterparties?.[0]?.confidence_level,
    
    // Check/ACH
    check_number: tx.check_number,
    account_owner: tx.account_owner,
    
    // Full raw data
    raw_data: tx as any,
    
    // Tracking
    sync_action: syncAction,
    import_job_id: importJobId,
    imported_to_transactions: false, // Will be set to true after import
    last_updated_at: new Date().toISOString(),
  };

  await supabase
    .from('plaid_transactions')
    .upsert(plaidTxData, {
      onConflict: 'connection_id,transaction_id'
    });
}

/**
 * Import Plaid transactions from plaid_transactions table to main transactions table
 * This allows us to apply business logic, deduplication, and categorization
 */
export async function importPlaidTransactionsToMain(
  tenantId: string,
  connectionId: string,
  importJobId?: string
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  try {
    // Get unimported Plaid transactions
    const { data: plaidTxns, error: fetchError } = await supabase
      .from('plaid_transactions')
      .select('*, plaid_accounts!inner(stratifi_account_id)')
      .eq('connection_id', connectionId)
      .eq('imported_to_transactions', false)
      .neq('sync_action', 'removed') // Don't import removed transactions
      .order('date', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch Plaid transactions: ${fetchError.message}`);
    }

    if (!plaidTxns || plaidTxns.length === 0) {
      console.log('ℹ️  No new Plaid transactions to import');
      return { imported: 0, skipped: 0, errors: [] };
    }

    console.log(`📥 Importing ${plaidTxns.length} Plaid transactions to main table...`);

    for (const plaidTx of plaidTxns) {
      try {
        const plaidAccount = plaidTx.plaid_accounts as any;
        
        if (!plaidAccount?.stratifi_account_id) {
          skipped++;
          errors.push(`Transaction ${plaidTx.transaction_id}: No linked Stratifi account`);
          continue;
        }

        // Get the Stratifi account's account_id (TEXT primary key)
        const { data: account } = await supabase
          .from('accounts')
          .select('account_id, currency')
          .eq('id', plaidAccount.stratifi_account_id)
          .single();

        if (!account) {
          skipped++;
          errors.push(`Transaction ${plaidTx.transaction_id}: Account lookup failed`);
          continue;
        }

        // Determine transaction type
        const isCredit = plaidTx.amount < 0; // Plaid: negative = income/credit
        const transactionId = `plaid_${connectionId}_${plaidTx.transaction_id}`;

        // Insert into main transactions table
        const { error: txError } = await supabase
          .from('transactions')
          .upsert({
            transaction_id: transactionId,
            tenant_id: tenantId,
            account_id: account.account_id,
            date: plaidTx.date,
            amount: Math.abs(plaidTx.amount), // Store as positive, type indicates direction
            currency: plaidTx.iso_currency_code || plaidTx.unofficial_currency_code || account.currency || 'USD',
            description: plaidTx.merchant_name || plaidTx.name,
            type: isCredit ? 'Credit' : 'Debit',
            category: plaidTx.personal_finance_category_primary || plaidTx.category?.[0] || 'Uncategorized',
            status: plaidTx.pending ? 'Pending' : 'Completed',
            reference: plaidTx.transaction_id,
            connection_id: connectionId,
            external_transaction_id: plaidTx.transaction_id,
            source_type: 'plaid_api',
            import_job_id: importJobId,
            metadata: {
              plaid_transaction_type: plaidTx.transaction_type,
              plaid_payment_channel: plaidTx.payment_channel,
              plaid_category: plaidTx.category,
              plaid_category_id: plaidTx.category_id,
              personal_finance_category: {
                primary: plaidTx.personal_finance_category_primary,
                detailed: plaidTx.personal_finance_category_detailed,
                confidence: plaidTx.personal_finance_category_confidence_level,
              },
              merchant_name: plaidTx.merchant_name,
              location: plaidTx.location_city ? {
                city: plaidTx.location_city,
                region: plaidTx.location_region,
                country: plaidTx.location_country,
              } : undefined,
              counterparty: plaidTx.counterparty_name ? {
                name: plaidTx.counterparty_name,
                type: plaidTx.counterparty_type,
              } : undefined,
              pending: plaidTx.pending,
              authorized_date: plaidTx.authorized_date,
            },
          }, {
            onConflict: 'transaction_id'
          });

        if (txError) {
          errors.push(`Failed to import transaction ${plaidTx.transaction_id}: ${txError.message}`);
          console.error('Transaction import error:', txError);
        } else {
          imported++;
          
          // Mark as imported in Plaid table
          await supabase
            .from('plaid_transactions')
            .update({ imported_to_transactions: true })
            .eq('id', plaidTx.id);
        }

      } catch (error) {
        skipped++;
        errors.push(`Error processing transaction ${plaidTx.transaction_id}: ${error}`);
        console.error('Transaction processing error:', error);
      }
    }

    console.log(`✅ Import complete: ${imported} imported, ${skipped} skipped`);

    return { imported, skipped, errors: errors.length > 0 ? errors : [] };

  } catch (error: any) {
    console.error('❌ Plaid transaction import failed:', error);
    return {
      imported,
      skipped,
      errors: [error?.message || 'Unknown error'],
    };
  }
}

/**
 * Full Plaid sync: accounts + transactions
 * Optimized for cost efficiency using cursors
 */
export async function performPlaidSync(
  tenantId: string,
  connectionId: string,
  accessToken: string,
  options: {
    syncAccounts?: boolean;
    syncTransactions?: boolean;
    forceFullSync?: boolean;
    importJobId?: string;
  } = {}
): Promise<PlaidSyncResult> {
  
  const {
    syncAccounts = true,
    syncTransactions = true,
    forceFullSync = false,
    importJobId,
  } = options;

  let accountsSynced = 0;
  const errors: string[] = [];

  // Sync accounts
  if (syncAccounts) {
    const accountResult = await syncPlaidAccounts(tenantId, connectionId, accessToken);
    accountsSynced = accountResult.accounts.length;
    
    if (accountResult.errors.length > 0) {
      errors.push(...accountResult.errors);
    }
  }

  // Sync transactions
  let transactionResult: PlaidSyncResult = {
    success: true,
    accountsSynced: 0,
    transactionsAdded: 0,
    transactionsModified: 0,
    transactionsRemoved: 0,
    transactionsImported: 0,
    cursor: '',
    hasMore: false,
  };

  if (syncTransactions) {
    transactionResult = await syncPlaidTransactions(
      tenantId,
      connectionId,
      accessToken,
      { forceFullSync, importJobId }
    );

    if (transactionResult.errors) {
      errors.push(...transactionResult.errors);
    }

    // Import to main transactions table
    const importResult = await importPlaidTransactionsToMain(
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
    transactionsRemoved: transactionResult.transactionsRemoved,
    transactionsImported: transactionResult.transactionsImported,
    cursor: transactionResult.cursor,
    hasMore: transactionResult.hasMore,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Check if a Plaid connection needs syncing
 * Uses cursor existence and last_sync_at to determine
 */
export async function shouldSyncPlaidConnection(
  connectionId: string,
  minHoursSinceLastSync: number = 1
): Promise<{ shouldSync: boolean; reason: string }> {
  
  const { data: cursorData } = await supabase
    .from('plaid_sync_cursors')
    .select('last_sync_at, has_more')
    .eq('connection_id', connectionId)
    .single();

  // Never synced before
  if (!cursorData) {
    return { shouldSync: true, reason: 'initial_sync' };
  }

  // If has_more is true, should continue pagination
  if (cursorData.has_more) {
    return { shouldSync: true, reason: 'pagination_incomplete' };
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

