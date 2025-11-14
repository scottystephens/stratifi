'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTenant } from '@/lib/tenant-context';
import { useAuth } from '@/lib/auth-context';
import { Navigation } from '@/components/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import type { Account } from '@/lib/supabase';

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking Account' },
  { value: 'savings', label: 'Savings Account' },
  { value: 'money_market', label: 'Money Market Account' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'loan', label: 'Loan Account' },
  { value: 'investment', label: 'Investment Account' },
  { value: 'other', label: 'Other' },
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY'];

export default function EditAccountPage() {
  const router = useRouter();
  const params = useParams();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);

  const accountId = params.id as string;

  useEffect(() => {
    if (currentTenant && accountId) {
      loadAccount();
    }
  }, [currentTenant, accountId]);

  async function loadAccount() {
    if (!currentTenant) return;

    try {
      setLoading(true);
      const response = await fetch(
        `/api/accounts?tenantId=${currentTenant.id}&id=${accountId}`
      );
      const data = await response.json();

      if (data.success && data.account) {
        setAccount(data.account);
      } else {
        alert('Account not found');
        router.push('/accounts');
      }
    } catch (error) {
      console.error('Error loading account:', error);
      alert('Failed to load account');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!currentTenant || !account) return;

    try {
      setSaving(true);
      const response = await fetch('/api/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: account.account_id || account.id,
          tenantId: currentTenant.id,
          ...account,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert('Account updated successfully!');
        router.push('/accounts');
      } else {
        alert(`Failed to update account: ${data.error}`);
      }
    } catch (error) {
      console.error('Error updating account:', error);
      alert('Failed to update account');
    } finally {
      setSaving(false);
    }
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

  if (loading) {
    return (
      <div className="flex h-screen">
        <Navigation />
        <main className="flex-1 overflow-y-auto bg-background p-8">
          <div className="text-center py-12">
            <p>Loading account...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex h-screen">
        <Navigation />
        <main className="flex-1 overflow-y-auto bg-background p-8">
          <Card className="p-12 text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-4">Account Not Found</h2>
            <Button onClick={() => router.push('/accounts')}>
              Back to Accounts
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Navigation />

      <main className="flex-1 overflow-y-auto bg-background p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Button
              variant="ghost"
              onClick={() => router.push('/accounts')}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Accounts
            </Button>
            <h1 className="text-3xl font-bold">Edit Account</h1>
            <p className="text-muted-foreground mt-2">{account.account_name}</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              {/* Basic Information */}
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="block font-medium mb-2">Account Name</label>
                    <input
                      type="text"
                      value={account.account_name}
                      onChange={(e) =>
                        setAccount({ ...account, account_name: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-2">Account Type</label>
                    <select
                      value={account.account_type}
                      onChange={(e) =>
                        setAccount({ ...account, account_type: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2"
                      required
                    >
                      {ACCOUNT_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium mb-2">Account Number</label>
                    <input
                      type="text"
                      value={account.account_number || ''}
                      onChange={(e) =>
                        setAccount({ ...account, account_number: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-2">Currency</label>
                    <select
                      value={account.currency || 'USD'}
                      onChange={(e) =>
                        setAccount({ ...account, currency: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2"
                    >
                      {CURRENCIES.map((curr) => (
                        <option key={curr} value={curr}>
                          {curr}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium mb-2">Current Balance</label>
                    <input
                      type="number"
                      step="0.01"
                      value={account.current_balance || 0}
                      onChange={(e) =>
                        setAccount({
                          ...account,
                          current_balance: parseFloat(e.target.value),
                        })
                      }
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                </div>
              </Card>

              {/* Bank Information */}
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Bank Information</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block font-medium mb-2">Bank Name</label>
                    <input
                      type="text"
                      value={account.bank_name || ''}
                      onChange={(e) =>
                        setAccount({ ...account, bank_name: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., Chase Bank"
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-2">
                      Bank Identifier (SWIFT/Routing)
                    </label>
                    <input
                      type="text"
                      value={account.bank_identifier || ''}
                      onChange={(e) =>
                        setAccount({ ...account, bank_identifier: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., CHASUS33 or 021000021"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block font-medium mb-2">Branch Name</label>
                    <input
                      type="text"
                      value={account.branch_name || ''}
                      onChange={(e) =>
                        setAccount({ ...account, branch_name: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., Manhattan Main Branch"
                    />
                  </div>
                </div>
              </Card>

              {/* Limits & Controls */}
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Limits & Controls</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block font-medium mb-2">Credit Limit</label>
                    <input
                      type="number"
                      step="0.01"
                      value={account.credit_limit || ''}
                      onChange={(e) =>
                        setAccount({
                          ...account,
                          credit_limit: e.target.value ? parseFloat(e.target.value) : undefined,
                        })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-2">Overdraft Limit</label>
                    <input
                      type="number"
                      step="0.01"
                      value={account.overdraft_limit || ''}
                      onChange={(e) =>
                        setAccount({
                          ...account,
                          overdraft_limit: e.target.value ? parseFloat(e.target.value) : undefined,
                        })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </Card>

              {/* Categorization */}
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Categorization</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block font-medium mb-2">Business Unit</label>
                    <input
                      type="text"
                      value={account.business_unit || ''}
                      onChange={(e) =>
                        setAccount({ ...account, business_unit: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., North America Operations"
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-2">Cost Center</label>
                    <input
                      type="text"
                      value={account.cost_center || ''}
                      onChange={(e) =>
                        setAccount({ ...account, cost_center: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., CC-1001"
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-2">GL Account Code</label>
                    <input
                      type="text"
                      value={account.gl_account_code || ''}
                      onChange={(e) =>
                        setAccount({ ...account, gl_account_code: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., 1000-100-001"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block font-medium mb-2">Purpose</label>
                    <input
                      type="text"
                      value={account.purpose || ''}
                      onChange={(e) =>
                        setAccount({ ...account, purpose: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., Operating expenses for Q1 2025"
                    />
                  </div>
                </div>
              </Card>

              {/* Custom Fields */}
              {account.custom_fields && (
                <Card className="p-6">
                  <h2 className="text-xl font-semibold mb-4">Custom Fields</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    Custom fields for this account
                  </p>
                  <div className="space-y-3">
                    {Object.entries(account.custom_fields).map(([key, value]: [string, any]) => (
                      <div key={key} className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">
                            {value.label || key}
                          </label>
                        </div>
                        <div>
                          <input
                            type="text"
                            value={value.value || ''}
                            onChange={(e) => {
                              const updated = { ...account.custom_fields };
                              updated[key] = { ...value, value: e.target.value };
                              setAccount({ ...account, custom_fields: updated });
                            }}
                            className="w-full border rounded px-3 py-2"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Notes */}
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Notes</h2>
                <textarea
                  value={account.notes || ''}
                  onChange={(e) =>
                    setAccount({ ...account, notes: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                  rows={4}
                  placeholder="Add any additional notes or documentation..."
                />
              </Card>

              {/* Actions */}
              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/accounts')}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

