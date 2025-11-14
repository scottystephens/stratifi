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

// Accounts
export async function getAccountsByTenant(tenantId: string) {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'Active')
      .order('account_id')

    if (error) throw error
    return data || []
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
      .eq('account_id', accountId)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data || null
  } catch (error) {
    console.error('Error fetching account:', error)
    throw error
  }
}

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
}) {
  try {
    const { data, error } = await supabase
      .from('connections')
      .insert(connection)
      .select()
      .single()
    
    if (error) throw error
    return data
  } catch (error) {
    console.error('Error creating connection:', error)
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
      .select('*, connections(name, connection_type)')
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
