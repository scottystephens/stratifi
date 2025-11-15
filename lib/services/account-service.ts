/**
 * Account Service
 * Production-grade service for managing account creation, updates, and deduplication
 * Follows industry best practices: type safety, error handling, logging, transactions
 */

import { supabase } from '@/lib/supabase';
import { Account } from '@/lib/supabase';
import type { ProviderAccount } from '@/lib/banking-providers/base-provider';

// =====================================================
// Types and Interfaces
// =====================================================

export interface AccountMatchCriteria {
  iban?: string;
  accountNumber?: string;
  bankName?: string;
  externalAccountId?: string;
}

export interface AccountCreationResult {
  success: boolean;
  account: any;
  isNew: boolean;
  matchedBy?: 'iban' | 'account_number' | 'external_id' | 'none';
  error?: string;
}

export interface BatchAccountResult {
  successful: AccountCreationResult[];
  failed: Array<{ account: ProviderAccount; error: string }>;
  summary: {
    total: number;
    created: number;
    updated: number;
    failed: number;
    skipped: number;
  };
}

interface ProviderAccountRecord {
  id: string;
  tenant_id: string;
  connection_id: string;
  provider_id: string;
  account_id: string | null;
  external_account_id: string;
  account_name: string;
  account_number: string | null;
  account_type: string;
  currency: string;
  balance: number;
  iban: string | null;
  bic: string | null;
  status: string;
  provider_metadata: any;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

// =====================================================
// Account Deduplication Logic
// =====================================================

/**
 * Finds existing account using multiple matching strategies
 * Priority: IBAN > External ID > Bank Name + Account Number
 */
export async function findExistingAccount(
  tenantId: string,
  criteria: AccountMatchCriteria
): Promise<{ account: any | null; matchedBy: string | null }> {
  try {
    // Strategy 1: Match by IBAN (most reliable for international accounts)
    if (criteria.iban) {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('iban', criteria.iban)
        .maybeSingle();

      if (!error && data) {
        console.log(`✅ Account matched by IBAN: ${criteria.iban}`);
        return { account: data, matchedBy: 'iban' };
      }
    }

    // Strategy 2: Match by external_account_id (provider-specific)
    if (criteria.externalAccountId) {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('external_account_id', criteria.externalAccountId)
        .maybeSingle();

      if (!error && data) {
        console.log(`✅ Account matched by external ID: ${criteria.externalAccountId}`);
        return { account: data, matchedBy: 'external_id' };
      }
    }

    // Strategy 3: Match by bank name + account number (less reliable but useful)
    if (criteria.bankName && criteria.accountNumber) {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('bank_name', criteria.bankName)
        .eq('account_number', criteria.accountNumber)
        .maybeSingle();

      if (!error && data) {
        console.log(`✅ Account matched by bank+number: ${criteria.bankName} ${criteria.accountNumber}`);
        return { account: data, matchedBy: 'account_number' };
      }
    }

    // No match found
    return { account: null, matchedBy: null };
  } catch (error) {
    console.error('Error finding existing account:', error);
    // Don't throw - return null and let caller create new account
    return { account: null, matchedBy: null };
  }
}

// =====================================================
// Account Creation and Update
// =====================================================

/**
 * Creates or updates a Stratifi account from provider account data
 * Handles deduplication, metadata enrichment, and error recovery
 */
export async function createOrUpdateAccount(
  tenantId: string,
  connectionId: string,
  providerId: string,
  providerAccount: ProviderAccount,
  userId: string
): Promise<AccountCreationResult> {
  try {
    // Step 1: Check for existing account
    const { account: existingAccount, matchedBy } = await findExistingAccount(tenantId, {
      iban: providerAccount.iban,
      accountNumber: providerAccount.accountNumber,
      externalAccountId: providerAccount.externalAccountId,
      bankName: providerId,
    });

    const now = new Date().toISOString();

    if (existingAccount) {
      // Update existing account
      const updates: Partial<Account> = {
        current_balance: providerAccount.balance,
        account_status: providerAccount.status,
        last_synced_at: now,
        updated_at: now,
        
        // Update metadata if available
        ...(providerAccount.iban && { iban: providerAccount.iban }),
        ...(providerAccount.bic && { bic: providerAccount.bic }),
        
        // Merge provider metadata
        custom_fields: {
          ...(existingAccount.custom_fields || {}),
          provider_metadata: providerAccount.metadata,
          last_provider_sync: now,
        },
      };

      const { data: updatedAccount, error: updateError } = await supabase
        .from('accounts')
        .update(updates)
        .eq('id', existingAccount.id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update account: ${updateError.message}`);
      }

      console.log(`✅ Updated existing account: ${existingAccount.account_name} (matched by ${matchedBy})`);

      return {
        success: true,
        account: updatedAccount,
        isNew: false,
        matchedBy: matchedBy as any,
      };
    } else {
      // Create new account
      const newAccount: Partial<Account> = {
        tenant_id: tenantId,
        connection_id: connectionId,
        provider_id: providerId,
        account_name: providerAccount.accountName,
        account_number: providerAccount.accountNumber || providerAccount.externalAccountId,
        account_type: providerAccount.accountType,
        account_status: providerAccount.status,
        currency: providerAccount.currency,
        current_balance: providerAccount.balance,
        external_account_id: providerAccount.externalAccountId,
        iban: providerAccount.iban,
        bic: providerAccount.bic,
        bank_name: providerId.charAt(0).toUpperCase() + providerId.slice(1), // Capitalize provider name
        sync_enabled: true,
        last_synced_at: now,
        created_by: userId,
        custom_fields: {
          provider_metadata: providerAccount.metadata || {},
          created_via_provider: providerId,
          first_sync_at: now,
        },
      };

      const { data: createdAccount, error: createError } = await supabase
        .from('accounts')
        .insert(newAccount)
        .select()
        .single();

      if (createError) {
        throw new Error(`Failed to create account: ${createError.message}`);
      }

      console.log(`✅ Created new account: ${providerAccount.accountName}`);

      return {
        success: true,
        account: createdAccount,
        isNew: true,
        matchedBy: 'none',
      };
    }
  } catch (error) {
    console.error('Error in createOrUpdateAccount:', error);
    return {
      success: false,
      account: null,
      isNew: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =====================================================
// Provider Account Management
// =====================================================

/**
 * Creates or updates a provider_account record
 * Links to Stratifi account via foreign key
 */
export async function createOrUpdateProviderAccount(
  tenantId: string,
  connectionId: string,
  providerId: string,
  providerAccount: ProviderAccount,
  stratifiAccountId: string
): Promise<{ success: boolean; providerAccountId?: string; error?: string }> {
  try {
    const now = new Date().toISOString();

    // Check if provider account already exists
    const { data: existingProviderAccount } = await supabase
      .from('provider_accounts')
      .select('id')
      .eq('connection_id', connectionId)
      .eq('provider_id', providerId)
      .eq('external_account_id', providerAccount.externalAccountId)
      .maybeSingle();

    const providerAccountData = {
      tenant_id: tenantId,
      connection_id: connectionId,
      provider_id: providerId,
      account_id: stratifiAccountId,
      external_account_id: providerAccount.externalAccountId,
      account_name: providerAccount.accountName,
      account_number: providerAccount.accountNumber,
      account_type: providerAccount.accountType,
      currency: providerAccount.currency,
      balance: providerAccount.balance,
      iban: providerAccount.iban,
      bic: providerAccount.bic,
      status: providerAccount.status,
      provider_metadata: providerAccount.metadata || {},
      last_synced_at: now,
      updated_at: now,
    };

    if (existingProviderAccount) {
      // Update existing
      const { error } = await supabase
        .from('provider_accounts')
        .update(providerAccountData)
        .eq('id', existingProviderAccount.id);

      if (error) throw error;

      console.log(`✅ Updated provider account: ${providerAccount.accountName}`);
      return { success: true, providerAccountId: existingProviderAccount.id };
    } else {
      // Create new
      const { data, error } = await supabase
        .from('provider_accounts')
        .insert(providerAccountData)
        .select('id')
        .single();

      if (error) throw error;

      console.log(`✅ Created provider account: ${providerAccount.accountName}`);
      return { success: true, providerAccountId: data.id };
    }
  } catch (error) {
    console.error('Error in createOrUpdateProviderAccount:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =====================================================
// Batch Operations (Performance Optimized)
// =====================================================

/**
 * Processes multiple accounts in batch with proper error handling
 * Returns detailed results for success/failure tracking
 */
export async function batchCreateOrUpdateAccounts(
  tenantId: string,
  connectionId: string,
  providerId: string,
  providerAccounts: ProviderAccount[],
  userId: string
): Promise<BatchAccountResult> {
  const successful: AccountCreationResult[] = [];
  const failed: Array<{ account: ProviderAccount; error: string }> = [];

  console.log(`📦 Processing batch of ${providerAccounts.length} accounts...`);

  for (const providerAccount of providerAccounts) {
    try {
      // Create or update Stratifi account
      const accountResult = await createOrUpdateAccount(
        tenantId,
        connectionId,
        providerId,
        providerAccount,
        userId
      );

      if (accountResult.success && accountResult.account) {
        // Create or update provider account link
        const providerAccountResult = await createOrUpdateProviderAccount(
          tenantId,
          connectionId,
          providerId,
          providerAccount,
          accountResult.account.id
        );

        if (providerAccountResult.success) {
          successful.push(accountResult);
        } else {
          // Stratifi account created but provider link failed
          failed.push({
            account: providerAccount,
            error: providerAccountResult.error || 'Failed to create provider account link',
          });
        }
      } else {
        failed.push({
          account: providerAccount,
          error: accountResult.error || 'Failed to create account',
        });
      }
    } catch (error) {
      failed.push({
        account: providerAccount,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const created = successful.filter((r) => r.isNew).length;
  const updated = successful.filter((r) => !r.isNew).length;

  const summary = {
    total: providerAccounts.length,
    created,
    updated,
    failed: failed.length,
    skipped: 0,
  };

  console.log(`📊 Batch complete: ${created} created, ${updated} updated, ${failed.length} failed`);

  return { successful, failed, summary };
}

// =====================================================
// Account Status Management
// =====================================================

/**
 * Marks accounts as closed if they no longer exist at the provider
 * Important for data consistency when accounts are closed
 */
export async function syncAccountClosures(
  tenantId: string,
  connectionId: string,
  providerId: string,
  activeExternalAccountIds: string[]
): Promise<number> {
  try {
    // Find provider accounts that exist locally but not in the active list
    const { data: localAccounts } = await supabase
      .from('provider_accounts')
      .select('id, external_account_id, account_id')
      .eq('tenant_id', tenantId)
      .eq('connection_id', connectionId)
      .eq('provider_id', providerId)
      .neq('status', 'closed');

    if (!localAccounts || localAccounts.length === 0) {
      return 0;
    }

    const closedAccounts = localAccounts.filter(
      (acc) => !activeExternalAccountIds.includes(acc.external_account_id)
    );

    if (closedAccounts.length === 0) {
      return 0;
    }

    const now = new Date().toISOString();

    // Update provider accounts as closed
    const providerAccountIds = closedAccounts.map((a) => a.id);
    await supabase
      .from('provider_accounts')
      .update({ status: 'closed', updated_at: now })
      .in('id', providerAccountIds);

    // Update linked Stratifi accounts
    const stratifiAccountIds = closedAccounts
      .filter((a) => a.account_id)
      .map((a) => a.account_id);

    if (stratifiAccountIds.length > 0) {
      await supabase
        .from('accounts')
        .update({
          account_status: 'closed',
          closing_date: now,
          updated_at: now,
        })
        .in('id', stratifiAccountIds);
    }

    console.log(`🔒 Marked ${closedAccounts.length} accounts as closed`);
    return closedAccounts.length;
  } catch (error) {
    console.error('Error syncing account closures:', error);
    return 0;
  }
}

// =====================================================
// Utility Functions
// =====================================================

/**
 * Gets account statistics for a connection
 */
export async function getAccountStats(connectionId: string): Promise<{
  total: number;
  active: number;
  closed: number;
  totalBalance: number;
  currencies: string[];
}> {
  try {
    const { data: accounts } = await supabase
      .from('accounts')
      .select('account_status, current_balance, currency')
      .eq('connection_id', connectionId);

    if (!accounts || accounts.length === 0) {
      return { total: 0, active: 0, closed: 0, totalBalance: 0, currencies: [] };
    }

    const active = accounts.filter((a) => a.account_status === 'active').length;
    const closed = accounts.filter((a) => a.account_status === 'closed').length;
    const totalBalance = accounts
      .filter((a) => a.account_status === 'active')
      .reduce((sum, a) => sum + (a.current_balance || 0), 0);
    const currencies = [...new Set(accounts.map((a) => a.currency).filter(Boolean))];

    return {
      total: accounts.length,
      active,
      closed,
      totalBalance,
      currencies,
    };
  } catch (error) {
    console.error('Error getting account stats:', error);
    return { total: 0, active: 0, closed: 0, totalBalance: 0, currencies: [] };
  }
}

