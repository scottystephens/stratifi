import { NextResponse } from 'next/server'
import { fetchLatestRates, fetchHistoricalRates, storeRates } from '@/lib/services/exchange-rate-service'
import { subDays, format } from 'date-fns'

export const maxDuration = 300 // 5 minutes for serverless function

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    // Simple auth check for cron jobs
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Allow manual trigger in development or if explicitly allowed
      const { searchParams } = new URL(request.url)
      if (searchParams.get('key') !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const results = []

    // 1. Fetch Latest Rates (Today)
    console.log('[FX] Starting daily update...')
    const latestData = await fetchLatestRates()
    const latestResult = await storeRates(latestData)
    results.push({ date: 'latest', ...latestResult })

    // 2. Fetch Last 2 Days (Historical) to ensure we have recent history
    // This covers weekends or missed cron runs
    const today = new Date()
    for (let i = 1; i <= 2; i++) {
      const historicalDate = subDays(today, i)
      const dateStr = format(historicalDate, 'yyyy-MM-dd')
      
      console.log(`[FX] Backfilling historical rates for ${dateStr}...`)
      try {
        const histData = await fetchHistoricalRates(dateStr)
        // Ensure timestamp in data matches requested date (Open Exchange Rates returns timestamp)
        // storeRates uses the timestamp from the response
        const histResult = await storeRates(histData)
        results.push({ date: dateStr, ...histResult })
      } catch (err) {
        console.error(`[FX] Failed to fetch historical for ${dateStr}:`, err)
        results.push({ date: dateStr, error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Exchange rates updated successfully (Latest + 2 days history)',
      results
    })

  } catch (error) {
    console.error('[FX] Update failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
