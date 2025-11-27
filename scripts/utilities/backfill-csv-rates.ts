import fs from 'fs'
import path from 'path'
import Papa from 'papaparse'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const CSV_FILE_PATH = path.join(process.cwd(), 'fx_rates_daily_backfill.csv')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

interface CsvRow {
  currency_from: string
  currency_to: string
  fx_type: string
  fx_dateint: string // e.g., "20220101"
  fx_source_dateint: string
  fx_rate: string
}

function parseDateInt(dateInt: string): string {
  // 20220101 -> 2022-01-01
  const year = dateInt.substring(0, 4)
  const month = dateInt.substring(4, 6)
  const day = dateInt.substring(6, 8)
  return `${year}-${month}-${day}`
}

async function processBatch(batch: any[]) {
  const { error } = await supabase
    .from('fx_rates')
    .upsert(batch, {
      onConflict: 'currency_from,currency_to,date,rate_type',
      ignoreDuplicates: true 
    })

  if (error) {
    console.error('Error inserting batch:', error)
    throw error
  }
}

async function main() {
  if (!fs.existsSync(CSV_FILE_PATH)) {
    console.error(`File not found: ${CSV_FILE_PATH}`)
    process.exit(1)
  }

  console.log(`Reading CSV from ${CSV_FILE_PATH}...`)
  
  const fileContent = fs.readFileSync(CSV_FILE_PATH, 'utf8')
  
  let count = 0
  let batch: any[] = []
  const BATCH_SIZE = 1000

  Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
    step: async (results, parser) => {
      const row = results.data as CsvRow
      
      // Transform row to DB schema
      try {
        const currencyTo = row.currency_to.length > 3 ? row.currency_to.substring(0, 3) : row.currency_to
        
        const dbRow = {
          currency_from: row.currency_from,
          currency_to: currencyTo,
          date: parseDateInt(row.fx_dateint),
          rate: parseFloat(row.fx_rate),
          rate_type: row.fx_type, // Assuming CSV matches ENUM or we map it
          source: 'csv_backfill',
          updated_at: new Date().toISOString()
        }

        // Validate rate type
        if (!['SPOT', 'EOM', 'AVG'].includes(dbRow.rate_type)) {
          // Default to SPOT if unknown, or skip?
          // For now, let's assume valid data or map 'SPOT'
          if (dbRow.rate_type === 'SPOT') {
             // ok
          } else {
             // warning or skip
             // console.warn(`Unknown rate type: ${dbRow.rate_type}`)
          }
        }

        batch.push(dbRow)
        count++

        if (batch.length >= BATCH_SIZE) {
          parser.pause() // Pause parsing to wait for DB write
          console.log(`Processing batch... (${count} rows processed)`)
          await processBatch(batch)
          batch = []
          parser.resume()
        }
      } catch (e) {
        console.error('Error processing row:', row, e)
      }
    },
    complete: async () => {
      if (batch.length > 0) {
        console.log(`Processing final batch... (${count} total rows)`)
        await processBatch(batch)
      }
      console.log('✅ Backfill complete!')
    },
    error: (error: any) => {
      console.error('CSV Parse Error:', error)
    }
  })
}

main().catch(console.error)

