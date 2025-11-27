'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowRight, RefreshCw, TrendingUp, Calendar, ArrowLeftRight } from 'lucide-react'
import { format } from 'date-fns'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'NZD', 'SGD']

export default function FXDashboard() {
  const [baseCurrency, setBaseCurrency] = useState('USD')
  const [amount, setAmount] = useState('1000')
  const [rates, setRates] = useState<any[]>([
    { currency: 'EUR', rate: 0.92, change: 0.15 },
    { currency: 'GBP', rate: 0.79, change: -0.05 },
    { currency: 'JPY', rate: 149.50, change: 0.8 },
    { currency: 'AUD', rate: 1.53, change: 0.2 },
    { currency: 'CAD', rate: 1.36, change: -0.1 },
    { currency: 'CHF', rate: 0.88, change: 0.05 },
  ])

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Base Currency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold flex items-center gap-2">
                <span className="text-3xl">🇺🇸</span> {baseCurrency}
              </div>
              <Select value={baseCurrency} onValueChange={setBaseCurrency}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Last Updated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{format(new Date(), 'HH:mm')} UTC</div>
              <Button variant="outline" size="sm" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">170+ Currencies</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Conversion & Rates */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Converter Widget */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Quick Convert</CardTitle>
            <CardDescription>Real-time market rates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount</label>
              <div className="relative">
                <input 
                  type="number" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full p-3 border rounded-lg bg-gray-50 text-lg font-mono" 
                />
                <span className="absolute right-3 top-3 text-gray-400">{baseCurrency}</span>
              </div>
            </div>

            <div className="flex justify-center">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeftRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Converted To</label>
              <Select defaultValue="EUR">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.filter(c => c !== baseCurrency).map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <div className="text-sm text-blue-600 mb-1">Estimated Output</div>
              <div className="text-2xl font-bold text-blue-900">
                € {(Number(amount) * 0.92).toLocaleString()}
              </div>
              <div className="text-xs text-blue-500 mt-1">1 {baseCurrency} = 0.92 EUR</div>
            </div>
          </CardContent>
        </Card>

        {/* Live Rates Grid */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Live Exchange Rates</CardTitle>
              <CardDescription>Against {baseCurrency}</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs">Spot</Button>
              <Button variant="ghost" size="sm" className="text-xs">End of Month</Button>
              <Button variant="ghost" size="sm" className="text-xs">Monthly Avg</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {rates.map((item) => (
                <div key={item.currency} className="p-4 rounded-lg border bg-card hover:bg-gray-50 transition-colors cursor-pointer group">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-lg">{item.currency}</div>
                    </div>
                    <div className={`text-xs px-2 py-1 rounded-full ${item.change >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {item.change > 0 ? '+' : ''}{item.change}%
                    </div>
                  </div>
                  <div className="text-2xl font-mono font-medium tracking-tight">
                    {item.rate.toFixed(4)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 group-hover:text-gray-600">
                    Inverse: {(1 / item.rate).toFixed(4)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Historical Chart Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Rate History</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center bg-gray-50 border-dashed border-2 rounded-lg mx-6 mb-6">
          <div className="text-center text-gray-400">
            <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-20" />
            <p>Historical Rate Chart Visualization</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

