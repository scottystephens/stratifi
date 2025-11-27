'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  TrendingUp,
  TrendingDown,
  Plus,
  X,
  Calendar,
  ArrowRightLeft,
  GripHorizontal,
  Check,
  Activity,
  ArrowRight,
  Search,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts'
import { cn } from '@/lib/utils'
import type { HistoricalRatesResponse, LatestRate } from '@/lib/services/exchange-rate-service'
import type { RatesPreferences } from '@/lib/services/user-preference-service'

// --- Types ------------------------------------------------------------------
type RateType = 'spot' | 'eom' | 'avg'
type TimeRange = '7D' | '30D' | '90D' | 'custom'
type CurrencyPair = { from: string; to: string }


// --- Constants --------------------------------------------------------------
const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', flag: '🇬🇧' },
  { code: 'JPY', name: 'Japanese Yen', flag: '🇯🇵' },
  { code: 'CHF', name: 'Swiss Franc', flag: '🇨🇭' },
  { code: 'CAD', name: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'AUD', name: 'Australian Dollar', flag: '🇦🇺' },
  { code: 'NZD', name: 'New Zealand Dollar', flag: '🇳🇿' },
  { code: 'SGD', name: 'Singapore Dollar', flag: '🇸🇬' },
  { code: 'HKD', name: 'Hong Kong Dollar', flag: '🇭🇰' },
  { code: 'CNY', name: 'Chinese Yuan', flag: '🇨🇳' },
  { code: 'SEK', name: 'Swedish Krona', flag: '🇸🇪' },
  { code: 'NOK', name: 'Norwegian Krone', flag: '🇳🇴' },
  { code: 'DKK', name: 'Danish Krone', flag: '🇩🇰' },
  { code: 'ZAR', name: 'South African Rand', flag: '🇿🇦' },
  { code: 'BRL', name: 'Brazilian Real', flag: '🇧🇷' },
  { code: 'MXN', name: 'Mexican Peso', flag: '🇲🇽' },
  { code: 'INR', name: 'Indian Rupee', flag: '🇮🇳' },
  { code: 'KRW', name: 'South Korean Won', flag: '🇰🇷' },
  { code: 'RUB', name: 'Russian Ruble', flag: '🇷🇺' },
  { code: 'TRY', name: 'Turkish Lira', flag: '🇹🇷' },
  { code: 'THB', name: 'Thai Baht', flag: '🇹🇭' },
  { code: 'MYR', name: 'Malaysian Ringgit', flag: '🇲🇾' },
  { code: 'IDR', name: 'Indonesian Rupiah', flag: '🇮🇩' },
  { code: 'PHP', name: 'Philippine Peso', flag: '🇵🇭' },
  { code: 'PLN', name: 'Polish Złoty', flag: '🇵🇱' },
  { code: 'CZK', name: 'Czech Koruna', flag: '🇨🇿' },
  { code: 'HUF', name: 'Hungarian Forint', flag: '🇭🇺' },
  { code: 'ILS', name: 'Israeli Shekel', flag: '🇮🇱' },
  { code: 'EGP', name: 'Egyptian Pound', flag: '🇪🇬' },
]

const RATE_TYPE_MAP: Record<RateType, 'SPOT' | 'EOM' | 'AVG'> = {
  spot: 'SPOT',
  eom: 'EOM',
  avg: 'AVG'
}

const RANGE_DAYS: Record<TimeRange, number> = {
  '7D': 7,
  '30D': 30,
  '90D': 90,
  custom: 60
}

const DEFAULT_PREFERENCES: RatesPreferences = {
  watchlist: [
    { from: 'EUR', to: 'USD' },
    { from: 'GBP', to: 'USD' },
    { from: 'USD', to: 'JPY' }
  ],
  baseCurrency: 'USD',
  timeRange: '30D'
}

const formatInputDate = (date: Date) => date.toISOString().split('T')[0]

const getFlagForCurrency = (code: string) => {
  return CURRENCIES.find(curr => curr.code === code)?.flag ?? '🏳️'
}

