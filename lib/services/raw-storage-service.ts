/**
 * Raw Storage Service
 *
 * Single service that handles storing 100% of raw API responses in JSONB format
 * for all banking providers. This enables auto-detection of new fields and
 * preserves complete provider data for future analytics/ML use cases.
 */

import { supabase } from '@/lib/supabase';
import type {
  RawAccountsResponse,
  RawTransactionsResponse,
  RawBalancesResponse
} from '@/lib/banking-providers/raw-types';

export class RawStorageService {
  // ==========================================
  // PLAID RAW STORAGE
  // ==========================================

  /**
   * Store complete Plaid accounts response in JSONB format
   */
  async storePlaidAccounts(response: RawAccountsResponse): Promise<void> {
    const { connectionId, tenantId, rawData, institutionData } = response;
    const plaidResponse = rawData as any; // Plaid accountsGet response

    console.log(`[RawStorage] Storing ${plaidResponse.accounts?.length || 0} Plaid accounts for connection ${connectionId}`);

    // Store institution data if available
    let institutionDataToStore = null;
    if (institutionData) {
      institutionDataToStore = institutionData;
    }

    // Store each account's complete raw data
    const accountRecords = plaidResponse.accounts?.map((account: any) => ({
      tenant_id: tenantId,
      connection_id: connectionId,
      account_id: account.account_id,
      item_id: plaidResponse.item?.item_id,
      raw_account_data: account,  // COMPLETE account object
      raw_institution_data: institutionDataToStore,
      last_updated_at: new Date().toISOString(),
    })) || [];

    if (accountRecords.length === 0) {
      console.warn(`[RawStorage] No accounts found in Plaid response for connection ${connectionId}`);
      return;
    }

    const { error } = await supabase
      .from('plaid_accounts')
      .upsert(accountRecords, { onConflict: 'connection_id,account_id' });

    if (error) {
      console.error('[RawStorage] Failed to store Plaid accounts:', error);
      throw new Error(`Failed to store Plaid accounts: ${error.message}`);
    }

    console.log(`[RawStorage] Successfully stored ${accountRecords.length} Plaid accounts with full raw data`);
  }

  /**
   * Store complete Plaid transactions response in JSONB format
   * Handles /transactions/sync response with added/modified/removed arrays
   */
  async storePlaidTransactions(response: RawTransactionsResponse): Promise<void> {
    const { connectionId, tenantId, rawData } = response;
    const plaidResponse = rawData as any;

    // Handle sync response structure with added/modified/removed arrays
    const added = plaidResponse.added || [];
    const modified = plaidResponse.modified || [];
    const removed = plaidResponse.removed || [];

    const totalTransactions = added.length + modified.length + removed.length;
    console.log(`[RawStorage] Storing ${totalTransactions} Plaid transactions for connection ${connectionId} (added: ${added.length}, modified: ${modified.length}, removed: ${removed.length})`);

    const txRecords: any[] = [];

    // Process added transactions
    added.forEach((tx: any) => {
      txRecords.push({
        tenant_id: tenantId,
        connection_id: connectionId,
        transaction_id: tx.transaction_id,
        account_id: tx.account_id,
        raw_transaction_data: { ...tx, _sync_type: 'added' },  // COMPLETE transaction object with sync type
        amount: tx.amount,
        date: tx.date,
        posted: tx.pending === false,
        last_updated_at: new Date().toISOString(),
      });
    });

    // Process modified transactions
    modified.forEach((tx: any) => {
      txRecords.push({
        tenant_id: tenantId,
        connection_id: connectionId,
        transaction_id: tx.transaction_id,
        account_id: tx.account_id,
        raw_transaction_data: { ...tx, _sync_type: 'modified' },  // COMPLETE transaction object with sync type
        amount: tx.amount,
        date: tx.date,
        posted: tx.pending === false,
        last_updated_at: new Date().toISOString(),
      });
    });

    // Process removed transactions (mark as inactive/deleted)
    removed.forEach((tx: any) => {
      txRecords.push({
        tenant_id: tenantId,
        connection_id: connectionId,
        transaction_id: tx.transaction_id,
        account_id: tx.account_id,
        raw_transaction_data: { ...tx, _sync_type: 'removed' },  // COMPLETE transaction object with sync type
        amount: tx.amount,
        date: tx.date,
        posted: tx.pending === false,
        last_updated_at: new Date().toISOString(),
      });
    });

    if (txRecords.length === 0) {
      console.warn(`[RawStorage] No transactions found in Plaid response for connection ${connectionId}`);
      return;
    }

    const { error } = await supabase
      .from('plaid_transactions')
      .upsert(txRecords, { onConflict: 'connection_id,transaction_id' });

    if (error) {
      console.error('[RawStorage] Failed to store Plaid transactions:', error);
      throw new Error(`Failed to store Plaid transactions: ${error.message}`);
    }

    // Update cursor if provided
    if (response.pagination?.cursor) {
      await this.updatePlaidCursor(connectionId, tenantId, response.pagination);
    }

    console.log(`[RawStorage] Successfully stored ${txRecords.length} Plaid transactions with full raw data (${added.length} added, ${modified.length} modified, ${removed.length} removed)`);
  }

