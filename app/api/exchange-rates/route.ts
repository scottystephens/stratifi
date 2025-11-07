import { NextResponse } from 'next/server'
import { getExchangeRates, getExchangeRateHistory, ExchangeRate } from '@/lib/supabase'

// Fallback data using last known rates (if database is not available)
const FALLBACK_RATES: ExchangeRate[] = [
  { currency_code: 'EUR', currency_name: 'Euro', rate: 0.92, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'JPY', currency_name: 'Japanese Yen', rate: 149.50, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'GBP', currency_name: 'British Pound', rate: 0.79, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'AUD', currency_name: 'Australian Dollar', rate: 1.53, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'CAD', currency_name: 'Canadian Dollar', rate: 1.36, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'CHF', currency_name: 'Swiss Franc', rate: 0.88, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'CNY', currency_name: 'Chinese Yuan', rate: 7.24, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'SEK', currency_name: 'Swedish Krona', rate: 10.87, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'NZD', currency_name: 'New Zealand Dollar', rate: 1.69, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'MXN', currency_name: 'Mexican Peso', rate: 17.08, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'SGD', currency_name: 'Singapore Dollar', rate: 1.34, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'HKD', currency_name: 'Hong Kong Dollar', rate: 7.83, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'NOK', currency_name: 'Norwegian Krone', rate: 10.94, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'KRW', currency_name: 'South Korean Won', rate: 1380.45, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'TRY', currency_name: 'Turkish Lira', rate: 32.18, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'INR', currency_name: 'Indian Rupee', rate: 83.32, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'BRL', currency_name: 'Brazilian Real', rate: 4.97, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'ZAR', currency_name: 'South African Rand', rate: 18.12, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'RUB', currency_name: 'Russian Ruble', rate: 92.50, date: new Date().toISOString().split('T')[0], source: 'fallback' },
  { currency_code: 'DKK', currency_name: 'Danish Krone', rate: 6.89, date: new Date().toISOString().split('T')[0], source: 'fallback' },
]

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const currencyCode = searchParams.get('currency')
    const days = searchParams.get('days')
    
  // Check if Supabase is configured
  const useSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!useSupabase) {
      console.warn('[Exchange Rates API] Database not configured, using fallback data')
      return NextResponse.json({
        rates: FALLBACK_RATES,
        usingFallback: true,
        message: 'Supabase not configured. Using fallback exchange rates.',
      })
    }
    
    // Get history for a specific currency
    if (currencyCode && days) {
      const history = await getExchangeRateHistory(currencyCode, parseInt(days))
      return NextResponse.json({
        currency: currencyCode,
        days: parseInt(days),
        history,
      })
    }
    
    // Get rates for a specific date or latest
    const rates = await getExchangeRates(date || undefined)
    
    return NextResponse.json({
      rates,
      count: rates.length,
      date: rates[0]?.date || null,
    })
    
  } catch (error) {
    console.error('[Exchange Rates API] Error:', error)
    
    // Return fallback data on error
    return NextResponse.json({
      rates: FALLBACK_RATES,
      usingFallback: true,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Using fallback exchange rates due to error',
    })
  }
}

