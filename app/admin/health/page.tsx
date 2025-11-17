'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Heart,
  Database,
  Cloud,
  Activity,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';

interface HealthData {
  connections: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
  };
  jobs: {
    total24h: number;
    failed24h: number;
    errorRate24h: number;
  };
  statements: {
    totalAccounts: number;
    withRecentStatements: number;
    missingStatements: number;
    coveragePercent: number;
  };
  timestamp: string;
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHealth();
    // Refresh every 30 seconds
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadHealth() {
    try {
      const res = await fetch('/api/admin/health');
      const data = await res.json();
      if (data.success) {
        setHealth(data.health);
      }
    } catch (error) {
      console.error('Error loading health:', error);
    } finally {
      setLoading(false);
    }
  }

  const getOverallHealth = () => {
    if (!health) return 'unknown';
    
    const criticalRatio = health.connections.critical / health.connections.total;
    const errorRate = health.jobs.errorRate24h;

    if (criticalRatio > 0.2 || errorRate > 20) return 'critical';
    if (criticalRatio > 0.1 || errorRate > 10) return 'warning';
    return 'healthy';
  };

  const healthStatus = getOverallHealth();

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            System Health
          </h1>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">System Health</h1>
            <p className="text-gray-600 mt-2">
              Monitor platform health and performance
            </p>
          </div>
          <button
            onClick={loadHealth}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>

        {/* Overall Health Status */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div
                className={`p-4 rounded-full ${
                  healthStatus === 'healthy'
                    ? 'bg-green-100'
                    : healthStatus === 'warning'
                      ? 'bg-amber-100'
                      : 'bg-red-100'
                }`}
              >
                <Heart
                  className={`h-8 w-8 ${
                    healthStatus === 'healthy'
                      ? 'text-green-600'
                      : healthStatus === 'warning'
                        ? 'text-amber-600'
                        : 'text-red-600'
                  }`}
                />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  System Status
                </h2>
                <Badge
                  className={
                    healthStatus === 'healthy'
                      ? 'bg-green-100 text-green-800'
                      : healthStatus === 'warning'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                  }
                >
                  {healthStatus.toUpperCase()}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Last checked</div>
              <div className="text-sm font-medium text-gray-900">
                {health?.timestamp
                  ? new Date(health.timestamp).toLocaleTimeString()
                  : 'N/A'}
              </div>
            </div>
          </div>
        </Card>

        {/* Health Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Database */}
          <Card className="p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Database className="h-6 w-6 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Database</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Connection</span>
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <Badge className="bg-green-100 text-green-800">
                  Operational
                </Badge>
              </div>
            </div>
          </Card>

          {/* Supabase */}
          <Card className="p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Cloud className="h-6 w-6 text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-900">Supabase</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">API</span>
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Auth</span>
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </Card>

          {/* Vercel */}
          <Card className="p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Activity className="h-6 w-6 text-black" />
              <h3 className="text-lg font-semibold text-gray-900">Vercel</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Deployment</span>
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Edge Functions</span>
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </Card>

          {/* Statements */}
          <Card className="p-6">
            <div className="flex items-center space-x-3 mb-4">
              <AlertTriangle
                className={`h-6 w-6 ${
                  (health?.statements?.coveragePercent || 0) >= 80
                    ? 'text-green-600'
                    : 'text-amber-600'
                }`}
              />
              <h3 className="text-lg font-semibold text-gray-900">Statements</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Coverage</span>
                <span className="text-2xl font-bold text-gray-900">
                  {health?.statements?.coveragePercent ?? 0}%
                </span>
              </div>
              <p className="text-sm text-gray-600">
                {health?.statements?.missingStatements ?? 0} account(s) missing recent statements
              </p>
            </div>
          </Card>
        </div>

        {/* Connection Health */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Connection Health
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900">
                {health?.connections.total || 0}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {health?.connections.healthy || 0}
              </div>
              <div className="text-sm text-gray-600 mt-1">Healthy</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-amber-600">
                {health?.connections.warning || 0}
              </div>
              <div className="text-sm text-gray-600 mt-1">Warning</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">
                {health?.connections.critical || 0}
              </div>
              <div className="text-sm text-gray-600 mt-1">Critical</div>
            </div>
          </div>
        </Card>

        {/* Job Statistics */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Sync Jobs (Last 24 Hours)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900">
                {health?.jobs.total24h || 0}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Jobs</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">
                {health?.jobs.failed24h || 0}
              </div>
              <div className="text-sm text-gray-600 mt-1">Failed Jobs</div>
            </div>
            <div className="text-center">
              <div
                className={`text-3xl font-bold ${
                  (health?.jobs.errorRate24h || 0) < 5
                    ? 'text-green-600'
                    : (health?.jobs.errorRate24h || 0) < 10
                      ? 'text-amber-600'
                      : 'text-red-600'
                }`}
              >
                {health?.jobs.errorRate24h || 0}%
              </div>
              <div className="text-sm text-gray-600 mt-1">Error Rate</div>
            </div>
          </div>
        </Card>

        {/* Alerts */}
        {health?.connections.critical && health.connections.critical > 0 && (
          <Card className="p-6 border-red-200 bg-red-50">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-6 w-6 text-red-600 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-red-900">
                  Critical Alert
                </h3>
                <p className="text-sm text-red-700 mt-1">
                  {health.connections.critical} connection(s) require immediate
                  attention. Check the Connections page for details.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