// --- Data Helpers -----------------------------------------------------------
const generateHistory = (from: string, to: string, days: number, type: RateType) => {
  const data: { date: string; rate: number; change: number }[] = []
  let baseRate = 1.0

  if (from === 'EUR' && to === 'USD') baseRate = 1.08
  if (from === 'GBP' && to === 'USD') baseRate = 1.27
  if (from === 'USD' && to === 'JPY') baseRate = 149.5
  if (from === 'AUD' && to === 'USD') baseRate = 0.65
  if (from === 'USD' && to === 'CAD') baseRate = 1.36
  if (from === 'USD' && to === 'CHF') baseRate = 0.88

  const seedBase = from.charCodeAt(0) * 100 + to.charCodeAt(0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let currentRate = baseRate

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)

    const noise = (Math.sin(seedBase + i * 0.5) + 1) / 2
    const trend = Math.sin(i / 8) * 0.01
    const volatility = 0.01

    currentRate = currentRate * (1 + (noise - 0.5) * volatility + trend)

    let displayRate = currentRate
    if (type === 'avg') displayRate = currentRate * 0.99
    if (type === 'eom') displayRate = currentRate

    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      rate: displayRate,
      change: (noise - 0.5) * 2
    })
  }

  return data
}

const calculateVolatility = (history: { rate: number }[]) => {
  if (history.length < 2) return 0
  const rates = history.map(point => point.rate)
  const mean = rates.reduce((acc, value) => acc + value, 0) / rates.length
  const variance = rates.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / rates.length
  const stdDev = Math.sqrt(variance)
  if (mean === 0) return 0
  return (stdDev / mean) * 100 * Math.sqrt(252)
}

// --- API Helpers ------------------------------------------------------------
const encodePairs = (pairs: CurrencyPair[]) =>
  pairs.map(pair => `${pair.from}-${pair.to}`).join(',')

const fetchPreferences = async (): Promise<RatesPreferences> => {
  const response = await fetch('/api/user/preferences')
  if (response.status === 401) {
    return DEFAULT_PREFERENCES
  }
  if (!response.ok) {
    throw new Error('Unable to load rate preferences')
  }
  const payload = await response.json()
  return payload.data ?? DEFAULT_PREFERENCES
}

const persistPreferences = async (updates: Partial<RatesPreferences>) => {
  const response = await fetch('/api/user/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...updates })
  })

  if (!response.ok) {
    throw new Error('Unable to save preferences')
  }

  const payload = await response.json()
  return payload.data as RatesPreferences
}

const fetchHistoryData = async (
  pairs: CurrencyPair[],
  range: TimeRange | 'custom',
  days?: number,
  type: 'SPOT' | 'EOM' | 'AVG' = 'SPOT'
): Promise<HistoricalRatesResponse> => {
  if (pairs.length === 0) return {}
  const params = new URLSearchParams()
  params.set('pairs', encodePairs(pairs))
  params.set('range', range)
  params.set('type', type)
  if (days) {
    params.set('days', String(days))
  }

  const response = await fetch(`/api/rates/history?${params.toString()}`)
  if (!response.ok) {
    throw new Error('Unable to load exchange rate history')
  }
  const data = await response.json()
  return data.data ?? {}
}

const fetchLatestRates = async (baseCurrency: string, limit = 200): Promise<LatestRate[]> => {
  const response = await fetch(`/api/rates/latest?base=${baseCurrency}&limit=${limit}`)
  if (!response.ok) {
    throw new Error('Unable to load latest rates')
  }
  const data = await response.json()
  return data.data ?? []
}

