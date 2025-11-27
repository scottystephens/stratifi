import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('Checking fx_rates data...\n')

  // Check SPOT rates
  const { data: spotData, error: spotError } = await supabase
    .from('fx_rates')
    .select('date')
    .eq('rate_type', 'SPOT')
    .order('date', { ascending: true })

  if (spotError) {
    console.error('Error querying SPOT rates:', spotError)
    return
  }

  const spotCount = spotData?.length || 0
  const spotEarliest = spotData?.[0]?.date
  const spotLatest = spotData?.[spotData.length - 1]?.date

  console.log(`SPOT rates: ${spotCount} records`)
  console.log(`Date range: ${spotEarliest} to ${spotLatest}\n`)

  // Check EOM rates
  const { data: eomData } = await supabase
    .from('fx_rates')
    .select('date')
    .eq('rate_type', 'EOM')

  console.log(`EOM rates: ${eomData?.length || 0} records\n`)

  // Check AVG rates
  const { data: avgData } = await supabase
    .from('fx_rates')
    .select('date')
    .eq('rate_type', 'AVG')

  console.log(`AVG rates: ${avgData?.length || 0} records\n`)

  // Get distinct currency pairs
  const { data: pairs } = await supabase
    .from('fx_rates')
    .select('currency_from, currency_to')
    .eq('rate_type', 'SPOT')
    .limit(5)

  console.log('Sample currency pairs:')
  pairs?.forEach(p => console.log(`  ${p.currency_from}/${p.currency_to}`))
}

main().catch(console.error)

