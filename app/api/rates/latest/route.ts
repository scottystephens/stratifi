import { NextResponse, NextRequest } from 'next/server'
import { getLatestRates } from '@/lib/services/exchange-rate-service'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const baseCurrency = (searchParams.get('base') || 'USD').toUpperCase()
  const limit = Number(searchParams.get('limit') ?? '100')

  try {
    const data = await getLatestRates(baseCurrency, limit)
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('[API] latest rates error', error)
    return NextResponse.json({ error: error.message ?? 'Unable to fetch latest rates' }, { status: 500 })
  }
}

