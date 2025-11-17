// Supabase client for server-side operations
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Create a single supabase client for interacting with your database
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Database types
export interface ExchangeRate {
  id?: number
  currency_code: string
  currency_name: string
  rate: number
  date: string
  source: string
  updated_at?: string
  created_at?: string
}

// Exchange Rate queries using Supabase REST API
export async function getExchangeRates(date?: string) {
  try {
    let query = supabase
      .from('exchange_rates')
      .select('*')
      .order('currency_code')

    if (date) {
      query = query.eq('date', date)
    } else {
      // Get the latest date's rates
      const { data: latestDate } = await supabase
        .from('exchange_rates')
        .select('date')
        .order('date', { ascending: false })
        .limit(1)
        .single()

      if (latestDate) {
        query = query.eq('date', latestDate.date)
      }
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching exchange rates:', error)
    throw error
  }
}

export async function getLatestExchangeRate(currencyCode: string) {
  try {
    const { data, error } = await supabase
      .from('exchange_rates')
      .select('*')
      .eq('currency_code', currencyCode)
      .order('date', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') throw error // PGRST116 = not found
    return data || null
  } catch (error) {
    console.error('Error fetching latest exchange rate:', error)
    throw error
  }
}

export async function upsertExchangeRate(data: {
  currencyCode: string
  currencyName: string
  rate: number
  date: string
  source: string
}) {
  try {
    const { data: result, error } = await supabase
      .from('exchange_rates')
      .upsert(
        {
          currency_code: data.currencyCode,
          currency_name: data.currencyName,
          rate: data.rate,
          date: data.date,
          source: data.source,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'currency_code,date',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single()

    if (error) throw error
    return result
  } catch (error) {
    console.error('Error upserting exchange rate:', error)
    throw error
  }
}

export async function getExchangeRateHistory(currencyCode: string, days: number = 30) {
  try {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data, error } = await supabase
      .from('exchange_rates')
      .select('*')
      .eq('currency_code', currencyCode)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: false })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching exchange rate history:', error)
    throw error
  }
}

export async function convertAmountToUsd(amount: number | null | undefined, currencyCode: string | null | undefined) {
  if (amount === null || amount === undefined || !currencyCode) {
    return null
  }

  const normalizedCode = currencyCode.toUpperCase()
  if (normalizedCode === 'USD') {
    return amount
  }

  try {
    const latestRate = await getLatestExchangeRate(normalizedCode)
    if (!latestRate?.rate) {
      return null
    }

    return amount * latestRate.rate
  } catch (error) {
    console.error('convertAmountToUsd error:', error)
    return null
  }
}

// =====================================================
// Account Statements
// =====================================================

export interface AccountStatement {
  id?: string
  tenant_id: string
  account_id: string
  statement_date: string
  ending_balance: number
  available_balance?: number | null
  currency: string
  usd_equivalent?: number | null
  source: 'synced' | 'calculated' | 'manual' | 'imported'
  confidence?: 'high' | 'medium' | 'low'
  ingested_at?: string
  metadata?: Record<string, any>
}

export interface UpsertAccountStatementInput {
  tenantId: string
  accountId: string
  statementDate: string
  endingBalance: number
  availableBalance?: number | null
  currency: string
  usdEquivalent?: number | null
  source: 'synced' | 'calculated' | 'manual' | 'imported'
  confidence?: 'high' | 'medium' | 'low'
  metadata?: Record<string, any>
}

export interface AccountStatementQueryOptions {
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
}

export async function upsertAccountStatement(input: UpsertAccountStatementInput) {
  try {
    const payload = {
      tenant_id: input.tenantId,
      account_id: input.accountId,
      statement_date: input.statementDate,
      ending_balance: input.endingBalance,
      available_balance: input.availableBalance ?? null,
      currency: input.currency,
      usd_equivalent: input.usdEquivalent ?? null,
      source: input.source,
      confidence: input.confidence ?? 'high',
      metadata: input.metadata ?? {},
      ingested_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('account_statements')
      .upsert(payload, {
        onConflict: 'account_id,statement_date',
      })
      .select()
      .single()

    if (error) throw error
    return data as AccountStatement
  } catch (error) {
    console.error('Error upserting account statement:', error)
    throw error
  }
}

export async function getAccountStatements(
  tenantId: string,
  accountId: string,
  options?: AccountStatementQueryOptions
) {
  try {
    const page = Math.max(options?.page ?? 1, 1)
    const pageSize = Math.min(Math.max(options?.pageSize ?? 100, 1), 500)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('account_statements')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('account_id', accountId)
      .order('statement_date', { ascending: false })
      .range(from, to)

    if (options?.startDate) {
      query = query.gte('statement_date', options.startDate)
    }

    if (options?.endDate) {
      query = query.lte('statement_date', options.endDate)
    }

    const { data, error, count } = await query

    if (error) throw error
    return {
      statements: (data || []) as AccountStatement[],
      count: count || 0,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil((count || 0) / pageSize), 1),
      hasMore: (count || 0) > page * pageSize,
    }
  } catch (error) {
    console.error('Error fetching account statements:', error)
    throw error
  }
}

// Health check
export async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase
      .from('exchange_rates')
      .select('count')
      .limit(1)

    if (error) throw error
    return true
  } catch (error) {
    console.error('Supabase connection test failed:', error)
    return false
  }
}

