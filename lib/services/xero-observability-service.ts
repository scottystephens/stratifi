/**
 * Xero Observability Service
 *
 * Provides comprehensive logging, metrics, and observability for Xero integration.
 * Tracks API calls, sync performance, errors, and health metrics.
 */

import { supabase } from '@/lib/supabase';

// =====================================================
// Types
// =====================================================

export interface XeroApiCallLog {
  connectionId: string;
  tenantId: string;
  xeroTenantId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  duration: number;
  requestSize?: number;
  responseSize?: number;
  error?: string;
  rateLimitRemaining?: number;
  timestamp: Date;
}

export interface XeroSyncMetrics {
  connectionId: string;
  syncId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  accountsFetched: number;
  accountsCreated: number;
  accountsUpdated: number;
  transactionsFetched: number;
  transactionsCreated: number;
  transactionsUpdated: number;
  apiCallsCount: number;
  errors: string[];
  warnings: string[];
  status: 'in_progress' | 'completed' | 'failed' | 'partial';
}

export interface XeroErrorLog {
  connectionId: string;
  tenantId: string;
  errorType: 'api_error' | 'auth_error' | 'rate_limit' | 'validation' | 'unknown';
  errorCode?: string;
  errorMessage: string;
  context: Record<string, any>;
  timestamp: Date;
  resolved: boolean;
}

export interface XeroPerformanceMetrics {
  connectionId: string;
  period: 'hour' | 'day' | 'week';
  apiCallsTotal: number;
  apiCallsSuccessful: number;
  apiCallsFailed: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  syncCount: number;
  syncSuccessRate: number;
  dataVolume: {
    accountsSynced: number;
    transactionsSynced: number;
  };
}

// =====================================================
// Logger Class
// =====================================================

class XeroLogger {
  private connectionId: string | null = null;
  private syncId: string | null = null;
  private logs: Array<{ level: string; message: string; data?: any; timestamp: Date }> = [];

  /**
   * Set context for logging
   */
  setContext(connectionId: string, syncId?: string): void {
    this.connectionId = connectionId;
    this.syncId = syncId || null;
  }

  /**
   * Clear context
   */
  clearContext(): void {
    this.connectionId = null;
    this.syncId = null;
    this.logs = [];
  }

  /**
   * Log info message
   */
  info(message: string, data?: Record<string, any>): void {
    this.log('info', message, data);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: Record<string, any>): void {
    this.log('warn', message, data);
  }

  /**
   * Log error message
   */
  error(message: string, data?: Record<string, any>): void {
    this.log('error', message, data);
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: Record<string, any>): void {
    if (process.env.NODE_ENV === 'development' || process.env.XERO_DEBUG === 'true') {
      this.log('debug', message, data);
    }
  }

  /**
   * Internal log method
   */
  private log(level: string, message: string, data?: Record<string, any>): void {
    const timestamp = new Date();
    const prefix = this.syncId
      ? `[Xero:${this.connectionId?.slice(0, 8)}:${this.syncId.slice(0, 8)}]`
      : this.connectionId
      ? `[Xero:${this.connectionId.slice(0, 8)}]`
      : '[Xero]';

    const logEntry = {
      level,
      message,
      data,
      timestamp,
    };

    this.logs.push(logEntry);

    // Console output with formatting
    const formattedMessage = `${prefix} ${message}`;
    switch (level) {
      case 'error':
        console.error(formattedMessage, data || '');
        break;
      case 'warn':
        console.warn(formattedMessage, data || '');
        break;
      case 'debug':
        console.debug(formattedMessage, data || '');
        break;
      default:
        console.log(formattedMessage, data || '');
    }
  }

  /**
   * Get all logs for this session
   */
  getLogs(): typeof this.logs {
    return [...this.logs];
  }
}

// Singleton logger instance
export const xeroLogger = new XeroLogger();

// =====================================================
// API Call Tracking
// =====================================================

/**
 * Track an API call to Xero
 */
export async function trackApiCall(log: XeroApiCallLog): Promise<void> {
  try {
    await supabase.from('xero_api_logs').insert({
      connection_id: log.connectionId,
      tenant_id: log.tenantId,
      xero_tenant_id: log.xeroTenantId,
      endpoint: log.endpoint,
      method: log.method,
      status_code: log.statusCode,
      duration_ms: log.duration,
      request_size: log.requestSize,
      response_size: log.responseSize,
      error_message: log.error,
      rate_limit_remaining: log.rateLimitRemaining,
      created_at: log.timestamp.toISOString(),
    });
  } catch (error) {
    // Non-critical - log and continue
    console.warn('[XeroObservability] Failed to track API call:', error);
  }
}

