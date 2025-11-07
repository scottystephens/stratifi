'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface ExchangeRate {
  currency_code: string
  currency_name: string
  rate: number
  date: string
  source: string
}

interface Props {
  rates: ExchangeRate[]
}

const POPULAR_CURRENCIES = ['EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF']

export function ExchangeRateCharts({ rates }: Props) {
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(POPULAR_CURRENCIES)
  const [historicalData, setHistoricalData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'7' | '30' | '90'>('30')

  useEffect(() => {
    async function fetchHistoricalData() {
      setLoading(true)
      try {
        // Fetch historical data for each selected currency
        const promises = selectedCurrencies.map(async (code) => {
          const res = await fetch(`/api/exchange-rates?currency=${code}&days=${timeRange}`)
          const data = await res.json()
          return { code, history: data.history || [] }
        })

        const results = await Promise.all(promises)
        
        // Transform data for chart
        const dateMap = new Map<string, any>()
        
        results.forEach(({ code, history }) => {
          history.forEach((item: ExchangeRate) => {
            if (!dateMap.has(item.date)) {
              dateMap.set(item.date, { date: item.date })
            }
            dateMap.get(item.date)[code] = item.rate
          })
        })

        const chartData = Array.from(dateMap.values())
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map(item => ({
            ...item,
            date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          }))

        setHistoricalData(chartData)
      } catch (error) {
        console.error('Error fetching historical data:', error)
      } finally {
        setLoading(false)
      }
    }

    if (selectedCurrencies.length > 0) {
      fetchHistoricalData()
    }
  }, [selectedCurrencies, timeRange])

  const toggleCurrency = (code: string) => {
    setSelectedCurrencies(prev =>
      prev.includes(code)
        ? prev.filter(c => c !== code)
        : [...prev, code]
    )
  }

  // Calculate rate changes
  const getRateChange = (code: string) => {
    if (historicalData.length < 2) return null
    const latest = historicalData[historicalData.length - 1][code]
    const previous = historicalData[0][code]
    if (!latest || !previous) return null
    const change = ((latest - previous) / previous) * 100
    return change
  }

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Rate Trends</h2>
          <div className="flex gap-2">
            {(['7', '30', '90'] as const).map((days) => (
              <button
                key={days}
                onClick={() => setTimeRange(days)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  timeRange === days
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {days} Days
              </button>
            ))}
          </div>
        </div>

        {/* Currency Selector */}
        <div className="mb-6">
          <p className="text-sm text-gray-600 mb-2">Select currencies to compare:</p>
          <div className="flex flex-wrap gap-2">
            {rates.map((rate) => (
              <Badge
                key={rate.currency_code}
                variant={selectedCurrencies.includes(rate.currency_code) ? 'default' : 'outline'}
                className={`cursor-pointer transition-all ${
                  selectedCurrencies.includes(rate.currency_code)
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'hover:bg-gray-100'
                }`}
                onClick={() => toggleCurrency(rate.currency_code)}
              >
                {rate.currency_code}
              </Badge>
            ))}
          </div>
        </div>

        {/* Line Chart */}
        {loading ? (
          <div className="h-80 flex items-center justify-center text-gray-500">
            Loading chart data...
          </div>
        ) : historicalData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="date" 
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '12px'
                }}
              />
              <Legend />
              {selectedCurrencies.map((code, index) => (
                <Line
                  key={code}
                  type="monotone"
                  dataKey={code}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  name={code}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-80 flex items-center justify-center text-gray-500">
            No historical data available
          </div>
        )}
      </Card>

      {/* Rate Changes */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Rate Changes ({timeRange} Days)</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {selectedCurrencies.map((code) => {
            const change = getRateChange(code)
            const isPositive = change ? change > 0 : false
            const rate = rates.find(r => r.currency_code === code)

            return (
              <div
                key={code}
                className="p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    {code}
                  </Badge>
                  {change !== null && (
                    <span
                      className={`flex items-center text-xs font-semibold ${
                        isPositive ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {isPositive ? (
                        <TrendingUp className="w-3 h-3 mr-1" />
                      ) : (
                        <TrendingDown className="w-3 h-3 mr-1" />
                      )}
                      {Math.abs(change).toFixed(2)}%
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {rate?.rate.toFixed(4) || '-'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {rate?.currency_name}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Comparison Bar Chart */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Current Rates Comparison</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rates.filter(r => selectedCurrencies.includes(r.currency_code))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="currency_code" stroke="#6b7280" style={{ fontSize: '12px' }} />
            <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px'
              }}
            />
            <Bar dataKey="rate" fill="#3b82f6" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}

