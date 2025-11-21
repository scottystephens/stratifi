'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTenant } from '@/lib/tenant-context';
import { Navigation } from '@/components/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, RefreshCw, Trash2, CheckCircle2, AlertCircle, Clock, Building2, CreditCard, TrendingUp, Activity, Zap, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useConnection, useSyncConnection, useDeleteConnection } from '@/lib/hooks/use-connections';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { useQueryClient } from '@tanstack/react-query';

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
  // New metadata fields
  total_accounts?: number;
  active_accounts?: number;
  total_transactions?: number;
  last_transaction_date?: string | null;
  last_successful_sync_at?: string | null;
  consecutive_failures?: number;
  sync_health_score?: number;
  sync_summary?: {
    accounts_synced?: number;
    accounts_created?: number;
    accounts_updated?: number;
    transactions_synced?: number;
    sync_duration_ms?: number;
    errors?: string[];
    warnings?: string[];
  };
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
  const searchParams = useSearchParams();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [token, setToken] = useState<ProviderToken | null>(null);
  const [accounts, setAccounts] = useState<ProviderAccount[]>([]);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncJobId, setSyncJobId] = useState<string | null>(null);

  const connectionId = params.id as string;
  const syncingParam = searchParams.get('syncing') === 'true';
  const jobIdParam = searchParams.get('jobId');

  // Use React Query for connection data and accounts
  const { data: connection, isLoading: loading } = useConnection(currentTenant?.id, connectionId);
  const { data: tenantAccounts = [] } = useAccounts(currentTenant?.id);
  const syncMutation = useSyncConnection();
  const deleteMutation = useDeleteConnection();

  // Initialize sync polling if redirected from OAuth
  useEffect(() => {
    if (syncingParam && jobIdParam) {
      setIsSyncing(true);
      setSyncJobId(jobIdParam);
      toast.info('Syncing your bank data', {
        description: 'Please wait while we fetch your accounts and transactions. This may take a few moments.',
        duration: 10000
      });
      // Remove syncing param from URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('syncing');
      newUrl.searchParams.delete('jobId');
      router.replace(newUrl.pathname + newUrl.search, { scroll: false });
    }
  }, [syncingParam, jobIdParam, router]);

  // Poll for sync completion when syncing and refresh data
  useEffect(() => {
    if (!isSyncing || !syncJobId || !currentTenant) return;

    const pollInterval = setInterval(async () => {
      try {
        // Check job status
        const jobResponse = await fetch(`/api/connections/jobs?connectionId=${connectionId}&tenantId=${currentTenant.id}&jobId=${syncJobId}`);
        const jobData = await jobResponse.json();
        
        if (jobData.success && jobData.jobs?.length > 0) {
          const job = jobData.jobs[0];
          
          // Check if job is complete
          if (job.status === 'completed' || job.status === 'completed_with_errors' || job.status === 'failed') {
            setIsSyncing(false);
            clearInterval(pollInterval);
            
            // Invalidate all related queries to refresh UI
            queryClient.invalidateQueries({ queryKey: ['accounts', 'list', currentTenant.id] });
            queryClient.invalidateQueries({ queryKey: ['connections', 'detail', currentTenant.id, connectionId] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            
            // Refetch immediately to update UI
            queryClient.refetchQueries({ queryKey: ['accounts', 'list', currentTenant.id] });
            queryClient.refetchQueries({ queryKey: ['connections', 'detail', currentTenant.id, connectionId] });
            
            // Refresh provider accounts and jobs
            fetch(`/api/banking/accounts?connectionId=${connectionId}&tenantId=${currentTenant.id}`)
              .then(res => res.json())
              .then(data => {
                if (data.success) {
                  setAccounts(data.accounts || []);
                }
              })
              .catch(console.error);
            
            fetch(`/api/connections/jobs?connectionId=${connectionId}&tenantId=${currentTenant.id}`)
              .then(res => res.json())
              .then(data => {
                if (data.success) {
                  setJobs(data.jobs || []);
                }
              })
              .catch(console.error);
            
            // Show success message
            const accountsCount = job.summary?.accounts_synced || 0;
            const transactionsCount = job.summary?.transactions_synced || 0;
            toast.success('Sync complete!', {
              description: `${accountsCount} accounts synced, ${transactionsCount} transactions imported`,
            });
          } else {
            // Job still running - refresh accounts and connection data to show progress
            queryClient.refetchQueries({ queryKey: ['accounts', 'list', currentTenant.id] });
            queryClient.refetchQueries({ queryKey: ['connections', 'detail', currentTenant.id, connectionId] });
          }
        }
      } catch (error) {
        console.error('Error polling sync status:', error);
      }
    }, 2000); // Poll every 2 seconds

    // Cleanup after 5 minutes (max sync time)
    const timeout = setTimeout(() => {
      setIsSyncing(false);
      clearInterval(pollInterval);
      toast.warning('Sync is taking longer than expected', {
        description: 'You can check the sync status manually',
      });
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [isSyncing, syncJobId, connectionId, currentTenant, queryClient]);

  // Load additional data (token, provider accounts, jobs) - these can be cached separately
  useEffect(() => {
    if (!currentTenant || !connectionId) return;

    // Load provider token
    fetch(`/api/banking/tokens?connectionId=${connectionId}&tenantId=${currentTenant.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.token) {
          setToken(data.token);
        }
      })
      .catch(console.error);

    // Load provider accounts (from provider_accounts table)
    fetch(`/api/banking/accounts?connectionId=${connectionId}&tenantId=${currentTenant.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setAccounts(data.accounts || []);
        }
      })
      .catch(console.error);

    // Load ingestion jobs
    fetch(`/api/connections/jobs?connectionId=${connectionId}&tenantId=${currentTenant.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setJobs(data.jobs || []);
        }
      })
      .catch(console.error);
  }, [currentTenant, connectionId]);

  // Filter accounts for this connection
  const connectionAccounts = tenantAccounts.filter(acc => acc.connection_id === connectionId);

  async function handleSync() {
    if (!currentTenant || !connection || !connection.provider) return;

    syncMutation.mutate({
      provider: connection.provider,
      connectionId: connection.id,
      tenantId: currentTenant.id,
      forceSync: true,
    });
  }

  async function handleDelete() {
    if (!currentTenant || !connection) return;
    if (!confirm('Are you sure you want to delete this connection?')) return;

    deleteMutation.mutate({
      connectionId: connection.id,
      tenantId: currentTenant.id,
    }, {
      onSuccess: () => {
        router.push('/connections');
      },
    });
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

  function getHealthStatus(score: number | undefined): {
    label: string;
    color: string;
    bgColor: string;
    icon: React.ReactNode;
  } {
    if (score === undefined || score === null) {
      return {
        label: 'Unknown',
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        icon: <Activity className="h-5 w-5 text-gray-600" />,
      };
    }

    if (score >= 0.9) {
      return {
        label: 'Excellent',
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        icon: <CheckCircle2 className="h-5 w-5 text-green-600" />,
      };
    } else if (score >= 0.75) {
      return {
        label: 'Good',
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        icon: <Zap className="h-5 w-5 text-blue-600" />,
      };
    } else if (score >= 0.5) {
      return {
        label: 'Fair',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        icon: <AlertTriangle className="h-5 w-5 text-yellow-600" />,
      };
    } else {
      return {
        label: 'Poor',
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        icon: <AlertCircle className="h-5 w-5 text-red-600" />,
      };
    }
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
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
        <div className="p-8">
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
                  <Button onClick={handleSync} disabled={syncMutation.isPending}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                    Sync Now
                  </Button>
                )}
                <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          </div>

          {/* Connection Overview */}
          <div className="grid gap-6 md:grid-cols-4 mb-6">
            {/* Health Score Card */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${getHealthStatus(connection.sync_health_score).bgColor}`}>
                  {getHealthStatus(connection.sync_health_score).icon}
                </div>
                <h3 className="font-semibold">Health</h3>
              </div>
              <div className="space-y-2">
                <p className={`text-2xl font-bold ${getHealthStatus(connection.sync_health_score).color}`}>
                  {connection.sync_health_score !== undefined 
                    ? `${(connection.sync_health_score * 100).toFixed(0)}%`
                    : 'N/A'}
                </p>
                <Badge className={getHealthStatus(connection.sync_health_score).bgColor + ' ' + getHealthStatus(connection.sync_health_score).color}>
                  {getHealthStatus(connection.sync_health_score).label}
                </Badge>
                {connection.consecutive_failures !== undefined && connection.consecutive_failures > 0 && (
                  <p className="text-xs text-red-600 mt-1">
                    {connection.consecutive_failures} consecutive failures
                  </p>
                )}
              </div>
            </Card>

            {/* Status Card */}
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
                <p className="text-xs text-red-600 mt-2 line-clamp-2">{connection.last_error}</p>
              )}
            </Card>

            {/* Accounts Card */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CreditCard className="h-5 w-5 text-green-600" />
                </div>
                <h3 className="font-semibold">Accounts</h3>
              </div>
              <div className="space-y-1">
                <p className="text-3xl font-bold">
                  {isSyncing ? (
                    <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
                  ) : (
                    connection.total_accounts || connectionAccounts.length
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isSyncing ? (
                    'Syncing accounts...'
                  ) : (
                    `${connection.active_accounts || connectionAccounts.filter(a => a.account_status === 'active').length} active`
                  )}
                </p>
              </div>
            </Card>

            {/* Transactions Card */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <h3 className="font-semibold">Transactions</h3>
              </div>
              <div className="space-y-1">
                <p className="text-3xl font-bold">
                  {connection.total_transactions !== undefined 
                    ? connection.total_transactions.toLocaleString()
                    : '0'}
                </p>
                {connection.last_transaction_date && (
                  <p className="text-xs text-muted-foreground">
                    Latest: {new Date(connection.last_transaction_date).toLocaleDateString()}
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Sync Summary Card */}
          {connection.sync_summary && (
            <Card className="p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Last Sync Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Accounts Synced</p>
                  <p className="text-2xl font-bold">{connection.sync_summary.accounts_synced || 0}</p>
                  {connection.sync_summary.accounts_created !== undefined && (
                    <p className="text-xs text-green-600">+{connection.sync_summary.accounts_created} new</p>
                  )}
                </div>
                {connection.sync_summary.transactions_synced !== undefined && (
                  <div>
                    <p className="text-sm text-muted-foreground">Transactions</p>
                    <p className="text-2xl font-bold">{connection.sync_summary.transactions_synced.toLocaleString()}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="text-2xl font-bold">
                    {connection.sync_summary.sync_duration_ms 
                      ? formatDuration(connection.sync_summary.sync_duration_ms)
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Sync</p>
                  <p className="text-sm font-medium">
                    {connection.last_sync_at
                      ? new Date(connection.last_sync_at).toLocaleString()
                      : 'Never'}
                  </p>
                  {connection.last_successful_sync_at && (
                    <p className="text-xs text-green-600">
                      ✓ {new Date(connection.last_successful_sync_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              {connection.sync_summary.errors && connection.sync_summary.errors.length > 0 && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-semibold text-red-800 mb-2">Errors:</p>
                  <ul className="text-sm text-red-700 space-y-1">
                    {connection.sync_summary.errors.map((error: string, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>{error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {connection.sync_summary.warnings && connection.sync_summary.warnings.length > 0 && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm font-semibold text-yellow-800 mb-2">Warnings:</p>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    {connection.sync_summary.warnings.map((warning: string, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Connected Accounts</h2>
              {isSyncing && (
                <Badge variant="outline" className="flex items-center gap-2">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Syncing...
                </Badge>
              )}
            </div>
            {isSyncing && connectionAccounts.length === 0 ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-muted-foreground">Syncing accounts and transactions...</p>
                <p className="text-sm text-muted-foreground mt-1">This may take a few moments</p>
              </div>
            ) : connectionAccounts.length === 0 && accounts.length === 0 ? (
              <p className="text-muted-foreground">No accounts synced yet. Click &quot;Sync Now&quot; to fetch accounts.</p>
            ) : (
              <div className="space-y-4">
                {(connectionAccounts.length > 0 ? connectionAccounts : accounts).map((account: any) => {
                  // Handle both account types (from accounts table or provider_accounts)
                  const accountName = account.account_name || account.name;
                  const accountType = account.account_type || account.type;
                  const balance = account.current_balance ?? account.balance ?? 0;
                  const currency = account.currency || 'EUR';
                  const status = account.account_status || account.status || 'active';
                  
                  // Get the account ID for linking
                  const accountLinkId = account.id || account.account_id;
                  const hasLink = !!accountLinkId;
                  
                  return (
                  <Link 
                    key={account.id || account.account_id}
                    href={hasLink ? `/accounts/${accountLinkId}` : '#'}
                    className={`border rounded-lg p-4 block transition-all ${hasLink ? 'hover:shadow-md hover:border-blue-300' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2">
                          {accountName}
                          {hasLink && <ArrowLeft className="h-3 w-3 rotate-180 text-blue-600" />}
                        </h3>
                        <p className="text-sm text-muted-foreground">{accountType}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold">
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: currency,
                          }).format(balance)}
                        </p>
                        <Badge className={getStatusColor(status)} variant="outline">
                          {status}
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
                      {account.external_account_id && (
                        <div>
                          <span className="text-muted-foreground">External ID:</span> {account.external_account_id}
                        </div>
                      )}
                      {account.last_synced_at && (
                        <div>
                          <span className="text-muted-foreground">Last Synced:</span>{' '}
                          {new Date(account.last_synced_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </Link>
                  );
                })}
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

