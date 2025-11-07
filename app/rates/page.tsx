'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  ArrowUpDown, 
  DollarSign, 
  RefreshCw,
  Search,
  Download,
  AlertCircle
} from 'lucide-react'

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

export default function ExchangeRatesPage() {
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)
  const [usingFallback, setUsingFallback] = useState(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    fetch('/api/exchange-rates')
      .then(res => res.json())
      .then(data => {
        setRates(data.rates || [])
        setUsingFallback(!!data.usingFallback)
        if (data.message) setError(data.message)
        setLoading(false)
      })
      .catch(err => {
        console.error('Fetch error:', err)
        setError('Failed to load')
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Exchange Rates</h1>
          <p className="text-gray-600">USD to major world currencies • Updated daily</p>
        </div>

        {usingFallback && (
          <Card className="mb-6 p-4 bg-yellow-50 border-yellow-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <div>
                <h3 className="font-semibold text-yellow-900">Using Fallback Data</h3>
                <p className="text-sm text-yellow-800">{error}</p>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Code</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Currency</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Rate (1 USD)</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">100 USD</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => {
                  const currency = CURRENCIES.find(c => c.code === rate.currency_code)
                  return (
                    <tr key={rate.currency_code} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="font-mono">{rate.currency_code}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900">{rate.currency_name}</div>
                        <div className="text-sm text-gray-500">{currency?.symbol} • {currency?.region}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-gray-900">
                        {rate.rate.toFixed(4)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-blue-600">
                        {(100 * rate.rate).toFixed(2)} {currency?.symbol}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="mt-6 p-6 bg-white rounded-lg border shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-2">About</h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Updated daily at 00:00 UTC</li>
            <li>• Source: Frankfurter.app (ECB)</li>
            <li>• Top 20 liquid currencies</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
