import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('Testing fx_rates for USD/EUR...\n')

  // Check SPOT rates
  const { data: spotData } = await supabase
    .from('fx_rates')
    .select('*')
    .eq('currency_from', 'USD')
    .eq('currency_to', 'EUR')
    .eq('rate_type', 'SPOT')
    .order('date', { ascending: true })
    .limit(5)

  console.log('SPOT rates (USD/EUR):')
  spotData?.forEach(r => console.log(`  ${r.date}: ${r.rate} (${r.source})`))
  console.log()

  // Check EOM rates
  const { data: eomData } = await supabase
    .from('fx_rates')
    .select('*')
    .eq('currency_from', 'USD')
    .eq('currency_to', 'EUR')
    .eq('rate_type', 'EOM')
    .order('date', { ascending: true })
    .limit(5)

  console.log('EOM rates (USD/EUR):')
  eomData?.forEach(r => console.log(`  ${r.date}: ${r.rate} (${r.source})`))
  console.log()

  // Check AVG rates
  const { data: avgData } = await supabase
    .from('fx_rates')
    .select('*')
    .eq('currency_from', 'USD')
    .eq('currency_to', 'EUR')
    .eq('rate_type', 'AVG')
    .order('date', { ascending: true })
    .limit(5)

  console.log('AVG rates (USD/EUR):')
  avgData?.forEach(r => console.log(`  ${r.date}: ${r.rate} (${r.source})`))
  console.log()

  // Check EUR/USD
  const { data: eurUsdSpot } = await supabase
    .from('fx_rates')
    .select('*')
    .eq('currency_from', 'EUR')
    .eq('currency_to', 'USD')
    .eq('rate_type', 'SPOT')
    .order('date', { ascending: true })
    .limit(3)

  console.log('SPOT rates (EUR/USD):')
  eurUsdSpot?.forEach(r => console.log(`  ${r.date}: ${r.rate}`))
  console.log()

  const { data: eurUsdEom } = await supabase
    .from('fx_rates')
    .select('*')
    .eq('currency_from', 'EUR')
    .eq('currency_to', 'USD')
    .eq('rate_type', 'EOM')
    .order('date', { ascending: true })
    .limit(3)

  console.log('EOM rates (EUR/USD):')
  eurUsdEom?.forEach(r => console.log(`  ${r.date}: ${r.rate}`))
  console.log()

  const { data: eurUsdAvg } = await supabase
    .from('fx_rates')
    .select('*')
    .eq('currency_from', 'EUR')
    .eq('currency_to', 'USD')
    .eq('rate_type', 'AVG')
    .order('date', { ascending: true })
    .limit(3)

  console.log('AVG rates (EUR/USD):')
  eurUsdAvg?.forEach(r => console.log(`  ${r.date}: ${r.rate}`))
}

main().catch(console.error)

