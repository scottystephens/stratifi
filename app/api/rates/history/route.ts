import { NextRequest, NextResponse } from 'next/server'
import { getHistoricalRates } from '@/lib/services/exchange-rate-service'

const RANGE_MAP: Record<string, number> = {
  '7D': 7,
  '30D': 30,
  '90D': 90
}

const RATE_TYPES = ['SPOT', 'EOM', 'AVG'] as const
type RateTypeParam = (typeof RATE_TYPES)[number]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pairsParam = searchParams.get('pairs')
  const rangeParam = (searchParams.get('range') || '30D').toUpperCase()
  const customDays = Number(searchParams.get('days'))
  const requestedType = (searchParams.get('type') || 'SPOT').toUpperCase()

  if (!pairsParam) {
    return NextResponse.json({ error: 'pairs query parameter is required' }, { status: 400 })
  }

  if (!RATE_TYPES.includes(requestedType as RateTypeParam)) {
    return NextResponse.json({ error: 'Invalid rate type provided' }, { status: 400 })
  }

  const pairs = pairsParam
    .split(',')
    .map(pair => {
      const [from, to] = pair.split(/[-_/]/).map(part => part.trim().toUpperCase())
      if (!from || !to) return null
      return { from, to }
    })
    .filter(Boolean) as { from: string; to: string }[]

  if (pairs.length === 0) {
    return NextResponse.json({ error: 'Invalid pairs provided' }, { status: 400 })
  }

  const days = RANGE_MAP[rangeParam] ?? (customDays > 0 ? customDays : 30)

  try {
    const data = await getHistoricalRates(pairs, days, requestedType as RateTypeParam)
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('[API] history error', error)
    return NextResponse.json({ error: error.message ?? 'Failed to fetch history' }, { status: 500 })
  }
}

