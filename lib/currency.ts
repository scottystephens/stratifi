import { supabase } from '@/lib/supabase-client'
import { startOfMonth, subMonths, format, parseISO } from 'date-fns'

// Types
export type RateType = 'SPOT' | 'EOM' | 'AVG'

export interface ExchangeRateRequest {
  from: string
  to: string
  date?: string
  type?: RateType
}

/**
 * Core function to get a single rate
 * Uses the database function get_fx_rate which handles projection logic
 */
export async function getExchangeRate(
  from: string, 
  to: string, 
  date: Date = new Date(),
  type: RateType = 'SPOT'
): Promise<number | null> {
  const dateStr = format(date, 'yyyy-MM-dd')

  // 1. Direct Lookup (Smart DB Function)
  if (type === 'SPOT') {
    const { data, error } = await supabase
      .rpc('get_fx_rate', {
        p_currency_from: from,
        p_currency_to: to,
        p_date: dateStr,
        p_rate_type: 'SPOT'
      })
    
    if (data !== null) return Number(data)
  }

  // 2. Monthly Average
  if (type === 'AVG') {
    const { data, error } = await supabase
      .rpc('get_monthly_average', {
        p_currency_from: from,
        p_currency_to: to,
        p_month_date: dateStr
      })
    
    if (data !== null) return Number(data)
  }

  // 3. End of Previous Month
  if (type === 'EOM') {
    // Logic: If we want EOM for "Jan", we usually mean "End of Jan". 
    // But if the type is "PREVIOUS_PERIOD_END", we might mean "End of Dec" relative to Jan.
    // Let's assume EOM means "End of the requested month".
    // For "Previous Period End" specifically, the caller should pass the appropriate date or we use a helper.
    
    // However, the database function `get_previous_period_end` does exactly "End of Prev Month".
    // Let's stick to standard types.
    
    // If we strictly want the rate at the end of the requested month:
    // This is just a SPOT rate on the last day of the month.
    // We can use get_fx_rate with the last day.
    
    // But if we want the SPECIAL logic "Previous Period End" (common in reporting):
    const { data } = await supabase
      .rpc('get_previous_period_end', {
        p_currency_from: from,
        p_currency_to: to,
        p_target_date: dateStr
      })
      
    if (data !== null) return Number(data)
  }

  // 4. Triangulation Fallback
  // If no direct pair exists (e.g. GBP -> EUR), try going through USD
  // Rate(GBP -> EUR) = Rate(GBP -> USD) * Rate(USD -> EUR)
  //                  = (1 / Rate(USD -> GBP)) * Rate(USD -> EUR)
  
  if (from !== 'USD' && to !== 'USD') {
    const [rateToUSD, rateFromUSD] = await Promise.all([
      getExchangeRate(from, 'USD', date, type),
      getExchangeRate('USD', to, date, type)
    ])

    if (rateToUSD && rateFromUSD) {
      return rateToUSD * rateFromUSD
    }
  }

  return null
}

/**
 * Batch fetcher for efficiency
 */
export async function getExchangeRates(requests: ExchangeRateRequest[]) {
  // Implementation for bulk fetching could be optimized with a single RPC call
  // For now, parallelize
  return Promise.all(
    requests.map(async req => ({
      ...req,
      rate: await getExchangeRate(req.from, req.to, req.date ? parseISO(req.date) : new Date(), req.type)
    }))
  )
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount)
}