// --- Component --------------------------------------------------------------
export default function RatesPage() {
  const [watchlist, setWatchlist] = useState<CurrencyPair[]>(DEFAULT_PREFERENCES.watchlist)
  const [rateType, setRateType] = useState<RateType>('spot')
  const [timeRange, setTimeRange] = useState<TimeRange>('30D')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [pairCurrencies, setPairCurrencies] = useState<string[]>([])
  const [selectedPairs, setSelectedPairs] = useState<{from: string, to: string}[]>([])
  const [currencySearchTerm, setCurrencySearchTerm] = useState('')
  const [displayData, setDisplayData] = useState<Record<string, any[]>>({})
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(['USD', 'EUR', 'GBP', 'JPY'])
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const dragOverItemIndex = useRef<number | null>(null)
  const [hasSyncedPreferences, setHasSyncedPreferences] = useState(false)

  const queryClient = useQueryClient()

  const preferencesQuery = useQuery({
    queryKey: ['ratesPreferences'],
    queryFn: fetchPreferences,
    initialData: DEFAULT_PREFERENCES,
    retry: false,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false
  })

  const preferencesMutation = useMutation<RatesPreferences, Error, Partial<RatesPreferences>, unknown>({
    mutationFn: persistPreferences,
    onSuccess: (data) => {
      queryClient.setQueryData(['ratesPreferences'], data)
    },
    onError: (error) => {
      console.error('[Preferences] save failed', error)
    }
  })

  const customDays = useMemo(() => {
    if (timeRange !== 'custom' || !customDateFrom || !customDateTo) return undefined
    const from = new Date(customDateFrom)
    const to = new Date(customDateTo)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return undefined
    }
    const diff = Math.max(1, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    return diff
  }, [timeRange, customDateFrom, customDateTo])

  const daysForDisplay = customDays ?? RANGE_DAYS[timeRange] ?? 30

  const pairsKey = useMemo(() => encodePairs(watchlist), [watchlist])

  const historyQuery = useQuery({
    queryKey: ['ratesHistory', pairsKey, timeRange, rateType, customDays],
    queryFn: () =>
      fetchHistoryData(
        watchlist,
        timeRange === 'custom' ? 'custom' : timeRange,
        customDays,
        RATE_TYPE_MAP[rateType]
      ),
    enabled: watchlist.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: true
  })

  useEffect(() => {
    if (preferencesQuery.data && !hasSyncedPreferences) {
      setWatchlist(preferencesQuery.data.watchlist)
      setTimeRange(preferencesQuery.data.timeRange)
      setHasSyncedPreferences(true)
    }
  }, [preferencesQuery.data, hasSyncedPreferences])

  // Update display data when history data changes
  useEffect(() => {
    if (historyQuery.data) {
      setDisplayData(prev => ({
        ...prev,
        ...historyQuery.data
      }))
    }
  }, [historyQuery.data])

  useEffect(() => {
    if (timeRange === 'custom' && !customDateFrom && !customDateTo) {
      const today = new Date()
      const past = new Date()
      past.setDate(today.getDate() - 29)
      setCustomDateFrom(formatInputDate(past))
      setCustomDateTo(formatInputDate(today))
    }
  }, [timeRange, customDateFrom, customDateTo])

  const persistPreference = (updates: Partial<RatesPreferences>) => {
    setWatchlist(prev => updates.watchlist ?? prev)
    if (updates.timeRange) setTimeRange(updates.timeRange)
    preferencesMutation.mutate(updates)
  }

  const toggleCurrency = (code: string) => {
    setSelectedCurrencies(prev =>
      prev.includes(code) ? prev.filter(item => item !== code) : [...prev, code]
    )
  }

  const handleRangeChange = (range: TimeRange) => {
    setTimeRange(range)
    if (range !== 'custom') {
      setCustomDateFrom('')
      setCustomDateTo('')
    }
    persistPreference({ timeRange: range })
  }

  const handleRateTypeChange = (type: RateType) => {
    setRateType(type)
    
    // Auto-adjust time range for better UX with monthly data
    if (type === 'eom' || type === 'avg') {
      // For monthly data, default to 90D if currently on 7D or 30D
      if (timeRange === '7D' || timeRange === '30D') {
        setTimeRange('90D')
        persistPreference({ timeRange: '90D' })
      }
    }
  }

  const addSelectedPairs = () => {
    const newPairs = selectedPairs.filter(pair =>
      !watchlist.some(existing => existing.from === pair.from && existing.to === pair.to)
    )

    if (newPairs.length === 0) return
    const next = [...watchlist, ...newPairs]
    setWatchlist(next)
    persistPreference({ watchlist: next })
    setShowAddModal(false)
    setSelectedPairs([])
    setPairCurrencies([])
  }

  const handleRemovePair = (index: number) => {
    const next = watchlist.filter((_, i) => i !== index)
    setWatchlist(next)
    persistPreference({ watchlist: next })
  }

  const swapPair = (index: number) => {
    const next = [...watchlist]
    const [from, to] = [next[index].to, next[index].from]
    next[index] = { from, to }
    setWatchlist(next)
    persistPreference({ watchlist: next })
  }

  const onDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    dragOverItemIndex.current = index
  }

  const onDragEnd = () => {
    const dragIndex = draggedIndex
    const dropIndex = dragOverItemIndex.current
    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
      const next = [...watchlist]
      const item = next.splice(dragIndex, 1)[0]
      next.splice(dropIndex, 0, item)
      setWatchlist(next)
      persistPreference({ watchlist: next })
    }
    setDraggedIndex(null)
    dragOverItemIndex.current = null
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }


  const historyData = historyQuery.data ?? {}
  const showLoadingState = historyQuery.isFetching && !historyQuery.isError

  if (!hasSyncedPreferences && preferencesQuery.isLoading) {
    return <div className="p-8">Loading preferences...</div>
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-stone-900">Exchange Rates</h1>
            <p className="text-stone-500 mt-1">Global currency trends and historical data intelligence</p>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-lg border border-stone-200 bg-stone-50 p-1">
              {(['spot', 'eom', 'avg'] as RateType[]).map(type => (
                <button
                  key={type}
                  onClick={() => handleRateTypeChange(type)}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize',
                    rateType === type ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-900'
                  )}
                >
                  {type === 'eom' ? 'End of Month' : type === 'avg' ? 'Monthly Avg' : 'Spot Rate'}
                </button>
              ))}
            </div>
            <div className="h-6 w-px bg-stone-200 mx-1 hidden sm:block" />
            <div className="flex items-center rounded-lg border border-stone-200 bg-stone-50 p-1">
              {(['7D', '30D', '90D'] as TimeRange[]).map(range => (
                <button
                  key={range}
                  onClick={() => handleRangeChange(range)}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                    timeRange === range ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-900'
                  )}
                >
                  {range}
                </button>
              ))}
              <button
                onClick={() => handleRangeChange('custom')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2',
                  timeRange === 'custom' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-900'
                )}
              >
                <Calendar className="h-3.5 w-3.5" />
                Custom
              </button>
            </div>
            {timeRange === 'custom' && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                <input
                  type="date"
                  className="h-9 rounded-md border border-stone-200 px-3 text-sm"
                  value={customDateFrom}
                  onChange={e => setCustomDateFrom(e.target.value)}
                />
                <span className="text-stone-400">-</span>
                <input
                  type="date"
                  className="h-9 rounded-md border border-stone-200 px-3 text-sm"
                  value={customDateTo}
                  onChange={e => setCustomDateTo(e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium text-stone-900">Organization Currencies</div>
              <div className="text-xs text-stone-500">Select currencies your team tracks</div>
            </div>
            <div className="flex -space-x-2">
              {selectedCurrencies.slice(0, 4).map(code => (
                <div key={code} className="w-8 h-8 rounded-full bg-stone-100 border-2 border-white flex items-center justify-center text-xs" title={code}>
                  {getFlagForCurrency(code)}
                </div>
              ))}
              {selectedCurrencies.length > 4 && (
                <div className="w-8 h-8 rounded-full bg-stone-100 border-2 border-white flex items-center justify-center text-xs font-medium text-stone-600">
                  +{selectedCurrencies.length - 4}
                </div>
              )}
            </div>
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Manage
            </Button>
          </div>
        </div>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {watchlist.map((pair, idx) => {
          const key = `${pair.from}-${pair.to}`
          const displayChartData = displayData[key] ?? []
          const hasDisplayData = displayChartData.length > 0
          const chartData = hasDisplayData ? displayChartData : []
          const latestPoint = chartData[chartData.length - 1]
          const firstPoint = chartData[0]
          const change = firstPoint ? ((latestPoint.rate - firstPoint.rate) / firstPoint.rate) * 100 : 0
          const isPositive = change >= 0
          const minRate = chartData.length ? Math.min(...chartData.map(point => point.rate)) : latestPoint?.rate ?? 0
          const maxRate = chartData.length ? Math.max(...chartData.map(point => point.rate)) : latestPoint?.rate ?? 0
          const volatility = calculateVolatility(chartData)

          return (
            <div
              key={`${key}-${idx}`}
              draggable
              onDragStart={e => onDragStart(e, idx)}
              onDragEnter={e => onDragEnter(e, idx)}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              className={cn(
                'bg-white rounded-xl border border-stone-200 shadow-sm transition-all duration-200 group relative',
                draggedIndex === idx ? 'opacity-40' : 'hover:shadow-md hover:border-stone-300'
              )}
            >
              <div className="p-5">
                <div className="absolute top-2 right-2 p-2 cursor-grab text-stone-300 hover:text-stone-500 transition-colors">
                  <GripHorizontal className="h-5 w-5" />
                </div>
                <div className="absolute top-2 right-12 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => swapPair(idx)}
                    className="p-2 rounded-md text-stone-400 hover:text-primary hover:bg-stone-50"
                    title="Swap currencies"
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleRemovePair(idx)}
                    className="p-2 rounded-md text-stone-400 hover:text-red-500 hover:bg-red-50"
                    title="Remove pair"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-start justify-between mb-2 pr-16">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      <span className="text-3xl">{getFlagForCurrency(pair.from)}</span>
                      <span className="text-3xl translate-x-1">{getFlagForCurrency(pair.to)}</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-stone-900">
                        {pair.from}/{pair.to}
                      </h3>
                      <p className="text-xs text-stone-500">{pair.from} to {pair.to}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-baseline gap-3 mb-4 mt-2">
                  <div className="text-3xl font-bold font-mono text-stone-900">
                    {latestPoint ? latestPoint.rate.toFixed(4) : '—'}
                  </div>
                  <div className={cn(
                    'flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded-full',
                    isPositive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  )}>
                    {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    <span>{Math.abs(change).toFixed(2)}%</span>
                  </div>
                </div>
                <div className="h-[140px] w-full -ml-2 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={hasDisplayData ? chartData : []}>
                      {hasDisplayData && (
                        <defs>
                          <linearGradient id={`grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isPositive ? '#16a34a' : '#dc2626'} stopOpacity={0.1} />
                            <stop offset="95%" stopColor={isPositive ? '#16a34a' : '#dc2626'} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                      )}
                      <XAxis
                        dataKey="date"
                        axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                        tickLine={{ stroke: '#e5e7eb' }}
                        tick={{ fontSize: 9, fill: '#9ca3af' }}
                        interval="preserveStartEnd"
                        minTickGap={40}
                        tickFormatter={(value) => {
                          if (!hasDisplayData) return ''
                          const date = new Date(value)
                          return date.toLocaleDateString('en-US', {
                            day: 'numeric',
                            month: 'short'
                          })
                        }}
                      />
                      <YAxis
                        axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                        tickLine={{ stroke: '#e5e7eb' }}
                        tick={{ fontSize: 9, fill: '#9ca3af' }}
                        domain={hasDisplayData ? [minRate - (maxRate - minRate) * 0.1, maxRate + (maxRate - minRate) * 0.1] : [0, 1]}
                        tickFormatter={(value) => hasDisplayData ? value.toFixed(3) : ''}
                      />
                      <CartesianGrid strokeDasharray="2 2" stroke="#f3f4f6" />
                      {hasDisplayData && (
                        <Tooltip
                          contentStyle={{
                            borderRadius: '8px',
                            border: 'none',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                            fontSize: '12px'
                          }}
                          itemStyle={{ color: '#444' }}
                          labelStyle={{ color: '#888', marginBottom: '0.25rem' }}
                          formatter={(value: number) => [value.toFixed(4), 'Rate']}
                          labelFormatter={(label) => {
                            const date = new Date(label)
                            return date.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                            })
                          }}
                        />
                      )}
                      {hasDisplayData && (
                        <Area
                          type="monotone"
                          dataKey="rate"
                          stroke={isPositive ? '#16a34a' : '#dc2626'}
                          strokeWidth={2}
                          fill={`url(#grad-${idx})`}
                          isAnimationActive={true}
                          animationDuration={600}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-stone-100 text-xs text-stone-500">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Range</p>
                    <p className="text-xs font-medium text-stone-700 font-mono">
                      {minRate.toFixed(4)} - {maxRate.toFixed(4)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Volatility</p>
                    <div className="flex items-center justify-center gap-1 text-xs font-medium text-stone-700">
                      <Activity className="h-3 w-3 text-stone-400" />
                      {volatility.toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Avg Rate</p>
                    <p className="text-xs font-medium text-stone-700 font-mono">
                      {chartData.length ? (chartData.reduce((sum, point) => sum + point.rate, 0) / chartData.length).toFixed(4) : latestPoint?.rate.toFixed(4) ?? '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
              <div>
                <h2 className="text-xl font-bold text-stone-900">Manage Currency Pairs</h2>
                <p className="text-sm text-stone-500">Select currencies to add to your watchlist.</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-stone-400 hover:text-stone-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-3">Select Currencies</label>
                <p className="text-xs text-stone-500 mb-4">Choose currencies to create pairs from. We&apos;ll show all possible combinations.</p>

                {/* Search Input */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Search currencies..."
                    value={currencySearchTerm}
                    onChange={(e) => setCurrencySearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-32 overflow-y-auto">
                  {CURRENCIES
                    .filter(curr =>
                      curr.code.toLowerCase().includes(currencySearchTerm.toLowerCase()) ||
                      curr.name?.toLowerCase().includes(currencySearchTerm.toLowerCase())
                    )
                    .map(curr => {
                    const isSelected = pairCurrencies.includes(curr.code)
                    return (
                      <button
                        key={curr.code}
                        onClick={() => {
                          setPairCurrencies(prev =>
                            prev.includes(curr.code)
                              ? prev.filter(code => code !== curr.code)
                              : [...prev, curr.code]
                          )
                          // Clear selected pairs when currencies change
                          setSelectedPairs([])
                        }}
                        className={cn(
                          'flex items-center gap-2 p-2 rounded-lg border text-left transition-all',
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                        )}
                      >
                        <div className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                          isSelected ? 'bg-primary border-primary' : 'border-stone-300 bg-white'
                        )}>
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <span className="text-sm">{curr.flag}</span>
                        <span className="text-xs font-medium">{curr.code}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {pairCurrencies.length >= 2 && (
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-3">Available Pairs</label>
                  <p className="text-xs text-stone-500 mb-4">Select the pairs you want to add to your watchlist.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto border border-stone-200 rounded-lg p-3">
                    {pairCurrencies.flatMap(from =>
                      pairCurrencies
                        .filter(to => to !== from)
                        .map(to => {
                          const pair = { from, to }
                          const isSelected = selectedPairs.some(p => p.from === from && p.to === to)
                          const alreadyExists = watchlist.some(p => p.from === from && p.to === to)

                          return (
                            <button
                              key={`${from}-${to}`}
                              onClick={() => {
                                if (alreadyExists) return
                                setSelectedPairs(prev =>
                                  prev.some(p => p.from === from && p.to === to)
                                    ? prev.filter(p => !(p.from === from && p.to === to))
                                    : [...prev, pair]
                                )
                              }}
                              disabled={alreadyExists}
                              className={cn(
                                'flex items-center justify-between p-3 rounded-lg border text-left transition-all',
                                alreadyExists
                                  ? 'border-stone-100 bg-stone-50 text-stone-400 cursor-not-allowed'
                                  : isSelected
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{getFlagForCurrency(from)}</span>
                                <span className="text-sm font-medium">{from}</span>
                                <ArrowRight className="h-3 w-3 text-stone-400" />
                                <span className="text-sm">{getFlagForCurrency(to)}</span>
                                <span className="text-sm font-medium">{to}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {alreadyExists && (
                                  <span className="text-xs text-stone-400">Already added</span>
                                )}
                                <div className={cn(
                                  'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                                  alreadyExists
                                    ? 'bg-stone-200 border-stone-200'
                                    : isSelected
                                      ? 'bg-primary border-primary'
                                      : 'border-stone-300 bg-white'
                                )}>
                                  {isSelected && !alreadyExists && <Check className="h-3 w-3 text-white" />}
                                  {alreadyExists && <Check className="h-3 w-3 text-stone-400" />}
                                </div>
                              </div>
                            </button>
                          )
                        })
                    )}
                  </div>
                </div>
              )}

              {/* Current Watchlist - Compact Remove Section */}
              {watchlist.length > 0 && (
                <div className="border-t border-stone-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-stone-600 uppercase tracking-wide">Current Pairs</label>
                    <span className="text-xs text-stone-400">{watchlist.length} pairs</span>
                  </div>
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {watchlist.map((pair, index) => (
                      <button
                        key={`${pair.from}-${pair.to}`}
                        onClick={() => handleRemovePair(index)}
                        className="flex items-center gap-1 px-2 py-1 bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-red-600 rounded-md text-xs transition-colors flex-shrink-0 group"
                        title={`Remove ${pair.from}/${pair.to}`}
                      >
                        <span className="text-xs">{getFlagForCurrency(pair.from)}</span>
                        <span className="font-medium">{pair.from}</span>
                        <span className="text-stone-400">/</span>
                        <span className="text-xs">{getFlagForCurrency(pair.to)}</span>
                        <span className="font-medium">{pair.to}</span>
                        <Trash2 className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-stone-100 bg-stone-50 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={addSelectedPairs}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={selectedPairs.length === 0}
              >
                Add {selectedPairs.length > 0 ? `${selectedPairs.length} Pairs` : 'Pairs'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