// =====================================================
// Tenant-Aware Query Functions
// All functions below automatically filter by tenant_id
// =====================================================

// Entities
export async function getEntitiesByTenant(tenantId: string) {
  try {
    const { data, error } = await supabase
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('entity_id')

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching entities:', error)
    throw error
  }
}

export async function getEntityById(tenantId: string, entityId: string) {
  try {
    const { data, error } = await supabase
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('entity_id', entityId)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data || null
  } catch (error) {
    console.error('Error fetching entity:', error)
    throw error
  }
}

// Transactions
export async function getTransactionsByTenant(tenantId: string, limit?: number) {
  try {
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('date', { ascending: false })

    if (limit) {
      query = query.limit(limit)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching transactions:', error)
    throw error
  }
}

export async function getTransactionsByAccount(tenantId: string, accountId: string, limit?: number) {
  try {
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('account_id', accountId)
      .order('date', { ascending: false })

    if (limit) {
      query = query.limit(limit)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching transactions:', error)
    throw error
  }
}

// Payments
export async function getPaymentsByTenant(tenantId: string) {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('scheduled_date', { ascending: false })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching payments:', error)
    throw error
  }
}

export async function getPaymentsByStatus(tenantId: string, status: string) {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', status)
      .order('scheduled_date')

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching payments:', error)
    throw error
  }
}

// Forecasts
export async function getForecastsByTenant(tenantId: string) {
  try {
    const { data, error } = await supabase
      .from('forecasts')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('date')

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching forecasts:', error)
    throw error
  }
}

