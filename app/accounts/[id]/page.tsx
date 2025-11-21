'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/lib/tenant-context';
import { useAuth } from '@/lib/auth-context';
import { Navigation } from '@/components/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Pencil,
  Download,
  UploadCloud,
  Plus,
  BarChart3,
  ListOrdered,
  RefreshCw,
  Database,
} from 'lucide-react';
import type { Account } from '@/lib/supabase';
import { accountKeys, useAccount } from '@/lib/hooks/use-accounts';
import { useAccountTransactions } from '@/lib/hooks/use-transactions';
import {
  useAccountStatements,
  useCreateStatement,
  useImportStatements,
  useImportTransactions,
} from '@/lib/hooks/use-statements';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

type CustomField = { id: string; label: string; value: string };
const MAX_CUSTOM_FIELDS = 10;

export default function AccountOverviewPage() {
  const router = useRouter();
  const params = useParams();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const accountId = params.id as string;

  const [activeTab, setActiveTab] = useState<'activity' | 'statements' | 'fields'>('activity');
  const [statementPage, setStatementPage] = useState(1);
  const [showStatementForm, setShowStatementForm] = useState(false);
  const [statementForm, setStatementForm] = useState({
    date: new Date().toISOString().split('T')[0],
    endingBalance: '',
    availableBalance: '',
    currency: 'USD',
    notes: '',
  });
  const [importContext, setImportContext] = useState<'statements' | 'transactions' | null>(null);
  const [csvText, setCsvText] = useState<{ statements: string; transactions: string }>({
    statements: '',
    transactions: '',
  });
  const [transactionPage, setTransactionPage] = useState(1);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldDraft, setCustomFieldDraft] = useState({ label: '', value: '' });
  const [savingCustomFields, setSavingCustomFields] = useState(false);

  const { data: account, isLoading } = useAccount(currentTenant?.id, accountId);
  const {
    data: transactionsData,
    isLoading: transactionsLoading,
  } = useAccountTransactions(currentTenant?.id, accountId, {
    page: transactionPage,
    pageSize: 20,
  });
  const {
    data: statementData,
    isLoading: statementsLoading,
  } = useAccountStatements(currentTenant?.id, accountId, { page: statementPage, pageSize: 30 });
  const createStatementMutation = useCreateStatement();
  const importStatementsMutation = useImportStatements();
  const importTransactionsMutation = useImportTransactions();

  useEffect(() => {
    if (account?.custom_fields) {
      const value = account.custom_fields;
      let parsed: CustomField[] = [];
      if (Array.isArray(value)) {
        parsed = value
          .filter((field) => field && field.label)
          .slice(0, MAX_CUSTOM_FIELDS)
          .map((field, idx) => ({
            id: field.id || `field-${idx}`,
            label: field.label,
            value: field.value ?? '',
          }));
      } else if (typeof value === 'object') {
        parsed = Object.entries(value).map(([key, val]) => ({
          id: key,
          label: key,
          value: typeof val === 'string' ? val : JSON.stringify(val),
        }));
      }
      setCustomFields(parsed);
    }
  }, [account?.custom_fields]);

  const statements = statementData?.statements || [];
  const latestStatement = statements[0];
  const statementChartData = useMemo(() => {
    const rows = statementData?.statements || [];
    return [...rows]
      .sort(
        (a: any, b: any) =>
          new Date(a.statement_date).getTime() - new Date(b.statement_date).getTime()
      )
      .map((statement: any) => ({
        date: statement.statement_date,
        ending_balance: statement.ending_balance,
      }));
  }, [statementData?.statements]);

  const transactions = transactionsData?.transactions || [];

  const formatCurrencyValue = (value?: number | null, currency?: string | null) => {
    const safeCurrency = currency && currency.trim() !== '' ? currency : 'USD';
    const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: safeCurrency,
      minimumFractionDigits: 2,
    }).format(safeValue);
  };

  const handleStatementSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentTenant) return;

    const endingBalance = parseFloat(statementForm.endingBalance);
    if (Number.isNaN(endingBalance)) {
      toast.error('Ending balance is required');
      return;
    }

    const availableBalance =
      statementForm.availableBalance && statementForm.availableBalance !== ''
        ? parseFloat(statementForm.availableBalance)
        : undefined;

    createStatementMutation.mutate(
      {
        tenantId: currentTenant.id,
        accountId,
        statementDate: statementForm.date,
        endingBalance,
        availableBalance,
        currency: statementForm.currency,
        source: 'manual',
        confidence: 'medium',
        metadata: statementForm.notes ? { notes: statementForm.notes } : undefined,
      },
      {
        onSuccess: () => {
          setShowStatementForm(false);
          setStatementForm((prev) => ({
            ...prev,
            endingBalance: '',
            availableBalance: '',
            notes: '',
          }));
        },
      }
    );
  };

  const handleDownloadStatements = () => {
    if (!account) return;
    if (!statements.length) {
      toast.info('No statements to export');
      return;
    }

    const header = 'statement_date,ending_balance,available_balance,currency,source,confidence\n';
    const rows = statements
      .map(
        (statement: any) =>
          `${statement.statement_date},${statement.ending_balance},${statement.available_balance ?? ''},${statement.currency},${statement.source},${statement.confidence}`
      )
      .join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${account.account_name || 'account'}-statements.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCsvImport = (context: 'statements' | 'transactions', mode: 'validate' | 'import') => {
    if (!currentTenant) return;
    const csvPayload = csvText[context];
    if (!csvPayload || csvPayload.trim() === '') {
      toast.error('Please paste CSV data before continuing');
      return;
    }

    const mutation =
      context === 'statements' ? importStatementsMutation : importTransactionsMutation;

    mutation.mutate(
      {
        tenantId: currentTenant.id,
        accountId,
        csvData: csvPayload,
        mode,
      },
      {
        onSuccess: () => {
          if (mode === 'import') {
            setCsvText((prev) => ({ ...prev, [context]: '' }));
            setImportContext(null);
          }
        },
      }
    );
  };

  const importLoading =
    (importContext === 'statements' && importStatementsMutation.isPending) ||
    (importContext === 'transactions' && importTransactionsMutation.isPending);

  const handleAddCustomField = () => {
    if (!customFieldDraft.label.trim()) {
      toast.error('Label is required');
      return;
    }
    if (customFields.length >= MAX_CUSTOM_FIELDS) {
      toast.error(`You can only add up to ${MAX_CUSTOM_FIELDS} custom fields`);
      return;
    }
    setCustomFields((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        label: customFieldDraft.label.trim(),
        value: customFieldDraft.value,
      },
    ]);
    setCustomFieldDraft({ label: '', value: '' });
  };

  const handleSaveCustomFields = async () => {
    if (!currentTenant || !account) return;
    setSavingCustomFields(true);
    try {
      const response = await fetch('/api/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: currentTenant.id,
          accountId: account.account_id || account.id,
          custom_fields: customFields,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to update custom fields');
      }
      toast.success('Custom fields updated');
      queryClient.invalidateQueries({
        queryKey: accountKeys.detail(currentTenant.id, accountId),
      });
    } catch (error) {
      toast.error('Failed to update custom fields', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSavingCustomFields(false);
    }
  };

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

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <Navigation />
        <main className="flex-1 overflow-y-auto bg-background p-8">
          <div className="text-center py-12">Loading account…</div>
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
            <Button onClick={() => router.push('/accounts')}>Back to Accounts</Button>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Navigation />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            Account Overview
          </div>
          <h1 className="text-3xl font-bold mt-1">{account.account_name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {account.bank_name || 'Unspecified bank'} • {account.account_type}
          </p>
          
          {/* Sync and Connection Info */}
          <div className="flex items-center gap-3 mt-2">
            {account.connection_id && (
              <Link 
                href={`/connections/${account.connection_id}`}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <Database className="h-3 w-3" />
                View Connection
              </Link>
            )}
            {account.last_synced_at && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <RefreshCw className="h-3 w-3" />
                Synced {new Date(account.last_synced_at).toLocaleString()}
              </div>
            )}
            {account.provider_id && (
              <Badge variant="outline" className="text-xs">
                {account.provider_id}
              </Badge>
            )}
          </div>

          <p className="text-lg font-semibold mt-4">
            {formatCurrencyValue(
              latestStatement?.ending_balance ?? account.current_balance ?? 0,
              latestStatement?.currency || account.currency
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {latestStatement?.statement_date
              ? `Last statement: ${new Date(latestStatement.statement_date).toLocaleDateString()}`
              : 'No statements yet'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push('/accounts')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            All Accounts
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2 text-sm">
        {(['activity', 'statements', 'fields'] as const).map((tab) => (
          <button
            key={tab}
            className={`rounded-full px-4 py-1 ${
              activeTab === tab ? 'bg-primary text-white' : 'text-muted-foreground'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'activity' && 'Activity'}
            {tab === 'statements' && 'Statements'}
            {tab === 'fields' && 'Custom Fields'}
          </button>
        ))}
      </div>

      {activeTab === 'activity' && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ListOrdered className="h-4 w-4" />
                Recent Transactions
              </h2>
              <p className="text-sm text-muted-foreground">
                Showing the most recent {transactions.length} entries
              </p>
            </div>
            <Link href={`/accounts/${accountId}/transactions`}>
              <Button variant="outline" size="sm">
                View Full History
              </Button>
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Reference</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactionsLoading ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-muted-foreground">
                      Loading transactions…
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-muted-foreground">
                      No transactions yet
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.transaction_id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground">
                        {new Date(tx.date).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4">{tx.description}</td>
                      <td className="py-2 pr-4">
                        {tx.category ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            {tx.category}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {tx.reference || '—'}
                      </td>
                      <td
                        className={`py-2 pl-4 text-right font-semibold ${
                          tx.amount >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {formatCurrencyValue(tx.amount, tx.currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>
              Page {transactionsData?.page || 1} of {transactionsData?.totalPages || 1}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTransactionPage((prev) => Math.max(prev - 1, 1))}
                disabled={transactionPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTransactionPage((prev) => prev + 1)}
                disabled={!transactionsData?.hasMore}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'statements' && (
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Statement History
              </h2>
              <p className="text-sm text-muted-foreground">
                Use statements to drive balance history and compliance records.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadStatements}
                disabled={!statements.length}
              >
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportContext('statements')}>
                <UploadCloud className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
              <Button size="sm" onClick={() => setShowStatementForm((prev) => !prev)}>
                <Plus className="h-4 w-4 mr-2" />
                {showStatementForm ? 'Cancel' : 'Add Statement'}
              </Button>
            </div>
          </div>

          <div className="w-full h-48">
            {statementsLoading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Loading chart…
              </div>
            ) : statementChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No statements yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={statementChartData}>
                  <defs>
                    <linearGradient id="statementBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip
                    formatter={(value: number) =>
                      formatCurrencyValue(value, latestStatement?.currency || account.currency)
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="ending_balance"
                    stroke="#2563eb"
                    fill="url(#statementBalance)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {showStatementForm && (
            <form
              onSubmit={handleStatementSubmit}
              className="grid gap-4 rounded-lg border p-4 md:grid-cols-5"
            >
              <div>
                <label className="block text-sm font-medium mb-1">Date</label>
                <input
                  type="date"
                  className="w-full border rounded px-3 py-2"
                  value={statementForm.date}
                  onChange={(e) => setStatementForm((prev) => ({ ...prev, date: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ending Balance</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded px-3 py-2"
                  value={statementForm.endingBalance}
                  onChange={(e) =>
                    setStatementForm((prev) => ({ ...prev, endingBalance: e.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Available Balance</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded px-3 py-2"
                  value={statementForm.availableBalance}
                  onChange={(e) =>
                    setStatementForm((prev) => ({ ...prev, availableBalance: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Currency</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  value={statementForm.currency}
                  onChange={(e) =>
                    setStatementForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))
                  }
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea
                  className="w-full border rounded px-3 py-2"
                  rows={2}
                  value={statementForm.notes}
                  onChange={(e) => setStatementForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional memo or supporting details"
                />
              </div>
              <div className="md:col-span-3 flex items-end justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setShowStatementForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createStatementMutation.isPending}>
                  {createStatementMutation.isPending ? 'Saving…' : 'Save Statement'}
                </Button>
              </div>
            </form>
          )}

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 px-4">Date</th>
                  <th className="py-2 px-4 text-right">Ending Balance</th>
                  <th className="py-2 px-4 text-right">Available</th>
                  <th className="py-2 px-4">Source</th>
                  <th className="py-2 px-4">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {statements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 px-4 text-center text-muted-foreground">
                      No statements recorded yet
                    </td>
                  </tr>
                ) : (
                  statements.map((statement: any) => (
                    <tr key={statement.id} className="border-t">
                      <td className="py-2 px-4">
                        {new Date(statement.statement_date).toLocaleDateString()}
                      </td>
                      <td className="py-2 px-4 text-right font-semibold">
                        {formatCurrencyValue(statement.ending_balance, statement.currency)}
                      </td>
                      <td className="py-2 px-4 text-right text-muted-foreground">
                        {statement.available_balance
                          ? formatCurrencyValue(statement.available_balance, statement.currency)
                          : '—'}
                      </td>
                      <td className="py-2 px-4 capitalize">{statement.source}</td>
                      <td className="py-2 px-4 capitalize">{statement.confidence || 'high'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between text-sm text-muted-foreground">
            <span>
              Page {statementData?.page || 1} of {statementData?.totalPages || 1}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatementPage((prev) => Math.max(prev - 1, 1))}
                disabled={statementPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setStatementPage((prev) => (statementData?.hasMore ? prev + 1 : prev))
                }
                disabled={!statementData?.hasMore}
              >
                Next
              </Button>
            </div>
          </div>

          {importContext && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold capitalize">{importContext} CSV Import</h3>
                <Button variant="ghost" size="sm" onClick={() => setImportContext(null)}>
                  Close
                </Button>
              </div>
              <textarea
                className="w-full border rounded px-3 py-2 text-xs"
                rows={6}
                value={csvText[importContext]}
                onChange={(e) =>
                  setCsvText((prev) => ({ ...prev, [importContext]: e.target.value }))
                }
                placeholder="Paste CSV data here..."
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={importLoading}
                  onClick={() => handleCsvImport(importContext, 'validate')}
                >
                  Validate
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={importLoading}
                  onClick={() => handleCsvImport(importContext, 'import')}
                >
                  {importLoading ? 'Importing…' : 'Import'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'fields' && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Custom Fields</h2>
              <p className="text-sm text-muted-foreground">
                Track up to {MAX_CUSTOM_FIELDS} account-specific attributes.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveCustomFields}
              disabled={savingCustomFields}
            >
              {savingCustomFields ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>

          <div className="grid gap-3">
            {customFields.length === 0 && (
              <p className="text-sm text-muted-foreground">No custom fields yet.</p>
            )}
            {customFields.map((field, index) => (
              <div key={field.id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Label
                  </label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={field.label}
                    onChange={(e) =>
                      setCustomFields((prev) => {
                        const copy = [...prev];
                        copy[index] = { ...copy[index], label: e.target.value };
                        return copy;
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Value
                  </label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={field.value}
                    onChange={(e) =>
                      setCustomFields((prev) => {
                        const copy = [...prev];
                        copy[index] = { ...copy[index], value: e.target.value };
                        return copy;
                      })
                    }
                  />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setCustomFields((prev) => prev.filter((f) => f.id !== field.id))
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-semibold">Add Custom Field</h3>
            <div className="grid gap-2 md:grid-cols-2">
              <input
                type="text"
                placeholder="Label"
                className="border rounded px-3 py-2 text-sm"
                value={customFieldDraft.label}
                onChange={(e) => setCustomFieldDraft((prev) => ({ ...prev, label: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Value"
                className="border rounded px-3 py-2 text-sm"
                value={customFieldDraft.value}
                onChange={(e) => setCustomFieldDraft((prev) => ({ ...prev, value: e.target.value }))}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddCustomField}
              disabled={customFields.length >= MAX_CUSTOM_FIELDS}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Field
            </Button>
          </div>
        </Card>
      )}

        </div>
      </main>
    </div>
  );
}
