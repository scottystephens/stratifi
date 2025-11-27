/**
 * Normalization Service
 *
 * Transforms raw JSONB data from provider APIs into standard Stratiri
 * account and transaction formats. This service is the single source
 * of truth for mapping logic and ensures consistent data normalization
 * across all providers.
 */

import { supabase } from '@/lib/supabase';
import type { ProviderAccount, ProviderTransaction } from '@/lib/banking-providers/base-provider';

/**
 * Parse Xero's date format: "/Date(1757808000000+0000)/" or ISO string
 * Returns a Date object
 */
function parseXeroDate(dateValue: string | null | undefined): Date {
  if (!dateValue) return new Date();
  
  // Handle Xero's /Date(timestamp)/ format
  const timestampMatch = dateValue.match(/\/Date\((\d+)([+-]\d{4})?\)\//);
  if (timestampMatch) {
    const timestamp = parseInt(timestampMatch[1], 10);
    return new Date(timestamp);
  }
  
  // Handle ISO string format or other parseable formats
  const parsed = new Date(dateValue);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  // Fallback to current date if parsing fails
  console.warn(`[Normalization] Failed to parse Xero date: ${dateValue}`);
  return new Date();
}

export class NormalizationService {

  // ==========================================
  // PLAID NORMALIZATION
  // ==========================================

  /**
   * Transform raw Plaid account data into standard ProviderAccount format
   */
  async normalizePlaidAccounts(connectionId: string, tenantId: string): Promise<ProviderAccount[]> {
    console.log(`[Normalization] Normalizing Plaid accounts for connection ${connectionId}`);

    // Fetch raw Plaid accounts
    const { data: rawAccounts, error } = await supabase
      .from('plaid_accounts')
      .select('*')
      .eq('connection_id', connectionId);

    if (error) {
      console.error('[Normalization] Failed to fetch raw Plaid accounts:', error);
      throw new Error(`Failed to fetch raw Plaid accounts: ${error.message}`);
    }

    if (!rawAccounts || rawAccounts.length === 0) {
      console.log(`[Normalization] No raw Plaid accounts found for connection ${connectionId}`);
      return [];
    }

    // Transform to standard ProviderAccount format
    const normalizedAccounts = rawAccounts.map((raw) => {
      const account = raw.raw_account_data as any;
      const institution = raw.raw_institution_data as any;

      return {
        externalAccountId: account.account_id,
        accountName: account.name || account.official_name,
        accountNumber: account.mask,
        accountType: this.mapPlaidAccountType(account.type, account.subtype),
        currency: account.balances?.iso_currency_code || account.balances?.unofficial_currency_code || 'USD',
        balance: account.balances?.current || account.balances?.available || 0,
        status: 'active' as const,
        institutionId: institution?.institution_id,
        institutionName: institution?.name,
        institutionLogo: institution?.logo,
        institutionUrl: institution?.url,
        institutionData: institution,  // Complete institution object
        metadata: {
          plaid_account_id: account.account_id,
          official_name: account.official_name,
          subtype: account.subtype,
          verification_status: account.verification_status,
          // Auto-capture any other fields Plaid adds in future
          raw_plaid_data: account,
        },
      };
    });

    console.log(`[Normalization] Normalized ${normalizedAccounts.length} Plaid accounts`);
    return normalizedAccounts;
  }

  /**
   * Transform raw Plaid transaction data into standard ProviderTransaction format
   */
  async normalizePlaidTransactions(connectionId: string): Promise<ProviderTransaction[]> {
    console.log(`[Normalization] Normalizing Plaid transactions for connection ${connectionId}`);

    // Fetch raw Plaid transactions
    const { data: rawTxs, error } = await supabase
      .from('plaid_transactions')
      .select('*')
      .eq('connection_id', connectionId);

    if (error) {
      console.error('[Normalization] Failed to fetch raw Plaid transactions:', error);
      throw new Error(`Failed to fetch raw Plaid transactions: ${error.message}`);
    }

    if (!rawTxs || rawTxs.length === 0) {
      console.log(`[Normalization] No raw Plaid transactions found for connection ${connectionId}`);
      return [];
    }

    // Create a map of external account IDs to internal account IDs
    console.log(`[Normalization] Looking up accounts for Plaid connection ${connectionId}...`);
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('account_id, external_account_id')
      .eq('connection_id', connectionId);

    if (accountsError) {
      console.error('[Normalization] Failed to fetch accounts for mapping:', accountsError);
    }

    console.log(`[Normalization] Found ${accounts?.length || 0} accounts for mapping`);
    accounts?.forEach(account => {
      console.log(`[Normalization] Account mapping: ${account.external_account_id} -> ${account.account_id}`);
    });

    const accountIdMap = new Map<string, string>();
    accounts?.forEach(account => {
      if (account.external_account_id) {
        accountIdMap.set(account.external_account_id, account.account_id);
      }
    });

    const normalizedTxs = rawTxs.map((raw) => {
      const tx = raw.raw_transaction_data as any;
      const internalAccountId = accountIdMap.get(tx.account_id) || tx.account_id; // Fallback to external if not found
      console.log(`[Normalization] Transaction ${tx.transaction_id}: external account ${tx.account_id} -> internal ${internalAccountId}`);

      return {
        externalTransactionId: tx.transaction_id,
        accountId: internalAccountId,  // Use internal account_id, not external
        date: new Date(tx.date),
        amount: Math.abs(tx.amount),  // Store absolute value, determine type below
        currency: tx.iso_currency_code || tx.unofficial_currency_code || 'USD',
        description: tx.name || tx.merchant_name,
        type: (tx.amount < 0 ? 'debit' : 'credit') as 'credit' | 'debit',
        counterpartyName: tx.merchant_name || tx.name,
        counterpartyAccount: tx.account_owner,
        reference: tx.transaction_id,
        category: (() => {
          const rawCategory = tx.category;
          const processedCategory = rawCategory?.join(' > ') || 'Uncategorized';
          console.log(`[Normalization] Transaction ${tx.transaction_id}: raw category =`, rawCategory, '-> processed =', processedCategory);
          return processedCategory;
        })(),
        metadata: {
          pending: tx.pending,
          payment_channel: tx.payment_channel,
          transaction_code: tx.transaction_code,
          location: tx.location,
          // Preserve ALL Plaid fields
          raw_plaid_transaction: tx,
        },
      };
    });

    console.log(`[Normalization] Normalized ${normalizedTxs.length} Plaid transactions`);
    return normalizedTxs;
  }

  // ==========================================
  // TINK NORMALIZATION
  // ==========================================

  /**
   * Transform raw Tink account data into standard ProviderAccount format
   */
  async normalizeTinkAccounts(connectionId: string, tenantId: string): Promise<ProviderAccount[]> {
    console.log(`[Normalization] Normalizing Tink accounts for connection ${connectionId}`);

    const { data: rawAccounts, error } = await supabase
      .from('tink_accounts')
      .select('*')
      .eq('connection_id', connectionId);

    if (error) {
      console.error('[Normalization] Failed to fetch raw Tink accounts:', error);
      throw new Error(`Failed to fetch raw Tink accounts: ${error.message}`);
    }

    if (!rawAccounts || rawAccounts.length === 0) {
      console.log(`[Normalization] No raw Tink accounts found for connection ${connectionId}`);
      return [];
    }

    const normalizedAccounts = rawAccounts.map((raw) => {
      const account = raw.raw_account_data as any;

      // Extract balance from Tink v2 API structure
      let balance = 0;
      let currency = 'EUR';

      if (account.balances?.booked?.amount) {
        balance = this.formatTinkAmount(account.balances.booked.amount.value);
        currency = account.balances.booked.amount.currencyCode;
      } else if (account.balances?.available?.amount) {
        balance = this.formatTinkAmount(account.balances.available.amount.value);
        currency = account.balances.available.amount.currencyCode;
      }

      return {
        externalAccountId: account.id,
        accountName: account.name || account.accountNumber,
        accountNumber: account.accountNumber,
        accountType: this.mapTinkAccountType(account.type),
        currency,
        balance,
        iban: account.identifiers?.iban?.iban || account.identifiers?.iban,
        bic: account.identifiers?.iban?.bic,
        status: (account.closed ? 'closed' : 'active') as 'active' | 'inactive' | 'closed',
        institutionId: account.financialInstitutionId,
        institutionName: this.mapTinkInstitution(account.financialInstitutionId),
        metadata: {
          tink_account_id: account.id,
          holder_name: account.holderName,
          flags: account.flags,
          // Preserve complete Tink data
          raw_tink_data: account,
        },
      };
    });

    console.log(`[Normalization] Normalized ${normalizedAccounts.length} Tink accounts`);
    return normalizedAccounts;
  }

  /**
   * Transform raw Tink transaction data into standard ProviderTransaction format
   */
  async normalizeTinkTransactions(connectionId: string): Promise<ProviderTransaction[]> {
    console.log(`[Normalization] Normalizing Tink transactions for connection ${connectionId}`);

    const { data: rawTxs, error } = await supabase
      .from('tink_transactions')
      .select('*')
      .eq('connection_id', connectionId);

    if (error) {
      console.error('[Normalization] Failed to fetch raw Tink transactions:', error);
      throw new Error(`Failed to fetch raw Tink transactions: ${error.message}`);
    }

    if (!rawTxs || rawTxs.length === 0) {
      console.log(`[Normalization] No raw Tink transactions found for connection ${connectionId}`);
      return [];
    }

    // Create a map of external account IDs to internal account IDs
    const { data: accounts } = await supabase
      .from('accounts')
      .select('account_id, external_account_id')
      .eq('connection_id', connectionId);

    const accountIdMap = new Map<string, string>();
    accounts?.forEach(account => {
      if (account.external_account_id) {
        accountIdMap.set(account.external_account_id, account.account_id);
      }
    });

    const normalizedTxs = rawTxs.map((raw) => {
      const tx = raw.raw_transaction_data as any;
      const externalAccountId = tx.accountId || raw.account_id;
      const internalAccountId = accountIdMap.get(externalAccountId) || externalAccountId; // Fallback to external if not found

      // Handle Tink amount structure
      const amount = this.formatTinkAmount(tx.amount?.value || tx.amount);
      const currency = tx.amount?.currencyCode || 'EUR';

      return {
        externalTransactionId: tx.id,
        accountId: internalAccountId,  // Use internal account_id, not external
        date: new Date(tx.dates?.booked || tx.date),
        amount: Math.abs(amount),
        currency,
        description: tx.descriptions?.original || tx.description,
        type: (amount < 0 ? 'debit' : 'credit') as 'credit' | 'debit',
        counterpartyName: tx.descriptions?.display || tx.payee,
        reference: tx.reference,
        category: tx.category?.code,
        metadata: {
          tink_transaction_id: tx.id,
          pending: tx.pending,
          types: tx.types,
          // Preserve complete Tink data
          raw_tink_transaction: tx,
        },
      };
    });

    console.log(`[Normalization] Normalized ${normalizedTxs.length} Tink transactions`);
    return normalizedTxs;
  }

  // ==========================================
  // XERO NORMALIZATION
  // ==========================================

  /**
   * Transform raw Xero account data into standard ProviderAccount format
   * Now includes balance data from Bank Summary report
   */
  async normalizeXeroAccounts(connectionId: string, tenantId: string): Promise<ProviderAccount[]> {
    console.log(`[Normalization] Normalizing Xero accounts for connection ${connectionId}`);

    // Fetch raw Xero accounts
    const { data: rawAccounts, error } = await supabase
      .from('xero_accounts')
      .select('*')
      .eq('connection_id', connectionId);

    if (error) {
      console.error('[Normalization] Failed to fetch raw Xero accounts:', error);
      throw new Error(`Failed to fetch raw Xero accounts: ${error.message}`);
    }

    if (!rawAccounts || rawAccounts.length === 0) {
      console.log(`[Normalization] No raw Xero accounts found for connection ${connectionId}`);
      return [];
    }

    // Fetch stored balances from xero_balances table (if available)
    const { data: storedBalances } = await supabase
      .from('xero_balances')
      .select('*')
      .eq('connection_id', connectionId)
      .order('balance_date', { ascending: false });

    // Create balance lookup map (latest balance per account)
    const balanceMap = new Map<string, { closing_balance: number; opening_balance: number; balance_date: string }>();
    storedBalances?.forEach(b => {
      if (!balanceMap.has(b.account_id)) {
        balanceMap.set(b.account_id, {
          closing_balance: b.closing_balance,
          opening_balance: b.opening_balance,
          balance_date: b.balance_date,
        });
      }
    });

    console.log(`[Normalization] Found ${balanceMap.size} account balances from xero_balances`);

    // Filter to only BANK type accounts and transform to standard ProviderAccount format
    const normalizedAccounts = rawAccounts
      .filter((raw) => {
        const account = raw.raw_account_data as any;
        return account.Type === 'BANK' && account.Status === 'ACTIVE';
      })
      .map((raw) => {
        const account = raw.raw_account_data as any;
        const accountId = account.AccountID;
        
        // Get balance from stored balances
        const balanceData = balanceMap.get(accountId);
        const balance = balanceData?.closing_balance ?? 0;

        console.log(`[Normalization] Account ${account.Name}: balance = ${balance} (from ${balanceData ? 'xero_balances' : 'default'})`);

        return {
          externalAccountId: accountId,
          accountName: account.Name,
          accountNumber: account.BankAccountNumber || undefined,
          accountType: this.mapXeroAccountType(account.Type, account.BankAccountType),
          currency: account.CurrencyCode || 'USD',
          balance, // Now populated from Bank Summary report!
          status: account.Status === 'ACTIVE' ? ('active' as const) : ('inactive' as const),
          institutionName: 'Xero',
          metadata: {
            xero_account_id: accountId,
            code: account.Code,
            name: account.Name,
            type: account.Type,
            class: account.Class,
            description: account.Description,
            tax_type: account.TaxType,
            bank_account_type: account.BankAccountType,
            currency_code: account.CurrencyCode,
            xero_tenant_id: raw.xero_tenant_id,
            // Balance metadata
            opening_balance: balanceData?.opening_balance,
            closing_balance: balanceData?.closing_balance,
            balance_date: balanceData?.balance_date,
            // Preserve complete Xero data
            raw_xero_account: account,
          },
        };
      });

    console.log(`[Normalization] Normalized ${normalizedAccounts.length} Xero accounts with balances`);
    return normalizedAccounts;
  }

  /**
   * Transform raw Xero transaction data into standard ProviderTransaction format
   */
  async normalizeXeroTransactions(connectionId: string): Promise<ProviderTransaction[]> {
    console.log(`[Normalization] Normalizing Xero transactions for connection ${connectionId}`);

    // Fetch raw Xero transactions
    const { data: rawTxs, error } = await supabase
      .from('xero_transactions')
      .select('*')
      .eq('connection_id', connectionId);

    if (error) {
      console.error('[Normalization] Failed to fetch raw Xero transactions:', error);
      throw new Error(`Failed to fetch raw Xero transactions: ${error.message}`);
    }

    if (!rawTxs || rawTxs.length === 0) {
      console.log(`[Normalization] No raw Xero transactions found for connection ${connectionId}`);
      return [];
    }

    // Create a map of external account IDs to internal account IDs
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('account_id, id, external_account_id')
      .eq('connection_id', connectionId);

    if (accountsError) {
      console.error('[Normalization] Failed to fetch accounts for mapping:', accountsError);
    }

    const accountIdMap = new Map<string, string>();
    console.log(`[Normalization] Building account ID map from ${accounts?.length || 0} accounts:`);
    accounts?.forEach(account => {
      if (account.external_account_id) {
        // Use account_id (TEXT primary key) for transaction foreign key
        accountIdMap.set(account.external_account_id, account.account_id);
        console.log(`[Normalization]   ${account.external_account_id} -> ${account.account_id}`);
      }
    });

    const normalizedTxs = rawTxs
      .filter((raw) => {
        const tx = raw.raw_transaction_data as any;
        // Only include AUTHORISED or SUBMITTED transactions
        return tx.Status === 'AUTHORISED' || tx.Status === 'SUBMITTED';
      })
      .map((raw) => {
        const tx = raw.raw_transaction_data as any;
        const externalAccountId = tx.BankAccount?.AccountID || raw.account_id;
        const internalAccountId = accountIdMap.get(externalAccountId);
        
        // Log mapping for debugging
        if (!internalAccountId) {
          console.warn(`[Normalization] ⚠️ No internal account found for external ID: ${externalAccountId}`);
        }

        // Determine if transaction is credit or debit
        const isCredit = tx.Type === 'RECEIVE' || tx.Type === 'RECEIVE-OVERPAYMENT';
        const amount = Math.abs(tx.Total || 0);

        // Get description from various sources
        const description =
          tx.Reference ||
          tx.LineItems?.[0]?.Description ||
          tx.Contact?.Name ||
          'Xero Transaction';

        // Skip transactions without a valid internal account ID
        if (!internalAccountId) {
          return null;
        }

        return {
          externalTransactionId: tx.BankTransactionID,
          accountId: internalAccountId,
          date: parseXeroDate(tx.Date || tx.DateString),  // Use Xero-specific date parser
          amount,
          currency: tx.CurrencyCode || 'USD',
          description,
          type: (isCredit ? 'credit' : 'debit') as 'credit' | 'debit',
          status: tx.Status === 'AUTHORISED' ? ('posted' as const) : ('pending' as const),
          counterpartyName: tx.Contact?.Name || undefined,
          reference: tx.Reference || undefined,
          category: tx.LineItems?.[0]?.AccountCode || undefined,
          metadata: {
            xero_transaction_id: tx.BankTransactionID,
            xero_tenant_id: raw.xero_tenant_id,
            type: tx.Type,
            status: tx.Status,
            sub_total: tx.SubTotal,
            total_tax: tx.TotalTax,
            total: tx.Total,
            is_reconciled: tx.IsReconciled,
            contact: tx.Contact,
            line_items: tx.LineItems,
            updated_date_utc: tx.UpdatedDateUTC,
            // Preserve complete Xero data
            raw_xero_transaction: tx,
          },
        };
      })
      .filter((tx): tx is NonNullable<typeof tx> => tx !== null); // Filter out null entries

    const skipped = rawTxs.length - normalizedTxs.length;
    if (skipped > 0) {
      console.warn(`[Normalization] ⚠️ Skipped ${skipped} transactions due to missing account mappings`);
    }
    console.log(`[Normalization] Normalized ${normalizedTxs.length} Xero transactions`);
    return normalizedTxs;
  }

  // ==========================================
  // DIRECT BANK NORMALIZATION (Universal)
  // ==========================================

  /**
   * Transform raw direct bank account data into standard ProviderAccount format
   * Works for Standard Bank, ABSA, Nedbank, and any future direct bank APIs
   */
  async normalizeDirectBankAccounts(connectionId: string, providerId: string): Promise<ProviderAccount[]> {
    console.log(`[Normalization] Normalizing ${providerId} accounts for connection ${connectionId}`);

    const { data: rawAccounts, error } = await supabase
      .from('direct_bank_accounts')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('provider_id', providerId);

    if (error) {
      console.error(`[Normalization] Failed to fetch raw ${providerId} accounts:`, error);
      throw new Error(`Failed to fetch raw ${providerId} accounts: ${error.message}`);
    }

    if (!rawAccounts || rawAccounts.length === 0) {
      console.log(`[Normalization] No raw ${providerId} accounts found for connection ${connectionId}`);
      return [];
    }

    const normalizedAccounts = rawAccounts.map((raw) => {
      const account = raw.raw_account_data as any;

      return {
        externalAccountId: account.accountId || account.id || account.accountNumber,
        accountName: account.accountName || account.name || account.accountNumber,
        accountNumber: account.accountNumber,
        accountType: this.mapDirectBankAccountType(account.accountType || account.type, providerId),
        currency: account.currency || account.currencyCode || 'ZAR',
        balance: this.parseDirectBankAmount(account.balance || account.currentBalance || account.availableBalance),
        iban: account.iban,
        bic: account.bic,
        status: account.status || 'active',
        institutionId: account.institutionId || account.bankId,
        institutionName: this.mapDirectBankInstitution(account.institutionId || account.bankId, providerId),
        metadata: {
          provider_id: providerId,
          external_account_id: raw.external_account_id,
          // Preserve complete bank data
          raw_bank_data: account,
        },
      };
    });

    console.log(`[Normalization] Normalized ${normalizedAccounts.length} ${providerId} accounts`);
    return normalizedAccounts;
  }

  /**
   * Transform raw direct bank transaction data into standard ProviderTransaction format
   */
  async normalizeDirectBankTransactions(connectionId: string, providerId: string): Promise<ProviderTransaction[]> {
    console.log(`[Normalization] Normalizing ${providerId} transactions for connection ${connectionId}`);

    const { data: rawTxs, error } = await supabase
      .from('direct_bank_transactions')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('provider_id', providerId);

    if (error) {
      console.error(`[Normalization] Failed to fetch raw ${providerId} transactions:`, error);
      throw new Error(`Failed to fetch raw ${providerId} transactions: ${error.message}`);
    }

    if (!rawTxs || rawTxs.length === 0) {
      console.log(`[Normalization] No raw ${providerId} transactions found for connection ${connectionId}`);
      return [];
    }

    // Create a map of external account IDs to internal account IDs
    const { data: accounts } = await supabase
      .from('accounts')
      .select('account_id, external_account_id')
      .eq('connection_id', connectionId);

    const accountIdMap = new Map<string, string>();
    accounts?.forEach(account => {
      if (account.external_account_id) {
        accountIdMap.set(account.external_account_id, account.account_id);
      }
    });

    const normalizedTxs = rawTxs.map((raw) => {
      const tx = raw.raw_transaction_data as any;
      const externalAccountId = tx.accountId || raw.external_account_id;
      const internalAccountId = accountIdMap.get(externalAccountId) || externalAccountId; // Fallback to external if not found

      const amount = this.parseDirectBankAmount(tx.amount || tx.value || tx.transactionAmount);
      const currency = tx.currency || tx.currencyCode || raw.currency || 'ZAR';

      return {
        externalTransactionId: tx.transactionId || tx.id || tx.reference,
        accountId: internalAccountId,  // Use internal account_id, not external
        date: new Date(tx.date || tx.transactionDate || tx.bookingDate || tx.valueDate),
        amount: Math.abs(amount),
        currency,
        description: tx.description || tx.narrative || tx.reference,
        type: (amount < 0 ? 'debit' : 'credit') as 'credit' | 'debit',
        counterpartyName: tx.counterpartyName || tx.payee || tx.beneficiary,
        counterpartyAccount: tx.counterpartyAccount || tx.accountNumber,
        reference: tx.reference || tx.transactionId,
        category: tx.category,
        metadata: {
          provider_id: providerId,
          transaction_type: tx.transactionType || tx.type,
          status: tx.status,
          // Preserve complete bank data
          raw_bank_transaction: tx,
        },
      };
    });

    console.log(`[Normalization] Normalized ${normalizedTxs.length} ${providerId} transactions`);
    return normalizedTxs;
  }

  // ==========================================
  // ACCOUNT TYPE MAPPING HELPERS
  // ==========================================

  /**
   * Map Plaid account types to Stratiri standard types
   */
  private mapPlaidAccountType(type: string, subtype?: string): string {
    const typeMap: Record<string, string> = {
      'depository': 'checking',
      'credit': 'credit_card',
      'loan': 'loan',
      'investment': 'investment',
      'other': 'other',
    };

    // Use subtype if available for more precision
    if (subtype) {
      const subtypeMap: Record<string, string> = {
        'checking': 'checking',
        'savings': 'savings',
        'cd': 'certificate_of_deposit',
        'money_market': 'money_market',
        'paypal': 'digital_wallet',
        'credit_card': 'credit_card',
        'auto': 'auto_loan',
        'student': 'student_loan',
        'mortgage': 'mortgage',
        '401k': 'retirement',
        'ira': 'retirement',
      };

      return subtypeMap[subtype] || typeMap[type] || 'other';
    }

    return typeMap[type] || 'other';
  }

  /**
   * Map Tink account types to Stratiri standard types
   */
  private mapTinkAccountType(type: string): string {
    const typeMap: Record<string, string> = {
      'CHECKING': 'checking',
      'SAVINGS': 'savings',
      'CREDIT_CARD': 'credit_card',
      'INVESTMENT': 'investment',
      'LOAN': 'loan',
      'MORTGAGE': 'mortgage',
      'PENSION': 'retirement',
      'OTHER': 'other',
    };

    return typeMap[type] || 'other';
  }

  /**
   * Map Xero account types to Stratiri standard types
   */
  private mapXeroAccountType(xeroType: string, bankAccountType?: string): string {
    // Map Xero account types to Stratiri standard types
    if (xeroType === 'BANK') {
      if (bankAccountType === 'CREDITCARD') {
        return 'credit_card';
      }
      if (bankAccountType === 'SAVINGS') {
        return 'savings';
      }
      return 'checking'; // Default for BANK type
    }

    return 'other';
  }

  /**
   * Map direct bank account types to Stratiri standard types
   */
  private mapDirectBankAccountType(type: string, providerId: string): string {
    // Provider-specific mappings
    if (providerId === 'standard_bank_sa') {
      const sbTypeMap: Record<string, string> = {
        'CURRENT': 'checking',
        'SAVINGS': 'savings',
        'TRANSMIT': 'checking',
        'CREDIT': 'credit_card',
        'LOAN': 'loan',
      };
      return sbTypeMap[type] || 'checking';
    }

    // Generic mapping
    const genericMap: Record<string, string> = {
      'checking': 'checking',
      'savings': 'savings',
      'current': 'checking',
      'credit': 'credit_card',
      'loan': 'loan',
      'investment': 'investment',
    };

    return genericMap[type.toLowerCase()] || 'checking';
  }

  // ==========================================
  // INSTITUTION MAPPING HELPERS
  // ==========================================

  /**
   * Map Tink institution IDs to human-readable names
   */
  private mapTinkInstitution(institutionId: string): string {
    // This would be a lookup table or API call in production
    // For now, return a formatted version
    if (!institutionId) return 'Unknown Bank';

    // Common Tink institution ID patterns
    const knownInstitutions: Record<string, string> = {
      'tink://banks/se/ing': 'ING Bank (Sweden)',
      'tink://banks/no/dnb': 'DNB Bank (Norway)',
      'tink://banks/dk/danske': 'Danske Bank (Denmark)',
      'tink://banks/fi/nordea': 'Nordea Bank (Finland)',
    };

    return knownInstitutions[institutionId] || institutionId.replace('tink://banks/', '').replace(/\//g, ' ').toUpperCase();
  }

  /**
   * Map direct bank institution IDs to human-readable names
   */
  private mapDirectBankInstitution(institutionId: string, providerId: string): string {
    // Provider-specific institution mappings
    if (providerId === 'standard_bank_sa') {
      return 'Standard Bank South Africa';
    }

    if (providerId === 'absa_sa') {
      return 'ABSA Bank South Africa';
    }

    if (providerId === 'nedbank_sa') {
      return 'Nedbank South Africa';
    }

    // Generic fallback
    return institutionId || 'Unknown Bank';
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
}

// Export singleton instance
export const normalizationService = new NormalizationService();
