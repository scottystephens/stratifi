// Raw Storage Service
//
// Single service that handles storing 100% of raw API responses in JSONB format
// for all banking providers. This enables auto-detection of new fields and
// preserves complete provider data for future analytics/ML use cases.

import { supabase } from '@/lib/supabase';
import type {
  RawAccountsResponse,
  RawTransactionsResponse,
  RawBalancesResponse
} from '@/lib/banking-providers/raw-types';
import {
  batchProcessXeroAccounts,
  batchProcessXeroTransactions,
  parallelBatchProcessTransactions,
} from './xero-batch-service';

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

export class RawStorageService {
  // ==========================================
  // PLAID RAW STORAGE
  // ==========================================

  /**
   * Store complete Plaid accounts response in JSONB format
   */
  async storePlaidAccounts(response: RawAccountsResponse): Promise<void> {
    const { connectionId, tenantId, rawData } = response;
    const plaidResponse = rawData as any;
    const plaidAccounts = plaidResponse.accounts || [];
    const item = plaidResponse.item;

    console.log(`[RawStorage] Storing ${plaidAccounts.length} Plaid accounts for connection ${connectionId}`);

    const accountRecords = plaidAccounts.map((account: any) => ({
      tenant_id: tenantId,
      connection_id: connectionId,
      account_id: account.account_id,
      raw_account_data: account,
      raw_item_data: item,
      last_updated_at: new Date().toISOString(),
    }));

    if (accountRecords.length === 0) {
      console.warn(`[RawStorage] No accounts found in Plaid response for connection ${connectionId}`);
      return;
    }

    const { error } = await supabase
      .from('plaid_accounts')
      .upsert(accountRecords, { onConflict: 'connection_id,account_id' });

    if (error) {
      console.error('[RawStorage] Failed to store Plaid accounts:', error);
      // Don't throw error to avoid blocking the sync flow, just log it
      // throw new Error(`Failed to store Plaid accounts: ${error.message}`);
    } else {
      console.log(`[RawStorage] Successfully stored ${accountRecords.length} Plaid accounts with full raw data`);
    }
  }

  /**
   * Store complete Plaid transactions response in JSONB format
   */
  async storePlaidTransactions(response: RawTransactionsResponse): Promise<void> {
    const { connectionId, tenantId, rawData } = response;
    const plaidResponse = rawData as any;
    const plaidTransactions = plaidResponse.added || plaidResponse.transactions || [];
    const modified = plaidResponse.modified || [];
    const removed = plaidResponse.removed || [];

    console.log(`[RawStorage] Storing ${plaidTransactions.length} Plaid transactions for connection ${connectionId}`);

    // Store added/modified transactions
    const allTransactions = [...plaidTransactions, ...modified];
    
    if (allTransactions.length === 0) {
      console.log(`[RawStorage] No transactions to store for connection ${connectionId}`);
      return;
    }

    const txRecords = allTransactions.map((tx: any) => ({
      tenant_id: tenantId,
      connection_id: connectionId,
      transaction_id: tx.transaction_id,
      account_id: tx.account_id,
      raw_transaction_data: tx,
      last_updated_at: new Date().toISOString(),
    }));

    // Process in batches of 100 to avoid request size limits
    const batchSize = 100;
    for (let i = 0; i < txRecords.length; i += batchSize) {
      const batch = txRecords.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('plaid_transactions')
        .upsert(batch, { onConflict: 'connection_id,transaction_id' });

      if (error) {
        console.error(`[RawStorage] Failed to store Plaid transactions batch ${i / batchSize + 1}:`, error);
        // Continue with next batch instead of failing completely
      }
    }
    
    console.log(`[RawStorage] Successfully stored ${allTransactions.length} Plaid transactions with full raw data`);
  }

  // ==========================================
  // TINK RAW STORAGE
  // ==========================================

  /**
   * Store complete Tink accounts response in JSONB format
   */
  async storeTinkAccounts(response: RawAccountsResponse): Promise<void> {
    const { connectionId, tenantId, rawData } = response;
    const tinkResponse = rawData as any;
    const tinkAccounts = tinkResponse.accounts || [];

    console.log(`[RawStorage] Storing ${tinkAccounts.length} Tink accounts for connection ${connectionId}`);

    const accountRecords = tinkAccounts.map((account: any) => ({
      tenant_id: tenantId,
      connection_id: connectionId,
      account_id: account.id,
      raw_account_data: account,
      last_updated_at: new Date().toISOString(),
    }));

    if (accountRecords.length === 0) {
      console.warn(`[RawStorage] No accounts found in Tink response for connection ${connectionId}`);
      return;
    }

    const { error } = await supabase
      .from('tink_accounts')
      .upsert(accountRecords, { onConflict: 'connection_id,account_id' });

    if (error) {
      console.error('[RawStorage] Failed to store Tink accounts:', error);
      throw new Error(`Failed to store Tink accounts: ${error.message}`);
    } else {
      console.log(`[RawStorage] Successfully stored ${accountRecords.length} Tink accounts with full raw data`);
    }
  }

