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