/**
 * Create a timer for tracking operation duration
 */
export function createTimer(): { stop: () => number } {
  const startTime = Date.now();
  return {
    stop: () => Date.now() - startTime,
  };
}

// =====================================================
// Sync Metrics Tracking
// =====================================================

/**
 * Start tracking a sync operation
 */
export async function startSyncTracking(
  connectionId: string,
  tenantId: string
): Promise<string> {
  const syncId = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    await supabase.from('xero_sync_metrics').insert({
      id: syncId,
      connection_id: connectionId,
      tenant_id: tenantId,
      start_time: new Date().toISOString(),
      status: 'in_progress',
      accounts_fetched: 0,
      accounts_created: 0,
      accounts_updated: 0,
      transactions_fetched: 0,
      transactions_created: 0,
      transactions_updated: 0,
      api_calls_count: 0,
      errors: [],
      warnings: [],
    });
  } catch (error) {
    console.warn('[XeroObservability] Failed to start sync tracking:', error);
  }

  xeroLogger.setContext(connectionId, syncId);
  xeroLogger.info('Sync started');

  return syncId;
}

/**
 * Update sync metrics during operation
 */
export async function updateSyncMetrics(
  syncId: string,
  updates: Partial<{
    accountsFetched: number;
    accountsCreated: number;
    accountsUpdated: number;
    transactionsFetched: number;
    transactionsCreated: number;
    transactionsUpdated: number;
    apiCallsCount: number;
    errors: string[];
    warnings: string[];
  }>
): Promise<void> {
  try {
    const updateData: Record<string, any> = {};

    if (updates.accountsFetched !== undefined) updateData.accounts_fetched = updates.accountsFetched;
    if (updates.accountsCreated !== undefined) updateData.accounts_created = updates.accountsCreated;
    if (updates.accountsUpdated !== undefined) updateData.accounts_updated = updates.accountsUpdated;
    if (updates.transactionsFetched !== undefined) updateData.transactions_fetched = updates.transactionsFetched;
    if (updates.transactionsCreated !== undefined) updateData.transactions_created = updates.transactionsCreated;
    if (updates.transactionsUpdated !== undefined) updateData.transactions_updated = updates.transactionsUpdated;
    if (updates.apiCallsCount !== undefined) updateData.api_calls_count = updates.apiCallsCount;
    if (updates.errors !== undefined) updateData.errors = updates.errors;
    if (updates.warnings !== undefined) updateData.warnings = updates.warnings;

    await supabase.from('xero_sync_metrics').update(updateData).eq('id', syncId);
  } catch (error) {
    console.warn('[XeroObservability] Failed to update sync metrics:', error);
  }
}

/**
 * Complete sync tracking
 */
export async function completeSyncTracking(
  syncId: string,
  status: 'completed' | 'failed' | 'partial',
  finalMetrics?: Partial<XeroSyncMetrics>
): Promise<void> {
  try {
    const updateData: Record<string, any> = {
      end_time: new Date().toISOString(),
      status,
    };

    if (finalMetrics) {
      if (finalMetrics.accountsFetched !== undefined) updateData.accounts_fetched = finalMetrics.accountsFetched;
      if (finalMetrics.transactionsFetched !== undefined) updateData.transactions_fetched = finalMetrics.transactionsFetched;
      if (finalMetrics.errors !== undefined) updateData.errors = finalMetrics.errors;
    }

    await supabase.from('xero_sync_metrics').update(updateData).eq('id', syncId);

    xeroLogger.info(`Sync ${status}`, finalMetrics);
    xeroLogger.clearContext();
  } catch (error) {
    console.warn('[XeroObservability] Failed to complete sync tracking:', error);
  }
}

// =====================================================
// Error Tracking
// =====================================================

/**
 * Log a Xero error
 */
export async function logXeroError(error: Omit<XeroErrorLog, 'timestamp' | 'resolved'>): Promise<void> {
  try {
    await supabase.from('xero_error_logs').insert({
      connection_id: error.connectionId,
      tenant_id: error.tenantId,
      error_type: error.errorType,
      error_code: error.errorCode,
      error_message: error.errorMessage,
      context: error.context,
      created_at: new Date().toISOString(),
      resolved: false,
    });

    xeroLogger.error(error.errorMessage, {
      type: error.errorType,
      code: error.errorCode,
      context: error.context,
    });
  } catch (logError) {
    console.error('[XeroObservability] Failed to log error:', logError);
  }
}

/**
 * Get recent errors for a connection
 */