  /**
   * Store complete Tink transactions response in JSONB format
   */
  async storeTinkTransactions(response: RawTransactionsResponse): Promise<void> {
    const { connectionId, tenantId, rawData } = response;
    const tinkResponse = rawData as any;
    const tinkTransactions = tinkResponse.results || tinkResponse.transactions || [];

    console.log(`[RawStorage] Storing ${tinkTransactions.length} Tink transactions for connection ${connectionId}`);

    if (tinkTransactions.length === 0) {
      console.log(`[RawStorage] No transactions to store for connection ${connectionId}`);
      return;
    }

    const txRecords = tinkTransactions.map((txWrapper: any) => {
      // Handle both formats (Tink sometimes wraps transaction in 'transaction' property)
      const tx = txWrapper.transaction || txWrapper;
      return {
        tenant_id: tenantId,
        connection_id: connectionId,
        transaction_id: tx.id,
        account_id: tx.accountId,
        raw_transaction_data: tx,
        last_updated_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from('tink_transactions')
      .upsert(txRecords, { onConflict: 'connection_id,transaction_id' });

    if (error) {
      console.error('[RawStorage] Failed to store Tink transactions:', error);
      throw new Error(`Failed to store Tink transactions: ${error.message}`);
    }

    console.log(`[RawStorage] Successfully stored ${txRecords.length} Tink transactions with full raw data`);
  }

  // ==========================================
  // XERO RAW STORAGE
  // ==========================================

  /**
   * Store complete Xero accounts response in JSONB format
   * Also stores balance data from Bank Summary report
   */
  async storeXeroAccounts(response: RawAccountsResponse): Promise<void> {
    const { connectionId, tenantId, rawData, requestParams } = response;
    const xeroResponse = rawData as any;
    const xeroAccounts = xeroResponse.Accounts || [];

    // Get Xero tenant ID from requestParams (set by XeroProvider.fetchRawAccounts)
    const xeroTenantId = requestParams?.xeroTenantId;
    const balances = requestParams?.balances as Record<string, { accountId: string; accountName: string; openingBalance: number; closingBalance: number; currency: string }> | undefined;
    
    if (!xeroTenantId) {
      console.error('[RawStorage] Missing xeroTenantId in Xero accounts response');
      throw new Error('Missing xeroTenantId - cannot store Xero accounts without organization ID');
    }

    console.log(`[RawStorage] Storing ${xeroAccounts.length} Xero accounts for connection ${connectionId} (tenant: ${xeroTenantId})`);
    console.log(`[RawStorage] Balance data available for ${Object.keys(balances || {}).length} accounts`);

    // Check if this is initial sync BEFORE storing new balances
    // This ensures we detect if we need to fetch history
    const { count: existingBalancesCount } = await supabase
      .from('xero_balances')
      .select('*', { count: 'exact', head: true })
      .eq('connection_id', connectionId);
    
    const isInitialSync = (existingBalancesCount || 0) === 0;

    if (xeroAccounts.length === 0) {
      console.warn(`[RawStorage] No accounts found in Xero response for connection ${connectionId}`);
      return;
    }

    // Use batch service for optimized processing with retry logic
    const batchResult = await batchProcessXeroAccounts(
      connectionId,
      tenantId,
      xeroTenantId,
      xeroAccounts
    );

    if (!batchResult.success) {
      const errorMessages = batchResult.errors.map(e => e.error).join('; ');
      console.error('[RawStorage] Failed to store some Xero accounts:', errorMessages);
      // Only throw if all accounts failed
      if (batchResult.failed === batchResult.processed) {
        throw new Error(`Failed to store Xero accounts: ${errorMessages}`);
      }
    }

    console.log(`[RawStorage] Successfully stored ${batchResult.processed} Xero accounts (${batchResult.created} created, ${batchResult.failed} failed) in ${batchResult.duration}ms`);

    // Store current balance data if available
    if (balances && Object.keys(balances).length > 0) {
      await this.storeXeroBalances(connectionId, tenantId, xeroTenantId, balances);
    }

    // Store historical balance data if available (from manual params)
    const historicalBalances = requestParams?.historicalBalances as Record<string, Record<string, { accountId: string; accountName: string; openingBalance: number; closingBalance: number; currency: string }>> | undefined;
    if (historicalBalances && Object.keys(historicalBalances).length > 0) {
      console.log(`[RawStorage] Storing historical balances for ${Object.keys(historicalBalances).length} dates`);
      for (const [date, dateBalances] of Object.entries(historicalBalances)) {
        await this.storeXeroBalances(connectionId, tenantId, xeroTenantId, dateBalances, date);
      }
    }

    // Trigger historical balance fetch if this is initial sync
    // We await this now because the calling API route has extended timeout
    if (isInitialSync) {
      console.log(`[RawStorage] Initial sync detected - fetching historical balances (this may take a few minutes)...`);
      try {
        await this.fetchAndStoreHistoricalBalances(connectionId, tenantId, xeroTenantId);
        console.log(`[RawStorage] ✅ Initial historical balance fetch completed`);
      } catch (err) {
        console.error('[RawStorage] Historical balance fetch failed:', err);
        // Don't throw - allow the sync to complete partially
      }
    }
  }

  /**
   * Fetch historical balances after initial sync
   */
  private async fetchAndStoreHistoricalBalances(
    connectionId: string,
    tenantId: string,
    xeroTenantId: string
  ): Promise<void> {
    console.log(`[RawStorage] Starting historical balance fetch for connection ${connectionId}...`);
    
    try {
      // Import here to avoid circular dependencies
      const { getProvider } = await import('@/lib/banking-providers/provider-registry');
      const { XeroProvider } = await import('@/lib/banking-providers/xero-provider');
      const provider = getProvider('xero') as InstanceType<typeof XeroProvider>;
      
      // Get connection credentials
      const { supabase } = await import('@/lib/supabase');
      const { data: tokenData } = await supabase
        .from('provider_tokens')
        .select('*')
        .eq('connection_id', connectionId)
        .eq('provider_id', 'xero')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (!tokenData) {
        console.warn('[RawStorage] No token found for historical balance fetch');
        return;
      }

      const credentials = {
        connectionId,
        tenantId,
        tokens: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || undefined,
          expiresAt: tokenData.expires_at ? new Date(tokenData.expires_at) : undefined,
        },
        metadata: { xeroTenantId },
      };

      // Fetch historical balances (this will take 2-3 minutes)
      const historicalBalances = await provider.fetchHistoricalBalances(credentials);
      
      // Store all historical balances
      if (historicalBalances.size > 0) {
        console.log(`[RawStorage] Storing ${historicalBalances.size} historical balance snapshots...`);
        for (const [date, dateBalances] of historicalBalances.entries()) {
          const balanceMap: Record<string, { accountId: string; accountName: string; openingBalance: number; closingBalance: number; currency: string }> = {};
          dateBalances.forEach((balance, accountId) => {
            balanceMap[accountId] = balance;
          });
          
          if (Object.keys(balanceMap).length > 0) {
            await this.storeXeroBalances(connectionId, tenantId, xeroTenantId, balanceMap, date);
          }
        }
        console.log(`[RawStorage] ✅ Successfully stored ${historicalBalances.size} historical balance snapshots`);
      }
    } catch (error) {
      console.error('[RawStorage] Error fetching historical balances:', error);
      throw error;
    }
  }

  /**
   * Helper to store balances in xero_balances table
   */
  private async storeXeroBalances(
    connectionId: string,
    tenantId: string,
    xeroTenantId: string,
    balances: Record<string, { accountId: string; accountName: string; openingBalance: number; closingBalance: number; currency: string }>,
    date?: string // Optional date, defaults to today
  ): Promise<void> {
    const balanceDate = date || new Date().toISOString().split('T')[0];
    
    const balanceRecords = Object.values(balances).map(balance => ({
      tenant_id: tenantId,
      connection_id: connectionId,
      account_id: balance.accountId,
      xero_tenant_id: xeroTenantId,
      balance_date: balanceDate,
      currency: balance.currency,
      opening_balance: balance.openingBalance,
      closing_balance: balance.closingBalance,
      raw_report_data: balance,
      created_at: new Date().toISOString(),
      fetched_at: new Date().toISOString(),
    }));

    if (balanceRecords.length === 0) return;

    const { error } = await supabase
      .from('xero_balances')
      .upsert(balanceRecords, { 
        onConflict: 'connection_id,account_id,balance_date',
        ignoreDuplicates: false // Update if exists
      });

    if (error) {
      console.error(`[RawStorage] Failed to store Xero balances for ${balanceDate}:`, error);
      // Don't throw, just log
    }
  }

  // ==========================================
  // XERO TRANSACTION STORAGE (Using new separate table)
  // ==========================================

  /**
   * Store complete Xero transactions response in JSONB format
   * Uses batch service for optimized processing with retry logic
   */
  async storeXeroTransactions(response: RawTransactionsResponse): Promise<void> {
    const { connectionId, tenantId, rawData, requestParams } = response;
    const xeroResponse = rawData as any;
    const xeroTransactions = xeroResponse.BankTransactions || [];
    const xeroTenantId = requestParams?.xeroTenantId;

    if (!xeroTenantId) {
      console.error('[RawStorage] Missing xeroTenantId in Xero transactions response');
      return;
    }

    console.log(`[RawStorage] Storing ${xeroTransactions.length} Xero transactions for connection ${connectionId}`);

    if (xeroTransactions.length === 0) {
      return;
    }

    // Group transactions by account ID (batch service requires accountId parameter)
    const transactionsByAccount = new Map<string, any[]>();
    for (const tx of xeroTransactions) {
      const accountId = tx.BankAccount?.AccountID;
      if (!accountId) {
        console.warn(`[RawStorage] Skipping transaction ${tx.BankTransactionID} - missing account ID`);
        continue;
      }
      
      if (!transactionsByAccount.has(accountId)) {
        transactionsByAccount.set(accountId, []);
      }
      transactionsByAccount.get(accountId)!.push(tx);
    }

    // Process transactions using parallel batch service
    // This handles grouping, concurrency limits, and error aggregation
    const batchResult = await parallelBatchProcessTransactions(
      connectionId,
      tenantId,
      xeroTenantId,
      transactionsByAccount
    );

    if (batchResult.totalFailed > 0) {
      const errors = Array.from(batchResult.accountResults.entries())
        .filter(([_, result]) => !result.success)
        .map(([accId, result]) => `Account ${accId}: ${result.errors.map(e => e.error).join(', ')}`)
        .join('; ');
      
      console.warn(`[RawStorage] Some transactions failed: ${errors}`);
    }

    console.log(`[RawStorage] Successfully stored ${batchResult.totalProcessed} Xero transactions (${batchResult.totalFailed} failed) across ${transactionsByAccount.size} accounts in ${batchResult.duration}ms`);
  }

  // ==========================================
  // DIRECT BANK RAW STORAGE
  // ==========================================

  /**
   * Store raw accounts for direct bank providers
   */
  async storeDirectBankAccounts(response: RawAccountsResponse, providerId: string): Promise<void> {
    const { connectionId, tenantId, rawData } = response;
    // Direct bank implementation would go here
    // For now, we'll just log it as we don't have a specific table for generic direct banks yet
    console.log(`[RawStorage] Direct bank storage not fully implemented for ${providerId}`);
  }

  /**
   * Store raw transactions for direct bank providers
   */
  async storeDirectBankTransactions(response: RawTransactionsResponse, providerId: string): Promise<void> {
    const { connectionId, tenantId, rawData } = response;
    // Direct bank implementation would go here
    console.log(`[RawStorage] Direct bank transaction storage not fully implemented for ${providerId}`);
  }

  // ==========================================
  // UTILITIES
  // ==========================================

  /**
   * Get the latest cursor for Plaid sync
   */
  async getPlaidCursor(connectionId: string): Promise<string | undefined> {
    // Logic to get cursor from latest transaction or a dedicated cursors table
    // For now, return undefined to force full sync or check transactions table if we stored cursor there
    // Note: In a real implementation, we should store the cursor in the connections table or a separate sync_state table
    
    const { data } = await supabase
      .from('connections')
      .select('config')
      .eq('id', connectionId)
      .single();
      
    return data?.config?.plaid_next_cursor;
  }

  /**
   * Get the date of the latest transaction for a connection
   * Used for incremental syncs
   */
  async getLatestTransactionDate(connectionId: string, providerId: string): Promise<Date | undefined> {
    let tableName = '';
    let dateColumn = '';
    
    if (providerId === 'plaid') {
      tableName = 'plaid_transactions';
      dateColumn = 'raw_transaction_data->>date';
    } else if (providerId === 'tink') {
      tableName = 'tink_transactions';
      dateColumn = 'raw_transaction_data->>date'; // Adjust based on Tink schema
    } else if (providerId === 'xero') {
      tableName = 'xero_transactions';
      dateColumn = 'date';
    } else {
      return undefined;
    }
    
    // This query is simplified; handling JSONB dates in SQL might require casting
    // For Xero it's a real column
    if (providerId === 'xero') {
      const { data } = await supabase
        .from(tableName)
        .select(dateColumn)
        .eq('connection_id', connectionId)
        .order(dateColumn, { ascending: false })
        .limit(1)
        .single();
        
      const record = data as Record<string, any> | null;
      return record?.[dateColumn] ? new Date(record[dateColumn]) : undefined;
    }
    
    return undefined; 
  }
}

export const rawStorageService = new RawStorageService();