  /**
   * Update Plaid sync cursor
   */
  private async updatePlaidCursor(
    connectionId: string,
    tenantId: string,
    pagination: { cursor?: string; hasMore?: boolean }
  ): Promise<void> {
    const { error } = await supabase
      .from('plaid_sync_cursors')
      .upsert({
        tenant_id: tenantId,
        connection_id: connectionId,
        cursor: pagination.cursor || '',
        last_sync_at: new Date().toISOString(),
        has_more: pagination.hasMore || false,
      }, { onConflict: 'connection_id' });

    if (error) {
      console.error('[RawStorage] Failed to update Plaid cursor:', error);
      throw new Error(`Failed to update Plaid cursor: ${error.message}`);
    }
  }

  // ==========================================
  // TINK RAW STORAGE
  // ==========================================

  /**
   * Store complete Tink accounts response in JSONB format
   */
  async storeTinkAccounts(response: RawAccountsResponse): Promise<void> {
    const { connectionId, tenantId, rawData } = response;
    const tinkAccounts = rawData as any[];

    console.log(`[RawStorage] Storing ${tinkAccounts.length} Tink accounts for connection ${connectionId}`);

    const accountRecords = tinkAccounts.map((account: any) => ({
      tenant_id: tenantId,
      connection_id: connectionId,
      account_id: account.id,
      financial_institution_id: account.financialInstitutionId,
      raw_account_data: account,  // COMPLETE Tink account object
      last_updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('tink_accounts')
      .upsert(accountRecords, { onConflict: 'connection_id,account_id' });

    if (error) {
      console.error('[RawStorage] Failed to store Tink accounts:', error);
      throw new Error(`Failed to store Tink accounts: ${error.message}`);
    }

    console.log(`[RawStorage] Successfully stored ${accountRecords.length} Tink accounts with full raw data`);
  }

  /**
   * Store complete Tink transactions response in JSONB format
   */
  async storeTinkTransactions(response: RawTransactionsResponse): Promise<void> {
    const { connectionId, tenantId, rawData } = response;
    const tinkResponse = rawData as any;

    // Handle both single account and bulk transaction responses
    const transactions = Array.isArray(tinkResponse) ? tinkResponse : (tinkResponse.transactions || []);

    console.log(`[RawStorage] Storing ${transactions.length} Tink transactions for connection ${connectionId}`);

    const txRecords = transactions.map((tx: any) => ({
      tenant_id: tenantId,
      connection_id: connectionId,
      transaction_id: tx.id,
      account_id: tx.accountId || response.requestParams?.accountId || '',
      raw_transaction_data: tx,  // COMPLETE Tink transaction object
      amount: this.formatTinkAmount(tx.amount?.value),
      date: tx.dates?.booked || tx.date,
      last_updated_at: new Date().toISOString(),
    }));

    if (txRecords.length === 0) {
      console.warn(`[RawStorage] No transactions found in Tink response for connection ${connectionId}`);
      return;
    }

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
  // DIRECT BANK RAW STORAGE (Universal for all banks)
  // ==========================================

  /**
   * Store complete direct bank accounts response in JSONB format
   * Works for Standard Bank, ABSA, Nedbank, and any future direct bank APIs
   */
  async storeDirectBankAccounts(
    response: RawAccountsResponse,
    providerId: string
  ): Promise<void> {
    const { connectionId, tenantId, rawData, institutionData } = response;
    const accounts = Array.isArray(rawData) ? rawData : [rawData];

    console.log(`[RawStorage] Storing ${accounts.length} ${providerId} accounts for connection ${connectionId}`);

    const accountRecords = accounts.map((account: any, index: number) => ({
      tenant_id: tenantId,
      connection_id: connectionId,
      provider_id: providerId,
      external_account_id: account.accountId || account.id || account.accountNumber || `account_${index}`,
      raw_account_data: account,  // COMPLETE bank account object
      raw_institution_data: institutionData,
      last_updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('direct_bank_accounts')
      .upsert(accountRecords, { onConflict: 'connection_id,external_account_id' });

    if (error) {
      console.error(`[RawStorage] Failed to store ${providerId} accounts:`, error);
      throw new Error(`Failed to store ${providerId} accounts: ${error.message}`);
    }

    console.log(`[RawStorage] Successfully stored ${accountRecords.length} ${providerId} accounts with full raw data`);
  }

  /**
   * Store complete direct bank transactions response in JSONB format
   */
  async storeDirectBankTransactions(
    response: RawTransactionsResponse,
    providerId: string
  ): Promise<void> {
    const { connectionId, tenantId, rawData } = response;
    const transactions = Array.isArray(rawData) ? rawData : (rawData as any).transactions || [rawData];

    console.log(`[RawStorage] Storing ${transactions.length} ${providerId} transactions for connection ${connectionId}`);

    const txRecords = transactions.map((tx: any, index: number) => ({
      tenant_id: tenantId,
      connection_id: connectionId,
      provider_id: providerId,
      external_transaction_id: tx.transactionId || tx.id || tx.reference || `tx_${index}`,
      external_account_id: tx.accountId || response.requestParams?.accountId || '',
      raw_transaction_data: tx,  // COMPLETE bank transaction object
      amount: this.parseDirectBankAmount(tx.amount || tx.value),
      date: tx.date || tx.transactionDate || tx.bookingDate,
      currency: tx.currency || tx.amount?.currency || 'ZAR',
      last_updated_at: new Date().toISOString(),
    }));

    if (txRecords.length === 0) {
      console.warn(`[RawStorage] No transactions found in ${providerId} response for connection ${connectionId}`);
      return;
    }

    const { error } = await supabase
      .from('direct_bank_transactions')
      .upsert(txRecords, { onConflict: 'connection_id,external_transaction_id' });

    if (error) {
      console.error(`[RawStorage] Failed to store ${providerId} transactions:`, error);
      throw new Error(`Failed to store ${providerId} transactions: ${error.message}`);
    }

    console.log(`[RawStorage] Successfully stored ${txRecords.length} ${providerId} transactions with full raw data`);
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Format Tink amount from their complex structure
   */
  private formatTinkAmount(amountObj: any): number {
    if (!amountObj) return 0;
    if (typeof amountObj === 'number') return amountObj;
    if (typeof amountObj === 'string') return parseFloat(amountObj);

    // Handle Tink v2 amount structure
    if (amountObj.value !== undefined) {
      return parseFloat(amountObj.value);
    }

    return 0;
  }

  /**
   * Parse direct bank amount (handles various formats)
   */
  private parseDirectBankAmount(amount: any): number {
    if (!amount) return 0;
    if (typeof amount === 'number') return amount;
    if (typeof amount === 'string') return parseFloat(amount.replace(/,/g, ''));

    // Handle object format { value: 123.45, currency: 'ZAR' }
    if (amount.value !== undefined) {
      return parseFloat(amount.value);
    }

    return 0;
  }

  /**
   * Get raw account data for a connection (for debugging/analysis)
   */
  async getRawAccounts(connectionId: string, provider: string): Promise<any[]> {
    let tableName: string;
    let providerFilter = '';

    switch (provider) {
      case 'plaid':
        tableName = 'plaid_accounts';
        break;
      case 'tink':
        tableName = 'tink_accounts';
        break;
      default:
        tableName = 'direct_bank_accounts';
        providerFilter = `provider_id.eq.${provider},`;
    }

    const query = `connection_id.eq.${connectionId},${providerFilter}select=raw_account_data,last_updated_at`;
    const { data, error } = await supabase
      .from(tableName)
      .select('raw_account_data,last_updated_at')
      .eq('connection_id', connectionId);

    if (error) {
      console.error(`[RawStorage] Failed to get raw accounts for ${provider}:`, error);
      throw new Error(`Failed to get raw accounts: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get raw transaction data for analysis/debugging
   */
  async getRawTransactions(connectionId: string, provider: string, accountId?: string): Promise<any[]> {
    let tableName: string;
    let providerFilter = '';

    switch (provider) {
      case 'plaid':
        tableName = 'plaid_transactions';
        break;
      case 'tink':
        tableName = 'tink_transactions';
        break;
      default:
        tableName = 'direct_bank_transactions';
        providerFilter = `provider_id.eq.${provider},`;
    }

    let query = supabase
      .from(tableName)
      .select('raw_transaction_data,last_updated_at,account_id')
      .eq('connection_id', connectionId);

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`[RawStorage] Failed to get raw transactions for ${provider}:`, error);
      throw new Error(`Failed to get raw transactions: ${error.message}`);
    }

    return data || [];
  }
}

// Export singleton instance
export const rawStorageService = new RawStorageService();
