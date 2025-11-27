'use client';

import { useEffect, useState } from 'react';
import { SystemMetricCard } from '@/components/admin/SystemMetricCard';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  Link as LinkIcon,
  Activity,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';

interface SystemStats {
  total_tenants: number;
  total_users: number;
  total_connections: number;
  active_connections: number;
  total_accounts: number;
  total_transactions: number;
  sync_jobs_24h: number;
  failed_jobs_24h: number;
  error_rate_24h: number;
}

interface RecentJob {
  id: string;
  created_at: string;
  status: string;
  job_type: string;
  records_imported: number;
  connection_id: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // Load system stats
      const statsRes = await fetch('/api/admin/stats');
      const statsData = await statsRes.json();
      if (statsData.success) {
        setStats(statsData.stats);
      }

      // Load recent jobs
      const logsRes = await fetch('/api/admin/logs?limit=50');
      const logsData = await logsRes.json();
      if (logsData.success) {
        setRecentJobs(logsData.logs);
      }
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'running':
        return <Clock className="h-4 w-4 text-blue-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Dashboard</h1>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">System Overview</h1>
          <p className="text-gray-600 mt-2">
            Monitor and manage the Strategy platform
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <SystemMetricCard
            title="Total Tenants"
            value={stats?.total_tenants || 0}
            icon={Building2}
            color="blue"
          />
          <SystemMetricCard
            title="Active Connections"
            value={`${stats?.active_connections || 0} / ${stats?.total_connections || 0}`}
            icon={LinkIcon}
            color="green"
          />
          <SystemMetricCard
            title="Sync Jobs (24h)"
            value={stats?.sync_jobs_24h || 0}
            icon={Activity}
            color="purple"
          />
          <SystemMetricCard
            title="Error Rate"
            value={`${stats?.error_rate_24h || 0}%`}
            icon={AlertTriangle}
            color={
              (stats?.error_rate_24h || 0) > 10
                ? 'red'
                : (stats?.error_rate_24h || 0) > 5
                  ? 'amber'
                  : 'green'
            }
          />
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Total Users</h3>
            <p className="text-2xl font-bold text-gray-900">
              {stats?.total_users || 0}
            </p>
          </Card>
          <Card className="p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">
              Total Accounts
            </h3>
            <p className="text-2xl font-bold text-gray-900">
              {stats?.total_accounts || 0}
            </p>
          </Card>
          <Card className="p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">
              Total Transactions
            </h3>
            <p className="text-2xl font-bold text-gray-900">
              {stats?.total_transactions?.toLocaleString() || 0}
            </p>
          </Card>
        </div>

        {/* Recent Sync Activity */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              Recent Sync Activity
            </h2>
            <button
              onClick={loadData}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Refresh
            </button>
          </div>
          <Card>
            <div className="divide-y">
              {recentJobs.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No recent sync jobs
                </div>
              ) : (
                recentJobs.slice(0, 20).map((job) => (
                  <div
                    key={job.id}
                    className="p-4 flex items-center justify-between hover:bg-gray-50"
                  >
                    <div className="flex items-center space-x-4">
                      {getStatusIcon(job.status)}
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900">
                            {job.job_type}
                          </span>
                          <Badge className={getStatusColor(job.status)}>
                            {job.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(job.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {job.records_imported} records
                      </div>
                      <div className="text-xs text-gray-500 font-mono truncate max-w-[200px]">
                        {job.connection_id.substring(0, 8)}...
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

