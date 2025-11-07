import { NextResponse } from 'next/server'
import { upsertExchangeRate } from '@/lib/supabase'
import { TOP_CURRENCIES, CURRENCY_CODES } from '@/lib/currency'

// Frankfurter API - Free, open source, no API key needed
const FRANKFURTER_API = 'https://api.frankfurter.app'

interface FrankfurterResponse {
  amount: number
  base: string
  date: string
  rates: Record<string, number>
}

async function fetchExchangeRates(): Promise<FrankfurterResponse> {
  const currencies = CURRENCY_CODES.join(',')
  const url = `${FRANKFURTER_API}/latest?from=USD&to=${currencies}`
  
  const response = await fetch(url, {
    next: { revalidate: 0 }, // Don't cache
  })
  
  if (!response.ok) {
    throw new Error(`Frankfurter API error: ${response.status} ${response.statusText}`)
  }
  
  return response.json()
}

export async function GET(request: Request) {
  const startTime = Date.now()
  
  try {
    // Verify cron secret for scheduled requests
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if Supabase is configured
    const useSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!useSupabase) {
      return NextResponse.json({
        success: false,
        error: 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.',
        message: 'Exchange rates update requires Supabase connection',
      }, { status: 503 })
    }

    console.log('[Exchange Rates] Starting update...')
    
    // Fetch latest rates from Frankfurter
    const data = await fetchExchangeRates()
    
    console.log(`[Exchange Rates] Fetched ${Object.keys(data.rates).length} rates from Frankfurter for ${data.date}`)
    
    // Store each rate in database
    const results = []
    const errors = []
    
    for (const [code, rate] of Object.entries(data.rates)) {
      try {
        const currency = TOP_CURRENCIES.find(c => c.code === code)
        if (!currency) continue
        
        const result = await upsertExchangeRate({
          currencyCode: code,
          currencyName: currency.name,
          rate: rate,
          date: data.date,
          source: 'frankfurter.app',
        })
        
        results.push({
          currency: code,
          rate: rate,
          success: true,
        })
        
        console.log(`[Exchange Rates] ✓ ${code}: ${rate}`)
      } catch (error) {
        console.error(`[Exchange Rates] ✗ ${code}:`, error)
        errors.push({
          currency: code,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }
    
    const duration = Date.now() - startTime
    
    const response = {
      success: true,
      message: `Updated ${results.length} exchange rates`,
      date: data.date,
      source: 'frankfurter.app',
      baseCurrency: 'USD',
      updated: results.length,
      failed: errors.length,
      duration: `${duration}ms`,
      results,
      errors: errors.length > 0 ? errors : undefined,
    }
    
    console.log(`[Exchange Rates] ✓ Update complete in ${duration}ms (${results.length} success, ${errors.length} failed)`)
    
    return NextResponse.json(response)
    
  } catch (error) {
    console.error('[Exchange Rates] Update failed:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${Date.now() - startTime}ms`,
      },
      { status: 500 }
    )
  }
}

// Allow POST as well for manual triggers
export async function POST(request: Request) {
  return GET(request)
}

