'use client';

import { useEffect, useState, useMemo } from 'react';
import { useTenant } from '@/lib/tenant-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Clock,
  AlertCircle,
  DollarSign,
  Building2,
  Activity,
  Filter,
  X,
  Plus,
  Calendar,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { useEntities } from '@/lib/hooks/use-entities';

interface DashboardData {
  totalCashUSD: number;
  inflows: number;
  outflows: number;
  netCashFlow: number;
  accountCount: number;
  entityCount: number;
  transactionCount: number;
  recentTransactions: Array<{
    transaction_id: string;
    date: string;
    description: string;
    amount: number;
    currency: string;
    type: string;
    category: string;
    status: string;
  }>;
  accountsByCurrency: Record<string, any[]>;
  entityStats: Array<{
    entity_id: string;
    entity_name: string;
    account_count: number;
    total_balance: number;
  }>;
}

interface FilterConfig {
  id: string;
  field: string;
  operator: string;
  value: string | string[];
  label: string;
}

function formatCurrency(amount: number, currency: string = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    Completed: 'bg-green-100 text-green-800',
    Pending: 'bg-yellow-100 text-yellow-800',
    Failed: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

export default function DashboardPage() {
  const { currentTenant } = useTenant();
  const [data, setData] = useState<DashboardData | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  
  // Default filters
  const [dateRange, setDateRange] = useState<string>('7d');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([]);
  const [transactionType, setTransactionType] = useState<string>('all');
  
  // Dynamic custom filters
  const [customFilters, setCustomFilters] = useState<FilterConfig[]>([]);
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [newFilterField, setNewFilterField] = useState('');
  const [newFilterOperator, setNewFilterOperator] = useState('equals');
  const [newFilterValue, setNewFilterValue] = useState('');

  // Fetch accounts and entities for filter options
  const { data: accounts = [] } = useAccounts(currentTenant?.id);
  const { data: entities = [] } = useEntities(currentTenant?.id);

  // Helper functions
  const getDateRangeLabel = (value: string) => {
    const labels: Record<string, string> = {
      '7d': 'Last 7 days',
      '30d': 'Last 30 days',
      '90d': 'Last 90 days',
      '1y': 'Last year',
      'all': 'All time',
    };
    return labels[value] || value;
  };

  const getTransactionTypeLabel = (value: string) => {
    const labels: Record<string, string> = {
      'all': 'All',
      'credit': 'Credits Only',
      'debit': 'Debits Only',
    };
    return labels[value] || value;
  };

  // Available filter fields for dynamic filters
  const availableFilterFields = [
    { value: 'category', label: 'Transaction Category' },
    { value: 'account_type', label: 'Account Type' },
    { value: 'account_status', label: 'Account Status' },
    { value: 'min_amount', label: 'Min Amount' },
    { value: 'max_amount', label: 'Max Amount' },
    { value: 'description', label: 'Description Contains' },
    { value: 'status', label: 'Transaction Status' },
  ];

  const filterOperators = [
    { value: 'equals', label: 'Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'greater_than', label: 'Greater Than' },
    { value: 'less_than', label: 'Less Than' },
    { value: 'in', label: 'In' },
  ];

  useEffect(() => {
    if (!currentTenant) return;

    async function fetchDashboardData() {
      try {
        // Use filterLoading for subsequent loads, initialLoading for first load
        if (data === null) {
          setInitialLoading(true);
        } else {
          setFilterLoading(true);
        }
        
        // Build filter query params
        const params = new URLSearchParams({
          tenantId: currentTenant!.id,
          dateRange,
          transactionType,
        });

        if (selectedAccounts.length > 0) {
          params.append('accountIds', selectedAccounts.join(','));
        }
        if (selectedEntities.length > 0) {
          params.append('entityIds', selectedEntities.join(','));
        }
        if (selectedCurrencies.length > 0) {
          params.append('currencies', selectedCurrencies.join(','));
        }

        // Add custom filters
        customFilters.forEach((filter, index) => {
          params.append(`customFilter[${index}][field]`, filter.field);
          params.append(`customFilter[${index}][operator]`, filter.operator);
          if (Array.isArray(filter.value)) {
            params.append(`customFilter[${index}][value]`, filter.value.join(','));
          } else {
            params.append(`customFilter[${index}][value]`, filter.value);
          }
        });

        const response = await fetch(`/api/dashboard?${params.toString()}`);
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch dashboard data');
        }

        setData(result.data);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setInitialLoading(false);
        setFilterLoading(false);
      }
    }

    fetchDashboardData();
  }, [currentTenant, dateRange, selectedAccounts, selectedEntities, selectedCurrencies, transactionType, customFilters]);

  function addCustomFilter() {
    if (!newFilterField || !newFilterValue) return;

    const filter: FilterConfig = {
      id: Date.now().toString(),
      field: newFilterField,
      operator: newFilterOperator,
      value: newFilterValue,
      label: `${availableFilterFields.find(f => f.value === newFilterField)?.label || newFilterField} ${filterOperators.find(o => o.value === newFilterOperator)?.label || newFilterOperator} ${newFilterValue}`,
    };

    setCustomFilters([...customFilters, filter]);
    setNewFilterField('');
    setNewFilterOperator('equals');
    setNewFilterValue('');
    setShowAddFilter(false);
  }

  function removeCustomFilter(filterId: string) {
    setCustomFilters(customFilters.filter(f => f.id !== filterId));
  }

  function toggleAccount(accountId: string) {
    if (selectedAccounts.includes(accountId)) {
      setSelectedAccounts(selectedAccounts.filter(id => id !== accountId));
    } else {
      setSelectedAccounts([...selectedAccounts, accountId]);
    }
  }

  function toggleEntity(entityId: string) {
    if (selectedEntities.includes(entityId)) {
      setSelectedEntities(selectedEntities.filter(id => id !== entityId));
    } else {
      setSelectedEntities([...selectedEntities, entityId]);
    }
  }

  function toggleCurrency(currency: string) {
    if (selectedCurrencies.includes(currency)) {
      setSelectedCurrencies(selectedCurrencies.filter(c => c !== currency));
    } else {
      setSelectedCurrencies([...selectedCurrencies, currency]);
    }
  }

  function clearAllFilters() {
    setDateRange('7d');
    setSelectedAccounts([]);
    setSelectedEntities([]);
    setSelectedCurrencies([]);
    setTransactionType('all');
    setCustomFilters([]);
  }

  const hasActiveFilters = selectedAccounts.length > 0 || 
    selectedEntities.length > 0 || 
    selectedCurrencies.length > 0 || 
    transactionType !== 'all' ||
    dateRange !== '7d' ||
    customFilters.length > 0;

  // Get unique currencies from accounts
  const availableCurrencies = useMemo(() => {
    return Array.from(new Set(accounts.map(acc => acc.currency || 'USD').filter(Boolean)));
  }, [accounts]);

  if (!currentTenant) {
    return (
      <div className="min-h-screen bg-stone-50">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-12 text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-display font-bold text-stone-900 mb-4">No Organization Selected</h2>
            <p className="text-stone-500">
              Please select an organization from the sidebar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-stone-50">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-stone-50">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-12 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-display font-bold text-stone-900 mb-2">Error Loading Dashboard</h2>
            <p className="text-stone-500">{error || 'Failed to load dashboard data'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Dashboard</h1>
          <p className="text-stone-500">
            Real-time treasury insights and cash visibility
          </p>
        </div>
        <Button
          variant={showFilters ? 'default' : 'outline'}
          onClick={() => setShowFilters(!showFilters)}
          size="sm"
        >
          <Filter className="h-4 w-4 mr-2" />
          Filters
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-2">
              {[selectedAccounts.length, selectedEntities.length, selectedCurrencies.length, customFilters.length].reduce((a, b) => a + b, 0) + (transactionType !== 'all' ? 1 : 0) + (dateRange !== '7d' ? 1 : 0)}
            </Badge>
          )}
        </Button>
      </div>

      {/* Active Filter Chips - Industry Standard Pattern */}
      {hasActiveFilters && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          
          {dateRange !== '7d' && (
            <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1">
              <Calendar className="h-3 w-3" />
              {getDateRangeLabel(dateRange)}
              <button
                onClick={() => setDateRange('7d')}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {transactionType !== 'all' && (
            <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1">
              <Activity className="h-3 w-3" />
              {getTransactionTypeLabel(transactionType)}
              <button
                onClick={() => setTransactionType('all')}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {selectedAccounts.length > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1">
              <Wallet className="h-3 w-3" />
              {selectedAccounts.length} account{selectedAccounts.length > 1 ? 's' : ''}
              <button
                onClick={() => setSelectedAccounts([])}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {selectedEntities.length > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1">
              <Building2 className="h-3 w-3" />
              {selectedEntities.length} entit{selectedEntities.length > 1 ? 'ies' : 'y'}
              <button
                onClick={() => setSelectedEntities([])}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {selectedCurrencies.length > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1">
              <DollarSign className="h-3 w-3" />
              {selectedCurrencies.join(', ')}
              <button
                onClick={() => setSelectedCurrencies([])}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {customFilters.map((filter) => (
            <Badge key={filter.id} variant="secondary" className="flex items-center gap-1.5 px-3 py-1">
              {filter.label}
              <button
                onClick={() => removeCustomFilter(filter.id)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}

          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Filters Panel - Modern Design */}
      {showFilters && (
        <Card className="mb-6 border-2">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Filters</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowFilters(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Quick Date Range Buttons - Industry Standard */}
            <div>
              <label className="text-sm font-semibold mb-3 block">Date Range</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: '7d', label: 'Last 7 days' },
                  { value: '30d', label: 'Last 30 days' },
                  { value: '90d', label: 'Last 90 days' },
                  { value: '1y', label: 'Last year' },
                  { value: 'all', label: 'All time' },
                ].map((option) => (
                  <Button
                    key={option.value}
                    variant={dateRange === option.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDateRange(option.value)}
                    className="text-xs"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Transaction Type - Button Group */}
            <div>
              <label className="text-sm font-semibold mb-3 block">Transaction Type</label>
              <div className="flex gap-2">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'credit', label: 'Credits Only' },
                  { value: 'debit', label: 'Debits Only' },
                ].map((option) => (
                  <Button
                    key={option.value}
                    variant={transactionType === option.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTransactionType(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Multi-Select Filters - Modern Dropdown Style */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Accounts */}
              <div>
                <label className="text-sm font-semibold mb-2 block">Accounts</label>
                <div className="border rounded-lg bg-white">
                  <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                    {accounts.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-2">No accounts</p>
                    ) : (
                      accounts.map((account) => {
                        const accountId = account.account_id || account.id!;
                        const isSelected = selectedAccounts.includes(accountId);
                        return (
                          <label
                            key={accountId}
                            className={`flex items-center space-x-2 p-2 rounded cursor-pointer hover:bg-accent transition-colors ${
                              isSelected ? 'bg-accent' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleAccount(accountId)}
                              className="rounded border-gray-300"
                            />
                            <span className="text-sm flex-1">{account.account_name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  {selectedAccounts.length > 0 && (
                    <div className="border-t p-2 bg-muted/50">
                      <p className="text-xs text-muted-foreground">
                        {selectedAccounts.length} of {accounts.length} selected
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Entities */}
              <div>
                <label className="text-sm font-semibold mb-2 block">Entities</label>
                <div className="border rounded-lg bg-white">
                  <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                    {entities.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-2">No entities</p>
                    ) : (
                      entities.map((entity) => {
                        const isSelected = selectedEntities.includes(entity.entity_id);
                        return (
                          <label
                            key={entity.entity_id}
                            className={`flex items-center space-x-2 p-2 rounded cursor-pointer hover:bg-accent transition-colors ${
                              isSelected ? 'bg-accent' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleEntity(entity.entity_id)}
                              className="rounded border-gray-300"
                            />
                            <span className="text-sm flex-1">{entity.entity_name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  {selectedEntities.length > 0 && (
                    <div className="border-t p-2 bg-muted/50">
                      <p className="text-xs text-muted-foreground">
                        {selectedEntities.length} of {entities.length} selected
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Currencies */}
              <div>
                <label className="text-sm font-semibold mb-2 block">Currencies</label>
                <div className="border rounded-lg bg-white">
                  <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                    {availableCurrencies.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-2">No currencies</p>
                    ) : (
                      availableCurrencies.map((currency) => {
                        const isSelected = selectedCurrencies.includes(currency);
                        return (
                          <label
                            key={currency}
                            className={`flex items-center space-x-2 p-2 rounded cursor-pointer hover:bg-accent transition-colors ${
                              isSelected ? 'bg-accent' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleCurrency(currency)}
                              className="rounded border-gray-300"
                            />
                            <span className="text-sm font-medium">{currency}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  {selectedCurrencies.length > 0 && (
                    <div className="border-t p-2 bg-muted/50">
                      <p className="text-xs text-muted-foreground">
                        {selectedCurrencies.length} of {availableCurrencies.length} selected
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Custom Filters */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Custom Filters</h3>
                {!showAddFilter && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddFilter(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Filter
                  </Button>
                )}
              </div>

              {/* Active Custom Filters */}
              {customFilters.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {customFilters.map((filter) => (
                    <Badge key={filter.id} variant="secondary" className="flex items-center gap-1.5 px-3 py-1">
                      {filter.label}
                      <button
                        onClick={() => removeCustomFilter(filter.id)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Add Custom Filter Form */}
              {showAddFilter && (
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Field</label>
                      <select
                        value={newFilterField}
                        onChange={(e) => setNewFilterField(e.target.value)}
                        className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select field...</option>
                        {availableFilterFields.map((field) => (
                          <option key={field.value} value={field.value}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">Operator</label>
                      <select
                        value={newFilterOperator}
                        onChange={(e) => setNewFilterOperator(e.target.value)}
                        className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {filterOperators.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">Value</label>
                      <input
                        type="text"
                        value={newFilterValue}
                        onChange={(e) => setNewFilterValue(e.target.value)}
                        placeholder="Enter value..."
                        className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={addCustomFilter}
                      disabled={!newFilterField || !newFilterValue}
                    >
                      Add
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAddFilter(false);
                        setNewFilterField('');
                        setNewFilterValue('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics */}
      <div className="relative">
        {filterLoading && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10 rounded-lg">
            <div className="flex flex-col items-center space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="text-sm text-stone-600">Updating data...</span>
            </div>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="text-xs font-bold text-stone-400 uppercase tracking-wider">Total Cash Position</div>
              <DollarSign className="h-4 w-4 text-stone-400" />
            </div>
            <div className="text-3xl font-display font-black text-stone-900 tracking-tight tabular-nums">
              {formatCurrency(data.totalCashUSD, 'USD')}
            </div>
            <p className="text-xs text-stone-500">
              Across {data.accountCount} account{data.accountCount !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="text-xs font-bold text-stone-400 uppercase tracking-wider">Net Cash Flow (7d)</div>
              {data.netCashFlow >= 0 ? (
                <TrendingUp className="h-4 w-4 text-primary" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
            </div>
            <div className={`text-3xl font-display font-black tracking-tight tabular-nums ${data.netCashFlow >= 0 ? 'text-primary' : 'text-red-600'}`}>
              {data.netCashFlow >= 0 ? '+' : ''}{formatCurrency(data.netCashFlow, 'USD')}
            </div>
            <p className="text-xs text-stone-500">
              In: {formatCurrency(data.inflows, 'USD')} | Out: {formatCurrency(data.outflows, 'USD')}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="text-xs font-bold text-stone-400 uppercase tracking-wider">Entities</div>
              <Building2 className="h-4 w-4 text-stone-400" />
            </div>
            <div className="text-3xl font-black text-stone-900 tracking-tight tabular-nums">{data.entityCount}</div>
            <p className="text-xs text-stone-500">
                <Link href="/entities" className="text-primary hover:text-primary/80 hover:underline">
                View all entities
              </Link>
            </p>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="text-xs font-bold text-stone-400 uppercase tracking-wider">Total Transactions</div>
              <Activity className="h-4 w-4 text-stone-400" />
            </div>
            <div className="text-3xl font-black text-stone-900 tracking-tight tabular-nums">{data.transactionCount}</div>
            <p className="text-xs text-stone-500">
              All time
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          {/* Recent Transactions */}
          <div className="col-span-4 bg-white rounded-xl border border-stone-200 shadow-sm">
            <div className="p-6 border-b border-stone-100">
              <div className="font-display font-bold text-xl text-stone-900 mb-1">Recent Transactions</div>
              <div className="text-sm text-stone-500">Latest activity across all accounts</div>
            </div>
            <div className="p-6">
              {data.recentTransactions.length === 0 ? (
                <div className="text-center py-8 text-stone-400">
                  <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No recent transactions</p>
                </div>
              ) : (
              <div className="space-y-4">
                {data.recentTransactions.map((transaction) => (
                  <div
                      key={transaction.transaction_id}
                    className="flex items-center justify-between border-b border-stone-100 pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-stone-900">{transaction.description}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-stone-500">
                            {new Date(transaction.date).toLocaleDateString()}
                        </span>
                        <Badge className={getStatusColor(transaction.status)}>
                          {transaction.status}
                        </Badge>
                        <span className="text-xs text-stone-500">
                          {transaction.category}
                        </span>
                      </div>
                    </div>
                    <div className={`font-mono font-medium tabular-nums ${
                      transaction.type === 'Credit' ? 'text-primary' : 'text-red-600'
                    }`}>
                      {transaction.type === 'Credit' ? '+' : '-'}
                      {formatCurrency(Math.abs(transaction.amount), transaction.currency)}
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          </div>

          {/* Cash by Currency */}
          <div className="col-span-3 bg-white rounded-xl border border-stone-200 shadow-sm">
            <div className="p-6 border-b border-stone-100">
              <div className="font-display font-bold text-xl text-stone-900 mb-1">Cash by Currency</div>
              <div className="text-sm text-stone-500">Distribution across currencies</div>
            </div>
            <div className="p-6">
              {Object.keys(data.accountsByCurrency).length === 0 ? (
                <div className="text-center py-8 text-stone-400">
                  <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No accounts found</p>
                </div>
              ) : (
              <div className="space-y-4">
                {Object.entries(data.accountsByCurrency).map(([currency, accounts]) => {
                    const totalBalance = accounts.reduce((sum, acc) => {
                      const balance = acc.balance ?? acc.current_balance ?? acc.available_balance ?? 0;
                      return sum + balance;
                    }, 0);
                    const percentage = data.totalCashUSD > 0
                      ? (totalBalance / data.totalCashUSD) * 100
                      : 0;

                  return (
                    <div key={currency} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-stone-900">{currency}</p>
                          <p className="text-xs text-stone-500">
                            {accounts.length} account{accounts.length > 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-semibold tabular-nums text-stone-900">
                            {formatCurrency(totalBalance, currency)}
                          </p>
                          <p className="text-xs text-stone-500">
                            {percentage.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                    );
                })}
              </div>
              )}
            </div>
          </div>
        </div>

        {/* Entity Summary */}
        {data.entityStats.length > 0 && (
        <div className="mt-4 bg-white rounded-xl border border-stone-200 shadow-sm">
          <div className="p-6 border-b border-stone-100">
            <div className="font-display font-bold text-xl text-stone-900 mb-1">Cash by Entity</div>
            <div className="text-sm text-stone-500">Distribution across legal entities</div>
          </div>
          <div className="p-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.entityStats.map((entity) => (
                  <Link
                    key={entity.entity_id}
                    href={`/entities/${entity.entity_id}`}
                    className="p-4 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-stone-900">{entity.entity_name}</p>
                      <Badge variant="outline" className="border-stone-300 text-stone-600">{entity.account_count} accounts</Badge>
                </div>
                    <p className="text-2xl font-display font-black tabular-nums text-stone-900">
                      {formatCurrency(entity.total_balance, 'USD')}
                    </p>
                  </Link>
                ))}
            </div>
          </div>
        </div>
        )}
        </div>
      </div>
    </div>
  );
}
