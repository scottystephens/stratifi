/**
 * Reconnection Detection & Recovery Service
 * 
 * Handles smart reconnection logic when:
 * - OAuth tokens expire and user reconnects
 * - Connections get accidentally deleted
 * - User reconnects the same bank account
 * 
 * The system will:
 * - Detect existing accounts/transactions from the same bank
 * - Link new connection to existing data
 * - Resume syncing from where it left off
 * - Preserve all historical data
 */

import { supabase } from '@/lib/supabase';

export interface ReconnectionMatch {
  isReconnection: boolean;
  matchedAccounts: Array<{
    accountId: string;
    externalAccountId: string;
    accountName: string;
    lastSyncedAt: string | null;
    transactionCount: number;
    matchConfidence: 'high' | 'medium' | 'low';
    matchReason: string;
  }>;
  previousConnectionId: string | null;
  oldestTransactionDate: string | null;
  newestTransactionDate: string | null;
  totalTransactions: number;
  recommendation: 'link_and_resume' | 'create_new' | 'manual_review';
}

export interface ReconnectionContext {
  tenantId: string;
  providerId: string;
  institutionId?: string;
  institutionName?: string;
  externalAccountIds: string[];
  accountNumbers?: string[];
  ibans?: string[];
}

/**
 * Detect if this is a reconnection to previously connected accounts
 */
export async function detectReconnection(
  context: ReconnectionContext
): Promise<ReconnectionMatch> {
  const {
    tenantId,
    providerId,
    institutionId,
    institutionName,
    externalAccountIds,
    accountNumbers,
    ibans,
  } = context;

  console.log('[Reconnection] Detecting reconnection:', {
    tenantId,
    providerId,
    institutionId,
    accountCount: externalAccountIds.length,
  });

  // Step 1: Check for exact external account ID matches (HIGHEST confidence)
  const exactMatches = await findAccountsByExternalId(
    tenantId,
    providerId,
    externalAccountIds
  );

  if (exactMatches.length > 0) {
    console.log(`[Reconnection] Found ${exactMatches.length} exact matches by external_account_id`);
    return await buildReconnectionMatch(exactMatches, 'high', 'Exact external account ID match');
  }

  // Step 2: Check by institution + account number (HIGH confidence)
  if (institutionId && accountNumbers && accountNumbers.length > 0) {
    const institutionMatches = await findAccountsByInstitution(
      tenantId,
      providerId,
      institutionId,
      accountNumbers
    );

    if (institutionMatches.length > 0) {
      console.log(`[Reconnection] Found ${institutionMatches.length} matches by institution + account number`);
      return await buildReconnectionMatch(
        institutionMatches,
        'high',
        'Institution and account number match'
      );
    }
  }

  // Step 3: Check by IBAN (HIGH confidence for European banks)
  if (ibans && ibans.length > 0) {
    const ibanMatches = await findAccountsByIBAN(tenantId, ibans);

    if (ibanMatches.length > 0) {
      console.log(`[Reconnection] Found ${ibanMatches.length} matches by IBAN`);
      return await buildReconnectionMatch(ibanMatches, 'high', 'IBAN match');
    }
  }

  // Step 4: Check by institution name + similar account names (MEDIUM confidence)
  if (institutionName) {
    const fuzzyMatches = await findAccountsByInstitutionName(
      tenantId,
      providerId,
      institutionName
    );

    if (fuzzyMatches.length > 0) {
      console.log(`[Reconnection] Found ${fuzzyMatches.length} potential matches by institution name`);
      return await buildReconnectionMatch(
        fuzzyMatches,
        'medium',
        'Institution name similarity'
      );
    }
  }

  // No matches found - this is a new connection
  console.log('[Reconnection] No existing accounts found - treating as new connection');
  return {
    isReconnection: false,
    matchedAccounts: [],
    previousConnectionId: null,
    oldestTransactionDate: null,
    newestTransactionDate: null,
    totalTransactions: 0,
    recommendation: 'create_new',
  };
}

/**
 * Find accounts by exact external account ID
 */
async function findAccountsByExternalId(
  tenantId: string,
  providerId: string,
  externalAccountIds: string[]
): Promise<any[]> {
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('provider_id', providerId)
    .in('external_account_id', externalAccountIds);

  return accounts || [];
}

/**
 * Find accounts by institution and account number
 */
async function findAccountsByInstitution(
  tenantId: string,
  providerId: string,
  institutionId: string,
  accountNumbers: string[]
): Promise<any[]> {
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('provider_id', providerId)
    .eq('institution_id', institutionId)
    .in('account_number', accountNumbers);

  return accounts || [];
}

/**
 * Find accounts by IBAN
 */
async function findAccountsByIBAN(tenantId: string, ibans: string[]): Promise<any[]> {
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('iban', ibans);

  return accounts || [];
}

/**
 * Find accounts by institution name (fuzzy match)
 */
async function findAccountsByInstitutionName(
  tenantId: string,
  providerId: string,
  institutionName: string
): Promise<any[]> {
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('provider_id', providerId)
    .ilike('bank_name', `%${institutionName}%`);

  return accounts || [];
}

/**
 * Build reconnection match object with transaction stats
 */
