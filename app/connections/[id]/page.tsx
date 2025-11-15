'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTenant } from '@/lib/tenant-context';
import { Navigation } from '@/components/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, RefreshCw, Trash2, CheckCircle2, AlertCircle, Clock, Building2, CreditCard, TrendingUp } from 'lucide-react';

interface Connection {
  id: string;
  name: string;
  connection_type: string;
  status: string;
  tenant_id: string;
  account_id: string | null;
  import_mode: string;
  last_sync_at: string | null;
  created_at: string;
  data_type?: string;
  supports_transactions?: boolean;
  supports_statements?: boolean;
  last_error?: string | null;
  provider?: string;
  config?: any;
}

interface ProviderToken {
  id: string;
  provider_id: string;
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_at: string | null;
  scopes: string[];
  provider_user_id: string;
  provider_metadata: any;
  status: string;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ProviderAccount {
  id: string;
  provider_id: string;
  external_account_id: string;
  account_id: string | null;
  account_name: string;
  account_number: string;
  account_type: string;
  currency: string;
  balance: number;
  iban: string | null;
  bic: string | null;
  status: string;
  provider_metadata: any;
  last_synced_at: string | null;
  created_at: string;
}

interface IngestionJob {
  id: string;
  job_type: string;
  status: string;
  records_fetched: number | null;
  records_imported: number | null;
  records_failed: number | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export default function ConnectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentTenant } = useTenant();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [token, setToken] = useState<ProviderToken | null>(null);
  const [accounts, setAccounts] = useState<ProviderAccount[]>([]);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const connectionId = params.id as string;

  useEffect(() => {
    if (currentTenant && connectionId) {
      loadConnectionDetails();
    }
  }, [currentTenant, connectionId]);

