import { NextResponse } from 'next/server'
import { fetchLatestRates, storeRates } from '@/lib/services/exchange-rate-service'

export async function GET() {
  try {
    const latest = await fetchLatestRates()
    const result = await storeRates(latest)
    return NextResponse.json({ success: true, result })
  } catch (error: any) {
    console.error('[Cron] update rates failed', error)
    return NextResponse.json({ error: error.message ?? 'Failed to update rates' }, { status: 500 })
  }
}