async function buildReconnectionMatch(
  accounts: any[],
  confidence: 'high' | 'medium' | 'low',
  reason: string
): Promise<ReconnectionMatch> {
  const matchedAccounts = [];
  let totalTransactions = 0;
  let oldestDate: Date | null = null;
  let newestDate: Date | null = null;
  const previousConnectionIds = new Set<string>();

  for (const account of accounts) {
    // Get transaction stats for this account
    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', account.account_id);

    const { data: dateRange } = await supabase
      .from('transactions')
      .select('transaction_date')
      .eq('account_id', account.account_id)
      .order('transaction_date', { ascending: false })
      .limit(1);

    const newestTxDate = dateRange?.[0]?.transaction_date;

    const { data: oldestRange } = await supabase
      .from('transactions')
      .select('transaction_date')
      .eq('account_id', account.account_id)
      .order('transaction_date', { ascending: true })
      .limit(1);

    const oldestTxDate = oldestRange?.[0]?.transaction_date;

    totalTransactions += count || 0;

    if (newestTxDate) {
      const date = new Date(newestTxDate);
      if (!newestDate || date > newestDate) {
        newestDate = date;
      }
    }

    if (oldestTxDate) {
      const date = new Date(oldestTxDate);
      if (!oldestDate || date < oldestDate) {
        oldestDate = date;
      }
    }

    if (account.connection_id) {
      previousConnectionIds.add(account.connection_id);
    }

    matchedAccounts.push({
      accountId: account.account_id,
      externalAccountId: account.external_account_id,
      accountName: account.name,
      lastSyncedAt: account.last_synced_at,
      transactionCount: count || 0,
      matchConfidence: confidence,
      matchReason: reason,
    });
  }

  const recommendation =
    confidence === 'high'
      ? 'link_and_resume'
      : confidence === 'medium'
      ? 'manual_review'
      : 'create_new';

  return {
    isReconnection: true,
    matchedAccounts,
    previousConnectionId: Array.from(previousConnectionIds)[0] || null,
    oldestTransactionDate: oldestDate?.toISOString() || null,
    newestTransactionDate: newestDate?.toISOString() || null,
    totalTransactions,
    recommendation,
  };
}

/**
 * Link new connection to existing accounts
 */
export async function linkConnectionToAccounts(
  newConnectionId: string,
  accountIds: string[]
): Promise<{ success: boolean; linkedCount: number }> {
  console.log(`[Reconnection] Linking connection ${newConnectionId} to ${accountIds.length} accounts`);

  const { error } = await supabase
    .from('accounts')
    .update({
      connection_id: newConnectionId,
      updated_at: new Date().toISOString(),
    })
    .in('account_id', accountIds);

  if (error) {
    console.error('[Reconnection] Failed to link accounts:', error);
    return { success: false, linkedCount: 0 };
  }

  console.log(`[Reconnection] Successfully linked ${accountIds.length} accounts to new connection`);
  return { success: true, linkedCount: accountIds.length };
}

/**
 * Link transactions to new connection
 */
export async function linkConnectionToTransactions(
  newConnectionId: string,
  accountIds: string[]
): Promise<{ success: boolean; linkedCount: number }> {
  console.log(`[Reconnection] Linking transactions for ${accountIds.length} accounts to connection ${newConnectionId}`);

  // First get the count
  const { count: txCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .in('account_id', accountIds);

  // Then do the update
  const { error } = await supabase
    .from('transactions')
    .update({
      connection_id: newConnectionId,
      updated_at: new Date().toISOString(),
    })
    .in('account_id', accountIds);

  if (error) {
    console.error('[Reconnection] Failed to link transactions:', error);
    return { success: false, linkedCount: 0 };
  }

  console.log(`[Reconnection] Successfully linked ${txCount || 0} transactions to new connection`);
  return { success: true, linkedCount: txCount || 0 };
}

/**
 * Record reconnection event for audit trail
 */
export async function recordReconnectionEvent(
  tenantId: string,
  newConnectionId: string,
  previousConnectionId: string | null,
  matchedAccountCount: number,
  transactionCount: number,
  confidence: string
): Promise<void> {
  console.log('[Reconnection] Recording reconnection event');

  await supabase.from('connection_history').insert({
    tenant_id: tenantId,
    connection_id: newConnectionId,
    previous_connection_id: previousConnectionId,
    event_type: 'reconnection',
    event_data: {
      matched_accounts: matchedAccountCount,
      linked_transactions: transactionCount,
      confidence,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Get recommended sync start date for reconnection
 * (start from last synced date to avoid refetching old data)
 */
export async function getReconnectionSyncStartDate(
  accountIds: string[]
): Promise<Date | null> {
  const { data } = await supabase
    .from('transactions')
    .select('transaction_date')
    .in('account_id', accountIds)
    .order('transaction_date', { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    // Start from the day after the last transaction
    const lastDate = new Date(data[0].transaction_date);
    lastDate.setDate(lastDate.getDate() + 1);
    console.log(`[Reconnection] Recommended sync start date: ${lastDate.toISOString()}`);
    return lastDate;
  }

  console.log('[Reconnection] No previous transactions found, will fetch full history');
  return null;
}

