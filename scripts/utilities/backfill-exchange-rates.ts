// Backfill historical exchange rates from Frankfurter API
// Usage: npx tsx scripts/utilities/backfill-exchange-rates.ts

import { upsertExchangeRate } from '../../lib/supabase'

const FRANKFURTER_API = 'https://api.frankfurter.app'
const CURRENCY_CODES = ['EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK', 'NZD', 'MXN', 'SGD', 'HKD', 'NOK', 'KRW', 'TRY', 'INR', 'BRL', 'ZAR', 'RUB', 'DKK']

const CURRENCY_NAMES: Record<string, string> = {
  EUR: 'Euro',
  JPY: 'Japanese Yen',
  GBP: 'British Pound',
  AUD: 'Australian Dollar',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  CNY: 'Chinese Yuan',
  SEK: 'Swedish Krona',
  NZD: 'New Zealand Dollar',
  MXN: 'Mexican Peso',
  SGD: 'Singapore Dollar',
  HKD: 'Hong Kong Dollar',
  NOK: 'Norwegian Krone',
  KRW: 'South Korean Won',
  TRY: 'Turkish Lira',
  INR: 'Indian Rupee',
  BRL: 'Brazilian Real',
  ZAR: 'South African Rand',
  RUB: 'Russian Ruble',
  DKK: 'Danish Krone',
}

interface FrankfurterTimeSeriesResponse {
  amount: number
  base: string
  start_date: string
  end_date: string
  rates: Record<string, Record<string, number>>
}

async function fetchHistoricalRates(startDate: string, endDate: string): Promise<FrankfurterTimeSeriesResponse> {
  const currencies = CURRENCY_CODES.join(',')
  const url = `${FRANKFURTER_API}/${startDate}..${endDate}?from=USD&to=${currencies}`
  
  console.log(`Fetching: ${url}`)
  
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`Frankfurter API error: ${response.status} ${response.statusText}`)
  }
  
  return response.json()
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function backfillRates(startDate: string, endDate: string) {
  console.log(`\n🔄 Backfilling exchange rates from ${startDate} to ${endDate}`)
  console.log(`📊 Currencies: ${CURRENCY_CODES.length}`)
  console.log(`🌐 Source: Frankfurter.app (European Central Bank)\n`)

  try {
    const data = await fetchHistoricalRates(startDate, endDate)
    
    const dates = Object.keys(data.rates).sort()
    console.log(`📅 Found ${dates.length} trading days\n`)

    let successCount = 0
    let errorCount = 0

    for (const date of dates) {
      const ratesForDate = data.rates[date]
      
      for (const [code, rate] of Object.entries(ratesForDate)) {
        try {
          await upsertExchangeRate({
            currencyCode: code,
            currencyName: CURRENCY_NAMES[code] || code,
            rate: rate,
            date: date,
            source: 'frankfurter.app',
          })
          
          successCount++
          process.stdout.write(`\r✓ ${date} - ${code}: ${rate.toFixed(6)} (${successCount} / ${dates.length * CURRENCY_CODES.length})`)
          
        } catch (error) {
          errorCount++
          console.error(`\n✗ Error ${date} - ${code}:`, error instanceof Error ? error.message : error)
        }
      }
      
      // Rate limiting - Frankfurter API is generous but let's be nice
      await sleep(100)
    }

    console.log(`\n\n✅ Backfill complete!`)
    console.log(`   Success: ${successCount}`)
    console.log(`   Errors: ${errorCount}`)
    console.log(`   Dates: ${dates.length}`)
    console.log(`   Currencies: ${CURRENCY_CODES.length}`)
    
  } catch (error) {
    console.error('\n❌ Backfill failed:', error)
    process.exit(1)
  }
}

// Main execution
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const startDate = process.argv[2] || '2025-01-01'
  const endDate = process.argv[3] || new Date().toISOString().split('T')[0]

  await backfillRates(startDate, endDate)
  process.exit(0)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})