  async function loadConnectionDetails() {
    if (!currentTenant) return;

    try {
      setLoading(true);

      // Load connection
      const connResponse = await fetch(`/api/connections?tenantId=${currentTenant.id}`);
      const connData = await connResponse.json();
      if (connData.success) {
        const conn = connData.connections.find((c: Connection) => c.id === connectionId);
        setConnection(conn || null);
      }

      // Load provider token
      const tokenResponse = await fetch(`/api/banking/tokens?connectionId=${connectionId}&tenantId=${currentTenant.id}`);
      const tokenData = await tokenResponse.json();
      if (tokenData.success && tokenData.token) {
        setToken(tokenData.token);
      }

      // Load provider accounts
      const accountsResponse = await fetch(`/api/banking/accounts?connectionId=${connectionId}&tenantId=${currentTenant.id}`);
      const accountsData = await accountsResponse.json();
      if (accountsData.success) {
        setAccounts(accountsData.accounts || []);
      }

      // Load ingestion jobs
      const jobsResponse = await fetch(`/api/connections/jobs?connectionId=${connectionId}&tenantId=${currentTenant.id}`);
      const jobsData = await jobsResponse.json();
      if (jobsData.success) {
        setJobs(jobsData.jobs || []);
      }
    } catch (error) {
      console.error('Error loading connection details:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    if (!currentTenant || !connection || !connection.provider) return;

    try {
      setSyncing(true);
      const response = await fetch(`/api/banking/${connection.provider}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: connection.id,
          tenantId: currentTenant.id,
          syncAccounts: true,
          syncTransactions: true,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert(`Sync complete!\nAccounts: ${data.summary?.accountsSynced || 0}\nTransactions: ${data.summary?.transactionsSynced || 0}`);
        await loadConnectionDetails();
      } else {
        alert(`Sync failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Sync error:', error);
      alert('Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    if (!currentTenant || !connection) return;
    if (!confirm('Are you sure you want to delete this connection?')) return;

    try {
      setDeleting(true);
      const response = await fetch(
        `/api/connections?id=${connection.id}&tenantId=${currentTenant.id}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        router.push('/connections');
      } else {
        alert('Failed to delete connection');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete connection');
    } finally {
      setDeleting(false);
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  function getJobStatusIcon(status: string) {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'running':
        return <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  }

  if (loading || !connection) {
    return (
      <div className="flex h-screen">
        <Navigation />
        <main className="flex-1 overflow-y-auto bg-background p-8">
          <div className="text-center py-12">
            <p>Loading connection details...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Navigation />

      <main className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-[1400px] mx-auto px-6 py-6">
          {/* Header */}
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => router.push('/connections')}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Connections
            </Button>

            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold">{connection.name}</h1>
                <p className="text-muted-foreground mt-2">
                  {connection.provider?.toUpperCase() || connection.connection_type.toUpperCase()} Connection
                </p>
              </div>
              <div className="flex gap-2">
                {connection.provider && (
                  <Button onClick={handleSync} disabled={syncing}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                    Sync Now
                  </Button>
                )}
                <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          </div>

          {/* Connection Overview */}
          <div className="grid gap-6 md:grid-cols-3 mb-6">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="font-semibold">Status</h3>
              </div>
              <Badge className={getStatusColor(connection.status)}>
                {connection.status}
              </Badge>
              {connection.last_error && (
                <p className="text-xs text-red-600 mt-2">{connection.last_error}</p>
              )}
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CreditCard className="h-5 w-5 text-green-600" />
                </div>
                <h3 className="font-semibold">Accounts Synced</h3>
              </div>
              <p className="text-3xl font-bold">{accounts.length}</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <h3 className="font-semibold">Last Sync</h3>
              </div>
              <p className="text-sm">
                {connection.last_sync_at
                  ? new Date(connection.last_sync_at).toLocaleString()
                  : 'Never'}
              </p>
            </Card>
          </div>

          {/* OAuth Token Info */}
          {token && (
            <Card className="p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">OAuth Token Information</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Provider User ID</p>
                  <p className="font-mono text-sm">{token.provider_user_id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Token Status</p>
                  <Badge className={getStatusColor(token.status)}>{token.status}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Token Type</p>
                  <p className="text-sm">{token.token_type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Expires At</p>
                  <p className="text-sm">
                    {token.expires_at ? new Date(token.expires_at).toLocaleString() : 'Never'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Scopes</p>
                  <div className="flex gap-1 flex-wrap">
                    {token.scopes.map((scope) => (
                      <Badge key={scope} variant="outline" className="text-xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Has Refresh Token</p>
                  <p className="text-sm">{token.refresh_token ? 'Yes ✓' : 'No'}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Provider Accounts */}
          <Card className="p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Connected Accounts</h2>
            {accounts.length === 0 ? (
              <p className="text-muted-foreground">No accounts synced yet. Click "Sync Now" to fetch accounts.</p>
            ) : (
              <div className="space-y-4">
                {accounts.map((account) => (
                  <div key={account.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold">{account.account_name}</h3>
                        <p className="text-sm text-muted-foreground">{account.account_type}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold">
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: account.currency,
                          }).format(account.balance)}
                        </p>
                        <Badge className={getStatusColor(account.status)} variant="outline">
                          {account.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {account.iban && (
                        <div>
                          <span className="text-muted-foreground">IBAN:</span> {account.iban}
                        </div>
                      )}
                      {account.account_number && (
                        <div>
                          <span className="text-muted-foreground">Account #:</span> {account.account_number}
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">External ID:</span> {account.external_account_id}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Last Synced:</span>{' '}
                        {account.last_synced_at ? new Date(account.last_synced_at).toLocaleDateString() : 'Never'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Sync History */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Sync History</h2>
            {jobs.length === 0 ? (
              <p className="text-muted-foreground">No sync history yet.</p>
            ) : (
              <div className="space-y-3">
                {jobs.slice(0, 10).map((job) => (
                  <div key={job.id} className="flex items-center justify-between border-b pb-3">
                    <div className="flex items-center gap-3">
                      {getJobStatusIcon(job.status)}
                      <div>
                        <p className="font-medium">{job.job_type}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(job.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      {job.status === 'completed' && (
                        <>
                          <p className="text-green-600">
                            ✓ {job.records_imported || 0} imported
                          </p>
                          {job.records_failed && job.records_failed > 0 && (
                            <p className="text-red-600">
                              ✗ {job.records_failed} failed
                            </p>
                          )}
                        </>
                      )}
                      {job.status === 'failed' && job.error_message && (
                        <p className="text-red-600 text-xs">{job.error_message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}

