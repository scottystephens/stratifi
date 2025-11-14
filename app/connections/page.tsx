'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/lib/tenant-context';
import { Navigation } from '@/components/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Database, Trash2, Calendar, Building2, RefreshCw } from 'lucide-react';

interface Connection {
  id: string;
  name: string;
  connection_type: string;
  status: string;
  account_id: string;
  import_mode: string;
  last_sync_at: string | null;
  created_at: string;
  data_type?: string;
  supports_transactions?: boolean;
  supports_statements?: boolean;
  last_error?: string | null;
}

export default function ConnectionsPage() {
  const router = useRouter();
  const { currentTenant, userTenants } = useTenant();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    // If no tenant at all, redirect to onboarding
    if (userTenants.length === 0 && !loading) {
      router.push('/onboarding');
      return;
    }

    // If we have tenants but none is selected, wait for tenant context to load
    if (currentTenant) {
      loadConnections();
    }
  }, [currentTenant, userTenants, router]);

  async function loadConnections() {
    if (!currentTenant) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/connections?tenantId=${currentTenant.id}`);
      const data = await response.json();

      if (data.success) {
        setConnections(data.connections);
      }
    } catch (error) {
      console.error('Error loading connections:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(connectionId: string) {
    if (!currentTenant) return;
    if (!confirm('Are you sure you want to delete this connection? This will not delete imported transactions.')) {
      return;
    }

    try {
      setDeleting(connectionId);
      const response = await fetch(
        `/api/connections?id=${connectionId}&tenantId=${currentTenant.id}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        setConnections(connections.filter((c) => c.id !== connectionId));
      } else {
        alert('Failed to delete connection');
      }
    } catch (error) {
      console.error('Error deleting connection:', error);
      alert('Failed to delete connection');
    } finally {
      setDeleting(null);
    }
  }

  async function handleSyncBunq(connectionId: string) {
    if (!currentTenant) return;
    
    try {
      setSyncing(connectionId);
      
      // First sync accounts
      const accountsResponse = await fetch('/api/connections/bunq/sync-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          tenantId: currentTenant.id,
        }),
      });
      
      const accountsData = await accountsResponse.json();
      
      if (!accountsData.success) {
        throw new Error(accountsData.error || 'Failed to sync accounts');
      }
      
      // Then sync transactions
      const transactionsResponse = await fetch('/api/connections/bunq/sync-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          tenantId: currentTenant.id,
          count: 200,
        }),
      });
      
      const transactionsData = await transactionsResponse.json();
      
      if (!transactionsData.success) {
        throw new Error(transactionsData.error || 'Failed to sync transactions');
      }
      
      // Reload connections to show updated sync time
      await loadConnections();
      
      alert(
        `Sync complete!\nAccounts: ${accountsData.accounts.length}\nTransactions: ${transactionsData.summary.imported} imported`
      );
    } catch (error) {
      console.error('Sync error:', error);
      alert(error instanceof Error ? error.message : 'Failed to sync with Bunq');
    } finally {
      setSyncing(null);
    }
  }

  function getConnectionIcon(type: string) {
    switch (type) {
      case 'csv':
        return <FileText className="h-5 w-5" />;
      case 'bai2':
        return <Database className="h-5 w-5" />;
      case 'bunq_oauth':
      case 'bunq':
        return <Building2 className="h-5 w-5 text-orange-600" />;
      default:
        return <Database className="h-5 w-5" />;
    }
  }
  
  function getConnectionColor(type: string) {
    switch (type) {
      case 'csv':
        return 'bg-blue-100';
      case 'bunq_oauth':
      case 'bunq':
        return 'bg-orange-100';
      default:
        return 'bg-blue-100';
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  function getDataTypeBadges(connection: Connection) {
    const badges = [];
    
    if (connection.supports_transactions) {
      badges.push({
        label: 'Transactions',
        color: 'bg-blue-100 text-blue-800',
        icon: '💰'
      });
    }
    
    if (connection.supports_statements) {
      badges.push({
        label: 'Statements',
        color: 'bg-purple-100 text-purple-800',
        icon: '📊'
      });
    }
    
    // Fallback if no specific flags set
    if (badges.length === 0) {
      if (connection.data_type === 'statements') {
        badges.push({
          label: 'Statements',
          color: 'bg-purple-100 text-purple-800',
          icon: '📊'
        });
      } else {
        badges.push({
          label: 'Transactions',
          color: 'bg-blue-100 text-blue-800',
          icon: '💰'
        });
      }
    }
    
    return badges;
  }

  if (!currentTenant) {
    return (
      <div className="flex h-screen">
        <main className="flex-1 overflow-y-auto bg-background p-8">
          <Card className="p-12 text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-4">No Organization Selected</h2>
            <p className="text-muted-foreground mb-6">
              {userTenants.length === 0
                ? "You don't have any organizations yet. Create one to get started."
                : "Please select an organization from the sidebar to view connections."}
            </p>
            {userTenants.length === 0 && (
              <Button onClick={() => router.push('/onboarding')}>
                Create Organization
              </Button>
            )}
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
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold">Data Connections</h1>
              <p className="text-muted-foreground mt-2">
                Manage your data import connections
              </p>
            </div>
            <Button
              onClick={() => router.push('/connections/new')}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              New Connection
            </Button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <p>Loading connections...</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && connections.length === 0 && (
            <Card className="p-12 text-center">
              <div className="flex justify-center mb-4">
                <Database className="h-16 w-16 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">No connections yet</h2>
              <p className="text-muted-foreground mb-6">
                Get started by creating your first data connection
              </p>
              <Button onClick={() => router.push('/connections/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Create Connection
              </Button>
            </Card>
          )}

          {/* Connections Grid */}
          {!loading && connections.length > 0 && (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {connections.map((connection) => (
                <Card key={connection.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 ${getConnectionColor(connection.connection_type)} rounded-lg`}>
                        {getConnectionIcon(connection.connection_type)}
                      </div>
                      <div>
                        <h3 className="font-semibold">{connection.name}</h3>
                        <p className="text-sm text-muted-foreground uppercase">
                          {connection.connection_type.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {(connection.connection_type === 'bunq_oauth' ||
                        connection.connection_type === 'bunq') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSyncBunq(connection.id)}
                          disabled={syncing === connection.id}
                          title="Sync now"
                        >
                          <RefreshCw
                            className={`h-4 w-4 text-blue-600 ${
                              syncing === connection.id ? 'animate-spin' : ''
                            }`}
                          />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(connection.id)}
                        disabled={deleting === connection.id}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge 
                        className={getStatusColor(connection.status)}
                        title={connection.status === 'error' && connection.last_error ? connection.last_error : undefined}
                      >
                        {connection.status}
                      </Badge>
                    </div>

                    {/* Show error message if exists */}
                    {connection.status === 'error' && connection.last_error && (
                      <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                        <strong>Error:</strong> {connection.last_error}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Data Type</span>
                      <div className="flex gap-1">
                        {getDataTypeBadges(connection).map((badge, idx) => (
                          <Badge key={idx} className={`${badge.color} text-xs`}>
                            {badge.icon} {badge.label}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Import Mode</span>
                      <span className="text-sm font-medium capitalize">
                        {connection.import_mode}
                      </span>
                    </div>

                    {connection.last_sync_at && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        Last sync: {new Date(connection.last_sync_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/connections/${connection.id}`)}
                      className="flex-1"
                    >
                      View Details
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/connections/${connection.id}/history`)}
                      className="flex-1"
                    >
                      History
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

