'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/lib/tenant-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Database, Trash2, Calendar } from 'lucide-react';

interface Connection {
  id: string;
  name: string;
  connection_type: string;
  status: string;
  account_id: string;
  import_mode: string;
  last_sync_at: string | null;
  created_at: string;
}

export default function ConnectionsPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (currentTenant) {
      loadConnections();
    }
  }, [currentTenant]);

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

  function getConnectionIcon(type: string) {
    switch (type) {
      case 'csv':
        return <FileText className="h-5 w-5" />;
      case 'bai2':
        return <Database className="h-5 w-5" />;
      default:
        return <Database className="h-5 w-5" />;
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

  if (!currentTenant) {
    return (
      <div className="p-8">
        <p>Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Navigation would go here - reuse your existing nav component */}
      
      <main className="flex-1 overflow-y-auto bg-background p-8">
        <div className="max-w-6xl mx-auto">
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
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {connections.map((connection) => (
                <Card key={connection.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        {getConnectionIcon(connection.connection_type)}
                      </div>
                      <div>
                        <h3 className="font-semibold">{connection.name}</h3>
                        <p className="text-sm text-muted-foreground uppercase">
                          {connection.connection_type}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(connection.id)}
                      disabled={deleting === connection.id}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge className={getStatusColor(connection.status)}>
                        {connection.status}
                      </Badge>
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

