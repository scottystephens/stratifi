'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  ArrowUpDown, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  RefreshCw,
  Search,
  Calculator,
  Download,
  AlertCircle
} from 'lucide-react'

// Currency definitions
const TOP_CURRENCIES = [
  { code: 'EUR', name: 'Euro', symbol: '€', region: 'Eurozone' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', region: 'Japan' },
  { code: 'GBP', name: 'British Pound', symbol: '£', region: 'United Kingdom' },
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

interface ExchangeRate {
  id?: number
  currency_code: string
  currency_name: string
  rate: number
  date: string
  source: string
  updated_at?: string
  created_at?: string
}

function formatExchangeRate(rate: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(rate)
}

function convertFromUSD(usdAmount: number, rate: number): number {
  return usdAmount * rate
}

export default function ExchangeRatesPage() {
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<'currency_code' | 'rate' | 'currency_name'>('currency_code')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [usdAmount, setUsdAmount] = useState(100)
  const [usingFallback, setUsingFallback] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRates = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/exchange-rates')
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.usingFallback) {
        setUsingFallback(true)
        setError(data.message || 'Using fallback data')
      } else {
        setUsingFallback(false)
      }
      
      setRates(data.rates || [])
      if (data.rates && data.rates.length > 0) {
        setLastUpdated(data.rates[0].date)
      }
    } catch (err) {
      console.error('Failed to fetch rates:', err)
      setError(err instanceof Error ? err.message : 'Failed to load exchange rates')
    } finally {
      setLoading(false)
    }
  }

  const manualUpdate = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/exchange-rates/update', {
        method: 'POST',
      })
      const data = await response.json()
      
      if (data.success) {
        await fetchRates()
      } else {
        setError(data.error || 'Update failed')
      }
    } catch (err) {
      console.error('Failed to update rates:', err)
      setError('Failed to update rates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRates()
  }, [])

  const filteredAndSortedRates = rates
    .filter(rate => {
      const query = searchQuery.toLowerCase()
      return (
        rate.currency_code.toLowerCase().includes(query) ||
        rate.currency_name.toLowerCase().includes(query)
      )
    })
    .sort((a, b) => {
      let aVal: string | number, bVal: string | number
      
      if (sortField === 'rate') {
        aVal = a.rate
        bVal = b.rate
      } else {
        aVal = a[sortField].toLowerCase()
        bVal = b[sortField].toLowerCase()
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const exportToCSV = () => {
    const headers = ['Currency Code', 'Currency Name', 'Rate (USD)', 'Date', 'Source']
    const rows = filteredAndSortedRates.map(rate => [
      rate.currency_code,
      rate.currency_name,
      rate.rate.toString(),
      rate.date,
      rate.source
    ])
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `exchange-rates-${lastUpdated}.csv`
    a.click()
  }

  if (loading && rates.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading exchange rates...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Exchange Rates
          </h1>
          <p className="text-gray-600">
            USD to major world currencies • Updated daily at 00:00 UTC
          </p>
          {lastUpdated && (
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {new Date(lastUpdated).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          )}
        </div>

        {/* Alert for fallback data */}
        {usingFallback && (
          <Card className="mb-6 p-4 bg-yellow-50 border-yellow-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-900">Using Fallback Data</h3>
                <p className="text-sm text-yellow-800 mt-1">{error}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Currencies</p>
                <p className="text-3xl font-bold text-gray-900">{rates.length}</p>
              </div>
              <DollarSign className="w-10 h-10 text-blue-600" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Highest Rate</p>
                <p className="text-3xl font-bold text-gray-900">
                  {rates.length > 0 ? formatExchangeRate(Math.max(...rates.map(r => r.rate))) : '-'}
                </p>
              </div>
              <TrendingUp className="w-10 h-10 text-green-600" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Lowest Rate</p>
                <p className="text-3xl font-bold text-gray-900">
                  {rates.length > 0 ? formatExchangeRate(Math.min(...rates.map(r => r.rate))) : '-'}
                </p>
              </div>
              <TrendingDown className="w-10 h-10 text-red-600" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Data Source</p>
                <p className="text-lg font-bold text-gray-900">
                  {rates[0]?.source || 'N/A'}
                </p>
              </div>
              <RefreshCw className="w-10 h-10 text-purple-600" />
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Rates Table */}
          <div className="lg:col-span-2">
            <Card className="p-6">
              {/* Search and Actions */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search currencies..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={exportToCSV}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
                <button
                  onClick={manualUpdate}
                  disabled={loading || usingFallback}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  Update
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th 
                        className="text-left py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                        onClick={() => toggleSort('currency_code')}
                      >
                        <div className="flex items-center gap-2">
                          Code
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </th>
                      <th 
                        className="text-left py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                        onClick={() => toggleSort('currency_name')}
                      >
                        <div className="flex items-center gap-2">
                          Currency
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </th>
                      <th 
                        className="text-right py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                        onClick={() => toggleSort('rate')}
                      >
                        <div className="flex items-center justify-end gap-2">
                          Rate (1 USD)
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">
                        {usdAmount} USD
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedRates.map((rate) => {
                      const currency = TOP_CURRENCIES.find(c => c.code === rate.currency_code)
                      return (
                        <tr 
                          key={rate.currency_code} 
                          className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="font-mono">
                              {rate.currency_code}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <div className="font-medium text-gray-900">
                                {rate.currency_name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {currency?.symbol} • {currency?.region}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-gray-900">
                            {formatExchangeRate(rate.rate)}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-blue-600">
                            {formatExchangeRate(convertFromUSD(usdAmount, rate.rate))}
                            <span className="text-gray-500 ml-1">{currency?.symbol}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                
                {filteredAndSortedRates.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    No currencies found matching &quot;{searchQuery}&quot;
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Currency Calculator */}
          <div className="lg:col-span-1">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-6">
                <Calculator className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-900">Calculator</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    USD Amount
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="number"
                      value={usdAmount}
                      onChange={(e) => setUsdAmount(Number(e.target.value))}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-semibold"
                      min="0"
                      step="10"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-3">Converts to:</p>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {rates.slice(0, 10).map((rate) => {
                      const currency = TOP_CURRENCIES.find(c => c.code === rate.currency_code)
                      return (
                        <div 
                          key={rate.currency_code}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {rate.currency_code}
                            </Badge>
                            <span className="text-sm text-gray-600">
                              {currency?.symbol}
                            </span>
                          </div>
                          <span className="font-semibold text-gray-900">
                            {formatExchangeRate(convertFromUSD(usdAmount, rate.rate))}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </Card>

            {/* Info Card */}
            <Card className="p-6 mt-6 bg-blue-50 border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-2">About Exchange Rates</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Updated daily at 00:00 UTC</li>
                <li>• Source: Frankfurter.app (ECB data)</li>
                <li>• Top 20 most liquid currencies</li>
                <li>• All rates are USD-based</li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