export async function getRecentErrors(
  connectionId: string,
  limit: number = 10
): Promise<XeroErrorLog[]> {
  const { data, error } = await supabase
    .from('xero_error_logs')
    .select('*')
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[XeroObservability] Failed to get recent errors:', error);
    return [];
  }

  return (data || []).map((row) => ({
    connectionId: row.connection_id,
    tenantId: row.tenant_id,
    errorType: row.error_type,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    context: row.context,
    timestamp: new Date(row.created_at),
    resolved: row.resolved,
  }));
}

// =====================================================
// Performance Metrics
// =====================================================

/**
 * Get performance metrics for a connection
 */
export async function getPerformanceMetrics(
  connectionId: string,
  period: 'hour' | 'day' | 'week' = 'day'
): Promise<XeroPerformanceMetrics | null> {
  const periodMap = {
    hour: '1 hour',
    day: '24 hours',
    week: '7 days',
  };

  try {
    // Get API call stats
    const { data: apiStats } = await supabase
      .from('xero_api_logs')
      .select('status_code, duration_ms')
      .eq('connection_id', connectionId)
      .gte('created_at', `now() - interval '${periodMap[period]}'`);

    // Get sync stats
    const { data: syncStats } = await supabase
      .from('xero_sync_metrics')
      .select('status, accounts_fetched, transactions_fetched')
      .eq('connection_id', connectionId)
      .gte('start_time', `now() - interval '${periodMap[period]}'`);

    if (!apiStats || !syncStats) {
      return null;
    }

    const successfulCalls = apiStats.filter((c) => c.status_code >= 200 && c.status_code < 300);
    const latencies = apiStats.map((c) => c.duration_ms).sort((a, b) => a - b);

    const successfulSyncs = syncStats.filter((s) => s.status === 'completed');

    return {
      connectionId,
      period,
      apiCallsTotal: apiStats.length,
      apiCallsSuccessful: successfulCalls.length,
      apiCallsFailed: apiStats.length - successfulCalls.length,
      averageLatency: latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0,
      p95Latency: latencies.length > 0
        ? latencies[Math.floor(latencies.length * 0.95)] || latencies[latencies.length - 1]
        : 0,
      p99Latency: latencies.length > 0
        ? latencies[Math.floor(latencies.length * 0.99)] || latencies[latencies.length - 1]
        : 0,
      syncCount: syncStats.length,
      syncSuccessRate: syncStats.length > 0 ? successfulSyncs.length / syncStats.length : 1,
      dataVolume: {
        accountsSynced: syncStats.reduce((sum, s) => sum + (s.accounts_fetched || 0), 0),
        transactionsSynced: syncStats.reduce((sum, s) => sum + (s.transactions_fetched || 0), 0),
      },
    };
  } catch (error) {
    console.error('[XeroObservability] Failed to get performance metrics:', error);
    return null;
  }
}

// =====================================================
// Dashboard Data
// =====================================================

/**
 * Get comprehensive observability data for dashboard
 */
export async function getXeroObservabilityDashboard(connectionId: string): Promise<{
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastSync: Date | null;
    syncSuccessRate: number;
    apiErrorRate: number;
  };
  recentActivity: {
    syncs: number;
    apiCalls: number;
    errors: number;
  };
  performance: XeroPerformanceMetrics | null;
  recentErrors: XeroErrorLog[];
}> {
  const [performance, recentErrors] = await Promise.all([
    getPerformanceMetrics(connectionId, 'day'),
    getRecentErrors(connectionId, 5),
  ]);

  // Get last sync time
  const { data: lastSync } = await supabase
    .from('xero_sync_metrics')
    .select('end_time, status')
    .eq('connection_id', connectionId)
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Calculate health status
  const syncSuccessRate = performance?.syncSuccessRate || 1;
  const apiErrorRate = performance
    ? performance.apiCallsFailed / Math.max(performance.apiCallsTotal, 1)
    : 0;

  let healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (syncSuccessRate < 0.5 || apiErrorRate > 0.3) {
    healthStatus = 'unhealthy';
  } else if (syncSuccessRate < 0.9 || apiErrorRate > 0.1) {
    healthStatus = 'degraded';
  }

  return {
    health: {
      status: healthStatus,
      lastSync: lastSync?.end_time ? new Date(lastSync.end_time) : null,
      syncSuccessRate,
      apiErrorRate,
    },
    recentActivity: {
      syncs: performance?.syncCount || 0,
      apiCalls: performance?.apiCallsTotal || 0,
      errors: recentErrors.length,
    },
    performance,
    recentErrors,
  };
}

