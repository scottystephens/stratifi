'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/lib/tenant-context';
import { Navigation } from '@/components/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Building, Trash2, TrendingUp, Filter, DollarSign, Wallet } from 'lucide-react';
import type { Account } from '@/lib/supabase';
import { ProviderBadge } from '@/components/ui/provider-badge';
import { useAccounts, useDeleteAccount } from '@/lib/hooks/use-accounts';
import { toast } from 'sonner';

type FilterType = 'all' | 'synced' | 'manual' | string;

export default function AccountsPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const [filter, setFilter] = useState<FilterType>('all');
  
  const { data: accounts = [], isLoading: loading, error } = useAccounts(currentTenant?.id);
  const deleteAccountMutation = useDeleteAccount();

  const filteredAccounts = useMemo(() => {
    if (filter === 'all') return accounts;
    if (filter === 'synced') return accounts.filter(acc => acc.is_synced);
    if (filter === 'manual') return accounts.filter(acc => !acc.is_synced);
    return accounts.filter(acc => acc.connection_provider === filter);
  }, [accounts, filter]);

  useEffect(() => {
    if (error) {
      toast.error('Failed to load accounts', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [error]);

  async function handleDelete(accountId: string) {
    if (!currentTenant) return;
    if (!confirm('Delete this account? This cannot be undone.')) return;
    deleteAccountMutation.mutate({ accountId, tenantId: currentTenant.id });
  }

  function formatCurrency(amount: number | undefined, currency: string = 'USD') {
    if (amount === undefined || amount === null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + (acc.current_balance || 0), 0);
  }, [accounts]);

  if (!currentTenant) {
    return (
      <div className="flex h-screen">
        <Navigation />
        <main className="flex-1 overflow-y-auto bg-stone-50 p-8">
          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-12 text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-display font-bold text-stone-900 mb-4">No Organization Selected</h2>
            <p className="text-stone-500">Please select an organization.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Navigation />
      <main className="flex-1 overflow-y-auto bg-stone-50">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-stone-900">Accounts</h1>
              <p className="text-stone-500">{accounts.length} accounts · <span className="font-mono tabular-nums">{formatCurrency(totalBalance)}</span></p>
            </div>
            <Button onClick={() => router.push('/accounts/new')} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          </div>

          {/* Filter Bar */}
          {!loading && accounts.length > 0 && (
            <div className="flex items-center gap-2 mb-6">
              <Filter className="h-4 w-4 text-stone-400" />
              {['all', 'synced', 'manual'].map(f => (
                <Button
                  key={f}
                  variant={filter === f ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilter(f)}
                  className={`h-7 text-xs ${filter === f ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'}`}
                >
                  {f === 'all' ? 'All' : f === 'synced' ? 'Synced' : 'Manual'}
                </Button>
              ))}
              {Array.from(new Set(accounts.map(acc => acc.connection_provider).filter(Boolean))).map((provider) => (
                <Button
                  key={provider}
                  variant={filter === provider ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilter(provider!)}
                  className={`h-7 text-xs ${filter === provider ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'}`}
                >
                  {provider}
                </Button>
              ))}
            </div>
          )}

          {loading && <div className="text-center py-12"><p>Loading...</p></div>}

          {!loading && filteredAccounts.length === 0 && accounts.length === 0 && (
            <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-12 text-center">
              <Wallet className="h-12 w-12 text-stone-400 mx-auto mb-4" />
              <h2 className="text-xl font-display font-bold text-stone-900 mb-2">No accounts yet</h2>
              <p className="text-stone-500 mb-4">Create your first account to get started</p>
              <Button onClick={() => router.push('/accounts/new')} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" />
                Create Account
              </Button>
            </div>
          )}

          {!loading && filteredAccounts.length === 0 && accounts.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-8 text-center">
              <p className="text-stone-500">No accounts match this filter</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilter('all')}
                className="mt-2 text-primary hover:text-primary/80 hover:bg-primary/10"
              >
                Show All
              </Button>
            </div>
          )}

          {/* Account Cards Grid */}
          {!loading && filteredAccounts.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredAccounts.map((account) => (
                <div
                  key={account.account_id || account.id}
                  className="bg-white rounded-xl border border-stone-200 shadow-sm hover:shadow-card-hover hover:border-stone-300 transition-all cursor-pointer group"
                  onClick={() => router.push(`/accounts/${account.account_id || account.id}`)}
                >
                  <div className="p-6">
                    {/* Account Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Wallet className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-stone-900 truncate">{account.account_name}</h3>
                          {account.account_number && (
                            <p className="text-sm text-stone-500 font-mono">•••• {account.account_number.slice(-4)}</p>
                          )}
                        </div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(account.account_id || account.id!);
                          }}
                          disabled={deleteAccountMutation.isPending}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Account Type & Bank */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-1 rounded-full bg-stone-100 text-stone-700 font-medium">
                          {account.account_type.replace('_', ' ')}
                        </span>
                        {account.is_synced && account.connection_provider ? (
                          <ProviderBadge
                            provider={account.connection_provider}
                            connectionName={account.connection_name}
                            connectionId={account.connection_id}
                            showLink={false}
                          />
                        ) : (
                          <Badge variant="outline" className="text-xs border-stone-300 text-stone-600">Manual</Badge>
                        )}
                      </div>
                      <span className="text-sm text-stone-500">{account.bank_name || '-'}</span>
                    </div>

                    {/* Balance */}
                    <div className="text-right">
                      <div className="text-2xl font-black tabular-nums text-stone-900">
                        {formatCurrency(account.current_balance, account.currency)}
                      </div>
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div className="px-6 pb-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/accounts/${account.account_id || account.id}/transactions`);
                      }}
                      className="w-full text-primary hover:text-primary/80 hover:bg-primary/10"
                    >
                      View Transactions
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
