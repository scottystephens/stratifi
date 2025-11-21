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
        <main className="flex-1 overflow-y-auto bg-background p-8">
          <Card className="p-12 text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-4">No Organization Selected</h2>
            <p className="text-muted-foreground">Please select an organization.</p>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Navigation />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="p-6 max-w-7xl mx-auto">
          {/* Compact Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">Accounts</h1>
              <p className="text-sm text-muted-foreground">{accounts.length} accounts · {formatCurrency(totalBalance)}</p>
            </div>
            <Button onClick={() => router.push('/accounts/new')} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          </div>

          {/* Compact Filter Bar */}
          {!loading && accounts.length > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {['all', 'synced', 'manual'].map(f => (
                <Button
                  key={f}
                  variant={filter === f ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilter(f)}
                  className="h-7 text-xs"
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
                  className="h-7 text-xs"
                >
                  {provider}
                </Button>
              ))}
            </div>
          )}

          {loading && <div className="text-center py-12"><p>Loading...</p></div>}

          {!loading && filteredAccounts.length === 0 && accounts.length === 0 && (
            <Card className="p-12 text-center">
              <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No accounts yet</h2>
              <p className="text-sm text-muted-foreground mb-4">Create your first account</p>
              <Button onClick={() => router.push('/accounts/new')} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Create Account
              </Button>
            </Card>
          )}

          {!loading && filteredAccounts.length === 0 && accounts.length > 0 && (
            <Card className="p-8 text-center">
              <p className="text-sm text-muted-foreground">No accounts match this filter</p>
              <Button variant="ghost" size="sm" onClick={() => setFilter('all')} className="mt-2">
                Show All
              </Button>
            </Card>
          )}

          {/* Compact Table View */}
          {!loading && filteredAccounts.length > 0 && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Account</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Type</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Bank</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Source</th>
                      <th className="text-right p-3 text-xs font-medium text-muted-foreground">Balance</th>
                      <th className="text-right p-3 text-xs font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.map((account, idx) => (
                      <tr 
                        key={account.account_id || account.id} 
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => router.push(`/accounts/${account.account_id || account.id}`)}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Wallet className="h-4 w-4 text-blue-600 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{account.account_name}</p>
                              {account.account_number && (
                                <p className="text-xs text-muted-foreground">•••• {account.account_number.slice(-4)}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
                            {account.account_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="text-sm">{account.bank_name || '-'}</span>
                        </td>
                        <td className="p-3">
                          {account.connection_provider ? (
                            <ProviderBadge
                              provider={account.connection_provider}
                              connectionName={account.connection_name}
                              connectionId={account.connection_id}
                              showLink={false}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">Manual</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <span className="font-semibold text-sm">
                            {formatCurrency(account.current_balance, account.currency)}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/accounts/${account.account_id || account.id}/transactions`);
                              }}
                              className="h-7 text-xs"
                            >
                              Transactions
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(account.account_id || account.id!);
                              }}
                              disabled={deleteAccountMutation.isPending}
                              className="h-7 w-7 p-0"
                            >
                              <Trash2 className="h-3 w-3 text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
