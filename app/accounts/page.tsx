'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/lib/tenant-context';
import { useAuth } from '@/lib/auth-context';
import { Navigation } from '@/components/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Building, Trash2, Edit, DollarSign, TrendingUp } from 'lucide-react';
import type { Account } from '@/lib/supabase';

export default function AccountsPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (currentTenant) {
      loadAccounts();
    }
  }, [currentTenant]);

  async function loadAccounts() {
    if (!currentTenant) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/accounts?tenantId=${currentTenant.id}`);
      const data = await response.json();

      if (data.success) {
        setAccounts(data.accounts);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(accountId: string) {
    if (!currentTenant) return;
    if (!confirm('Are you sure you want to delete this account? This cannot be undone.')) {
      return;
    }

    try {
      setDeleting(accountId);
      const response = await fetch(
        `/api/accounts?id=${accountId}&tenantId=${currentTenant.id}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        setAccounts(accounts.filter((a) => a.id !== accountId));
      } else {
        alert('Failed to delete account');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Failed to delete account');
    } finally {
      setDeleting(null);
    }
  }

  function getAccountTypeColor(type: string) {
    const colors: Record<string, string> = {
      checking: 'bg-blue-100 text-blue-800',
      savings: 'bg-green-100 text-green-800',
      money_market: 'bg-purple-100 text-purple-800',
      credit_card: 'bg-red-100 text-red-800',
      loan: 'bg-orange-100 text-orange-800',
      investment: 'bg-yellow-100 text-yellow-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  }

  function getStatusColor(status: string) {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      closed: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
    };
    return colors[status || 'active'] || 'bg-gray-100 text-gray-800';
  }

  function formatCurrency(amount: number | undefined, currency: string = 'USD') {
    if (amount === undefined || amount === null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }

  if (!currentTenant) {
    return (
      <div className="flex h-screen">
        <Navigation />
        <main className="flex-1 overflow-y-auto bg-background p-8">
          <Card className="p-12 text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-4">No Organization Selected</h2>
            <p className="text-muted-foreground">
              Please select an organization from the sidebar.
            </p>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Navigation />

      <main className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-[1600px] mx-auto px-6 py-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold">Accounts</h1>
              <p className="text-muted-foreground mt-2">
                Manage your bank accounts and financial accounts
              </p>
            </div>
            <Button
              onClick={() => router.push('/accounts/new')}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              New Account
            </Button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <p>Loading accounts...</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && accounts.length === 0 && (
            <Card className="p-12 text-center">
              <div className="flex justify-center mb-4">
                <Building className="h-16 w-16 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">No accounts yet</h2>
              <p className="text-muted-foreground mb-6">
                Create your first account to start tracking transactions
              </p>
              <Button onClick={() => router.push('/accounts/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Create Account
              </Button>
            </Card>
          )}

          {/* Accounts Grid */}
          {!loading && accounts.length > 0 && (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {accounts.map((account) => (
                <Card key={account.account_id || account.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Building className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{account.account_name}</h3>
                        {account.account_number && (
                          <p className="text-sm text-muted-foreground">
                            •••• {account.account_number.slice(-4)}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(account.account_id || account.id!)}
                      disabled={deleting === (account.account_id || account.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Type</span>
                      <Badge className={getAccountTypeColor(account.account_type)}>
                        {account.account_type.replace('_', ' ')}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge className={getStatusColor(account.account_status || 'active')}>
                        {account.account_status || 'active'}
                      </Badge>
                    </div>

                    {account.bank_name && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Bank</span>
                        <span className="text-sm font-medium">{account.bank_name}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Currency</span>
                      <span className="text-sm font-medium">{account.currency || 'USD'}</span>
                    </div>
                  </div>

                  {/* Balance */}
                  <div className="border-t pt-4 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Current Balance</span>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        <span className="text-lg font-bold">
                          {formatCurrency(account.current_balance, account.currency)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/accounts/${account.account_id || account.id}`)}
                      className="flex-1"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/accounts/${account.account_id || account.id}/transactions`)}
                      className="flex-1"
                    >
                      <TrendingUp className="h-4 w-4 mr-1" />
                      Transactions
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

