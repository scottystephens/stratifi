import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle } from 'lucide-react'
import { ExchangeRateCharts } from '@/components/exchange-rate-charts'
import { getExchangeRates } from '@/lib/supabase'

interface ExchangeRate {
  currency_code: string
  currency_name: string
  rate: number
  date: string
  source: string
}

interface Currency {
  code: string
  name: string
  symbol: string
  region: string
}

const CURRENCIES: Currency[] = [
  { code: 'EUR', name: 'Euro', symbol: '€', region: 'Eurozone' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', region: 'Japan' },
  { code: 'GBP', name: 'British Pound', symbol: '£', region: 'UK' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', region: 'Australia' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', region: 'Canada' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', region: 'Switzerland' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', region: 'China' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', region: 'Sweden' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', region: 'New Zealand' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'Mex$', region: 'Mexico' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', region: 'Singapore' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', region: 'Hong Kong' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', region: 'Norway' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', region: 'South Korea' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', region: 'Turkey' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', region: 'India' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', region: 'Brazil' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', region: 'South Africa' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽', region: 'Russia' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', region: 'Denmark' },
]

// Fallback data using last known rates
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

async function getRates() {
  // Check if Supabase is configured
  const useSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!useSupabase) {
    return {
      rates: FALLBACK_RATES,
      usingFallback: true,
      message: 'Supabase not configured. Using fallback exchange rates.',
    }
  }

  try {
    // Call Supabase REST API (works reliably on Vercel with both IPv4 and IPv6)
    const rates = await getExchangeRates()
    
    return {
      rates: rates as ExchangeRate[],
      usingFallback: false,
      count: rates.length,
    }
  } catch (error) {
    console.error('Error fetching rates from Supabase:', error)
    return {
      rates: FALLBACK_RATES,
      usingFallback: true,
      message: 'Failed to load rates from Supabase: ' + (error instanceof Error ? error.message : 'Unknown error')
    }
  }
}

export default async function ExchangeRatesPage() {
  const data = await getRates()
  // Convert rate strings to numbers (PostgreSQL returns numeric as strings)
  const rates: ExchangeRate[] = (data.rates || []).map((rate: any) => ({
    ...rate,
    rate: typeof rate.rate === 'string' ? parseFloat(rate.rate) : rate.rate
  }))
  const usingFallback = data.usingFallback || false
  const message = data.message || ''

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Exchange Rates</h1>
          <p className="text-gray-600">USD to major world currencies • Updated daily at 00:00 UTC</p>
          {rates.length > 0 && rates[0].date && (
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {new Date(rates[0].date).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          )}
        </div>

        {usingFallback && (
          <Card className="mb-6 p-4 bg-yellow-50 border-yellow-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <div>
                <h3 className="font-semibold text-yellow-900">Using Fallback Data</h3>
                <p className="text-sm text-yellow-800">{message}</p>
                <p className="text-xs text-yellow-700 mt-2">
                  To enable live rates, configure DATABASE_URL environment variable in Vercel.
                </p>
              </div>
            </div>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-4 mb-8">
          <Card className="p-6">
            <div className="text-sm text-gray-600 mb-1">Total Currencies</div>
            <div className="text-3xl font-bold text-gray-900">{rates.length}</div>
          </Card>
          
          <Card className="p-6">
            <div className="text-sm text-gray-600 mb-1">Highest Rate</div>
            <div className="text-3xl font-bold text-gray-900">
              {rates.length > 0 ? Math.max(...rates.map(r => r.rate)).toFixed(2) : '-'}
            </div>
          </Card>
          
          <Card className="p-6">
            <div className="text-sm text-gray-600 mb-1">Lowest Rate</div>
            <div className="text-3xl font-bold text-gray-900">
              {rates.length > 0 ? Math.min(...rates.map(r => r.rate)).toFixed(4) : '-'}
            </div>
          </Card>
          
          <Card className="p-6">
            <div className="text-sm text-gray-600 mb-1">Data Source</div>
            <div className="text-lg font-bold text-gray-900">
              {rates[0]?.source || 'N/A'}
            </div>
          </Card>
        </div>

        {/* Interactive Charts */}
        {rates.length > 0 && !usingFallback && (
          <ExchangeRateCharts rates={rates} />
        )}

        <Card className="p-6 mt-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Code</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Currency</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Rate (1 USD)</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">100 USD =</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">1000 USD =</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => {
                  const currency = CURRENCIES.find(c => c.code === rate.currency_code)
                  return (
                    <tr key={rate.currency_code} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="font-mono font-semibold">
                          {rate.currency_code}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900">{rate.currency_name}</div>
                        <div className="text-sm text-gray-500">{currency?.symbol} • {currency?.region}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-gray-900">
                        {rate.rate.toFixed(4)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-blue-600">
                        {(100 * rate.rate).toFixed(2)} <span className="text-gray-500">{currency?.symbol}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-indigo-600">
                        {(1000 * rate.rate).toFixed(2)} <span className="text-gray-500">{currency?.symbol}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            
            {rates.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No exchange rates available
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6 mt-6 bg-blue-50 border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-2">About Exchange Rates</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Data Source: Frankfurter.app (European Central Bank)</li>
            <li>• Updates: Automatically daily at 00:00 UTC via Vercel Cron</li>
            <li>• Coverage: Top 20 most liquid world currencies</li>
            <li>• Base Currency: United States Dollar (USD)</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