export async function getForecastsByEntity(tenantId: string, entityId: string) {
  try {
    const { data, error } = await supabase
      .from('forecasts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('entity_id', entityId)
      .order('date')

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching forecasts:', error)
    throw error
  }
}

// =====================================================
// Data Ingestion Functions
// =====================================================

// Connections
export async function getConnections(tenantId: string) {
  try {
    const { data, error } = await supabase
      .from('connections')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching connections:', error)
    throw error
  }
}

export async function getConnection(tenantId: string, connectionId: string) {
  try {
    const { data, error } = await supabase
      .from('connections')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', connectionId)
      .single()
    
    if (error) throw error
    return data
  } catch (error) {
    console.error('Error fetching connection:', error)
    throw error
  }
}

export async function createConnection(connection: {
  tenant_id: string
  name: string
  connection_type: string
  config: any
  account_id?: string
  import_mode?: string
  created_by: string
  provider?: string
  oauth_state?: string
}) {
  try {
    console.log('📝 createConnection - Input data:', JSON.stringify(connection, null, 2));
    console.log('📝 createConnection - Service key available:', !!supabaseServiceKey);
    
    const { data, error } = await supabase
      .from('connections')
      .insert(connection)
      .select()
      .single()
    
    console.log('📝 createConnection - Result:', { 
      success: !!data, 
      error: error ? {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      } : null 
    });
    
    if (error) {
      console.error('❌ createConnection - Database error:', JSON.stringify(error, null, 2));
      throw new Error(`Database error: ${error.message} (${error.code})`);
    }
    return data
  } catch (error) {
    console.error('❌ createConnection - Exception:', error);
    throw error
  }
}

export async function updateConnection(
  tenantId: string,
  connectionId: string,
  updates: Partial<{
    name: string
    status: string
    config: any
    last_sync_at: string
    next_sync_at: string
    import_mode: string
    last_error: string
  }>
) {
  try {
    const { data, error } = await supabase
      .from('connections')
      .update(updates)
      .eq('tenant_id', tenantId)
      .eq('id', connectionId)
      .select()
      .single()
    
    if (error) throw error
    return data
  } catch (error) {
    console.error('Error updating connection:', error)
    throw error
  }
}

export async function deleteConnection(tenantId: string, connectionId: string) {
  try {
    const { error } = await supabase
      .from('connections')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', connectionId)
    
    if (error) throw error
  } catch (error) {
    console.error('Error deleting connection:', error)
    throw error
  }
}

// Ingestion Jobs
export async function createIngestionJob(job: {
  tenant_id: string
  connection_id: string
  job_type: string
  status: string
}) {
  try {
    const { data, error } = await supabase
      .from('ingestion_jobs')
      .insert({
        ...job,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()
    
    if (error) throw error
    return data
  } catch (error) {
    console.error('Error creating ingestion job:', error)
    throw error
  }
}

export async function updateIngestionJob(
  jobId: string,
  updates: Partial<{
    status: string
    records_fetched: number
    records_processed: number
    records_imported: number
    records_skipped: number
    records_failed: number
    error_message: string
    error_details: any
    summary: any
    completed_at: string
  }>
) {
  try {
    const { data, error} = await supabase
      .from('ingestion_jobs')
      .update(updates)
      .eq('id', jobId)
      .select()
      .single()
    
    if (error) throw error
    return data
  } catch (error) {
    console.error('Error updating ingestion job:', error)
    throw error
  }
}

export async function getIngestionJobs(tenantId: string, limit = 50) {
  try {
    const { data, error } = await supabase
      .from('ingestion_jobs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching ingestion jobs:', error)
    throw error
  }
}

export async function getIngestionJobsByConnection(tenantId: string, connectionId: string, limit = 20) {
  try {
    const { data, error } = await supabase
      .from('ingestion_jobs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching connection jobs:', error)
    throw error
  }
}

// Raw Ingestion Data
export async function createRawIngestionData(data: {
  tenant_id: string
  connection_id: string
  job_id: string
  raw_data: any
  file_name?: string
  file_size_bytes?: number
}) {
  try {
    const { data: result, error } = await supabase
      .from('raw_ingestion_data')
      .insert(data)
      .select()
      .single()
    
    if (error) throw error
    return result
  } catch (error) {
    console.error('Error storing raw ingestion data:', error)
    throw error
  }
}

// Transactions with deduplication
export async function importTransactions(transactions: Array<{
  tenant_id: string
  account_id: string
  transaction_date: string
  amount: number
  currency?: string
  description: string
  transaction_type: string
  connection_id: string
  external_transaction_id?: string
  source_type: string
  import_job_id: string
  raw_data_id?: string
  metadata?: any
}>) {
  try {
    // Use upsert to handle duplicates
    const { data, error } = await supabase
      .from('transactions')
      .upsert(transactions, {
        onConflict: 'tenant_id,connection_id,external_transaction_id',
        ignoreDuplicates: false,
      })
      .select()
    
    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error importing transactions:', error)
    throw error
  }
}

// Delete transactions by connection (for override mode)
export async function deleteTransactionsByConnection(tenantId: string, connectionId: string) {
  try {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('connection_id', connectionId)
    
    if (error) throw error
  } catch (error) {
    console.error('Error deleting transactions:', error)
    throw error
  }
}

// Audit logging
export async function createAuditLog(log: {
  tenant_id: string
  connection_id?: string
  job_id?: string
  event_type: string
  event_data?: any
  user_id?: string
  ip_address?: string
}) {
  try {
    const { error } = await supabase
      .from('ingestion_audit_log')
      .insert(log)
    
    if (error) throw error
  } catch (error) {
    console.error('Error creating audit log:', error)
    // Don't throw - audit logging should not break the main flow
  }
}

// =====================================================
// Accounts Management Functions
// =====================================================

export interface Account {
  id?: string
  account_id?: string // Primary key in database
  tenant_id: string
  entity_id?: string | null // Link to entity (optional)
  account_name: string
  account_number?: string
  account_type: string
  account_status?: string
  bank_name?: string
  bank_identifier?: string
  branch_name?: string
  branch_code?: string
  currency?: string
  balance?: number // Shorthand for current_balance (backward compatibility)
  opening_date?: string
  closing_date?: string
  interest_rate?: number
  current_balance?: number
  available_balance?: number
  ledger_balance?: number
  overdraft_limit?: number
  credit_limit?: number
  minimum_balance?: number
  business_unit?: string
  cost_center?: string
  gl_account_code?: string
  purpose?: string
  account_manager?: string
  authorized_signers?: string[]
  external_account_id?: string
  plaid_account_id?: string
  sync_enabled?: boolean
  last_synced_at?: string
  custom_fields?: Record<string, any>
  notes?: string
  tags?: string[]
  created_at?: string
  updated_at?: string
  created_by?: string
  // New fields from migration 11
  provider_id?: string
  connection_id?: string
  iban?: string
  bic?: string
  account_holder_name?: string
  // Connection metadata (populated via join)
  connections?: {
    provider?: string
    name?: string
    status?: string
  }
  // Computed fields for UI convenience
  connection_provider?: string
  connection_name?: string
  connection_status?: string
  is_synced?: boolean // true if connection_id is not null
  provider_sync_status?: string
  provider_sync_error?: string | null
  provider_sync_duration_ms?: number | null
  provider_last_synced_at?: string | null
  statement_snapshot?: {
    statement_date: string
    ending_balance: number
    available_balance?: number | null
    currency: string
    source: string
    confidence?: string
  } | null
}

export async function getAccountsByTenant(tenantId: string, includeConnection: boolean = true) {
  try {
    // Build select query with optional connection join
    let query = supabase
      .from('accounts')
      .select(`
        *,
        ${includeConnection ? `connections:connection_id(
          provider,
          name,
          status
        ),` : ''}
        provider_accounts:provider_accounts_account_id_fkey(
          id,
          last_synced_at,
          last_sync_status,
          last_sync_error,
          last_sync_duration_ms
        ),
        latest_statement:account_statements_account_id_fkey(
          statement_date,
          ending_balance,
          available_balance,
          currency,
          source,
          confidence
        )
      `)
      .eq('tenant_id', tenantId)
      .order('account_name')
      .order('statement_date', {
        ascending: false,
        foreignTable: 'account_statements_account_id_fkey',
      })
      .limit(1, { foreignTable: 'account_statements_account_id_fkey' })

    const { data, error } = await query

    if (error) throw error
    
    // Transform data to flatten connection metadata for easier UI access
    const accounts = (data || []).map((account: any) => {
      const result: Account = { ...account }
      
      // Flatten connection data for convenience
      if (account.connections) {
        result.connection_provider = account.connections.provider
        result.connection_name = account.connections.name
        result.connection_status = account.connections.status
      }

      const providerMeta = Array.isArray(account.provider_accounts) && account.provider_accounts.length > 0
        ? account.provider_accounts[0]
        : null

      if (providerMeta) {
        result.provider_sync_status = providerMeta.last_sync_status
        result.provider_sync_error = providerMeta.last_sync_error
        result.provider_sync_duration_ms = providerMeta.last_sync_duration_ms
        result.provider_last_synced_at = providerMeta.last_synced_at
      }

      const latestStatement =
        Array.isArray(account.latest_statement) && account.latest_statement.length > 0
          ? account.latest_statement[0]
          : null

      if (latestStatement) {
        result.statement_snapshot = {
          statement_date: latestStatement.statement_date,
          ending_balance: latestStatement.ending_balance,
          available_balance: latestStatement.available_balance,
          currency: latestStatement.currency,
          source: latestStatement.source,
          confidence: latestStatement.confidence,
        }
      } else {
        result.statement_snapshot = null
      }

      // Cleanup raw relationship payloads
      delete (result as any).provider_accounts
      delete (result as any).latest_statement
      
      // Compute is_synced flag
      result.is_synced = !!account.connection_id
      
      return result
    })
    
    return accounts
  } catch (error) {
    console.error('Error fetching accounts:', error)
    throw error
  }
}

export async function getAccountById(tenantId: string, accountId: string) {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', accountId)
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error fetching account:', error)
    throw error
  }
}

export async function createAccount(account: Account) {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .insert(account)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error creating account:', error)
    throw error
  }
}

export async function updateAccount(
  tenantId: string,
  accountId: string,
  updates: Partial<Account>
) {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('tenant_id', tenantId)
      .eq('id', accountId)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error updating account:', error)
    throw error
  }
}

export async function deleteAccount(tenantId: string, accountId: string) {
  try {
    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', accountId)

    if (error) throw error
  } catch (error) {
    console.error('Error deleting account:', error)
    throw error
  }
}

// Get accounts summary with transaction counts and balances
export async function getAccountsSummary(tenantId: string) {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select(`
        *,
        transactions:transactions(count)
      `)
      .eq('tenant_id', tenantId)
      .order('account_name')

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching accounts summary:', error)
    throw error
  }
}
