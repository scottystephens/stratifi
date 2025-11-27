/**
 * Xero Connection Health Service
 *
 * Monitors Xero-specific health metrics including:
 * - API rate limit status
 * - OAuth token health
 * - Data freshness
 * - Sync history
 */

import { supabase } from '@/lib/supabase';
import { tokenRefreshService } from './token-refresh-service';

export interface XeroHealthMetrics {
  connectionId: string;
  tenantId: string;

  // Token health
  tokenStatus: 'valid' | 'expiring_soon' | 'expired' | 'missing';
  tokenExpiresAt: Date | null;
  timeUntilExpiry: number | null; // milliseconds

  // Rate limit status (tracked from API responses)
  rateLimitStatus: 'ok' | 'warning' | 'critical';
  rateLimitRemaining: number | null;
  rateLimitResetAt: Date | null;

  // Data freshness
  lastSyncAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  dataFreshnessStatus: 'fresh' | 'stale' | 'very_stale';
  hoursSinceLastSync: number | null;

  // Sync history
  last7DaysSyncs: number;
  last7DaysSuccesses: number;
  last7DaysFailures: number;
  successRate: number;

  // Overall health
  overallHealth: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  healthScore: number; // 0-100
  recommendations: string[];
}

export interface XeroRateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
}

/**
 * Get comprehensive health metrics for a Xero connection
 */
export async function getXeroHealthMetrics(
  connectionId: string
): Promise<XeroHealthMetrics | null> {
  try {
    // Get connection details
    const { data: connection, error: connError } = await supabase
      .from('connections')
      .select('*')
      .eq('id', connectionId)
      .eq('provider', 'xero')
      .single();

    if (connError || !connection) {
      console.error('Connection not found:', connError);
      return null;
    }

    // Get token status
    const tokenRecord = await tokenRefreshService.getTokenRecord(connectionId, 'xero');
    const tokenStatus = getTokenStatus(tokenRecord);
    const tokenExpiresAt = tokenRecord?.expires_at ? new Date(tokenRecord.expires_at) : null;
    const timeUntilExpiry = tokenRefreshService.getTimeUntilExpiry(tokenExpiresAt);

    // Get rate limit status from metadata (stored during API calls)
    const rateLimitInfo = getRateLimitFromMetadata(connection.sync_summary);

    // Calculate data freshness
    const lastSyncAt = connection.last_sync_at ? new Date(connection.last_sync_at) : null;
    const lastSuccessfulSyncAt = connection.last_successful_sync_at
      ? new Date(connection.last_successful_sync_at)
      : null;
    const hoursSinceLastSync = lastSyncAt
      ? (Date.now() - lastSyncAt.getTime()) / (1000 * 60 * 60)
      : null;
    const dataFreshnessStatus = getDataFreshnessStatus(hoursSinceLastSync);

    // Get sync history
    const syncHistory = await getSyncHistory(connectionId);

    // Calculate overall health
    const { healthScore, overallHealth, recommendations } = calculateOverallHealth({
      tokenStatus,
      rateLimitStatus: rateLimitInfo.status,
      dataFreshnessStatus,
      successRate: syncHistory.successRate,
      consecutiveFailures: connection.consecutive_failures || 0,
    });

    return {
      connectionId,
      tenantId: connection.tenant_id,
      tokenStatus,
      tokenExpiresAt,
      timeUntilExpiry,
      rateLimitStatus: rateLimitInfo.status,
      rateLimitRemaining: rateLimitInfo.remaining,
      rateLimitResetAt: rateLimitInfo.resetAt,
      lastSyncAt,
      lastSuccessfulSyncAt,
      dataFreshnessStatus,
      hoursSinceLastSync,
      last7DaysSyncs: syncHistory.totalSyncs,
      last7DaysSuccesses: syncHistory.successes,
      last7DaysFailures: syncHistory.failures,
      successRate: syncHistory.successRate,
      overallHealth,
      healthScore,
      recommendations,
    };
  } catch (error) {
    console.error('Error getting Xero health metrics:', error);
    return null;
  }
}

/**
 * Get token status from stored token record
 */
function getTokenStatus(
  tokenRecord: Awaited<ReturnType<typeof tokenRefreshService.getTokenRecord>>
): XeroHealthMetrics['tokenStatus'] {
  if (!tokenRecord) {
    return 'missing';
  }

  if (!tokenRecord.expires_at) {
    return 'valid'; // No expiration means it's valid
  }

  const expiresAt = new Date(tokenRecord.expires_at);
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

  if (expiresAt <= now) {
    return 'expired';
  } else if (expiresAt <= fiveMinutesFromNow) {
    return 'expiring_soon';
  } else if (expiresAt <= oneHourFromNow) {
    return 'expiring_soon';
  }

  return 'valid';
}

/**
 * Extract rate limit info from sync summary metadata
 */
function getRateLimitFromMetadata(syncSummary: any): {
  status: XeroHealthMetrics['rateLimitStatus'];
  remaining: number | null;
  resetAt: Date | null;
} {
  // Rate limits are stored in sync_summary from API responses
  const rateLimitRemaining = syncSummary?.xero_rate_limit_remaining;
  const rateLimitReset = syncSummary?.xero_rate_limit_reset;

  if (rateLimitRemaining === undefined || rateLimitRemaining === null) {
    return { status: 'ok', remaining: null, resetAt: null };
  }

  let status: XeroHealthMetrics['rateLimitStatus'] = 'ok';
  if (rateLimitRemaining < 10) {
    status = 'critical';
  } else if (rateLimitRemaining < 50) {
    status = 'warning';
  }

  return {
    status,
    remaining: rateLimitRemaining,
    resetAt: rateLimitReset ? new Date(rateLimitReset) : null,
  };
}

/**
 * Determine data freshness status based on hours since last sync
 */
function getDataFreshnessStatus(
  hoursSinceLastSync: number | null
): XeroHealthMetrics['dataFreshnessStatus'] {
  if (hoursSinceLastSync === null) {
    return 'very_stale'; // Never synced
  }

  if (hoursSinceLastSync <= 24) {
    return 'fresh';
  } else if (hoursSinceLastSync <= 72) {
    return 'stale';
  }

  return 'very_stale';
}

/**
 * Get sync history for the last 7 days
 */
async function getSyncHistory(connectionId: string): Promise<{
  totalSyncs: number;
  successes: number;
  failures: number;
  successRate: number;
}> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: jobs } = await supabase
    .from('ingestion_jobs')
    .select('status')
    .eq('connection_id', connectionId)
    .gte('created_at', sevenDaysAgo.toISOString());

  if (!jobs || jobs.length === 0) {
    return { totalSyncs: 0, successes: 0, failures: 0, successRate: 1.0 };
  }

  const totalSyncs = jobs.length;
  const successes = jobs.filter(
    (j) => j.status === 'completed' || j.status === 'completed_with_errors'
  ).length;
  const failures = jobs.filter((j) => j.status === 'failed').length;
  const successRate = totalSyncs > 0 ? successes / totalSyncs : 1.0;

  return { totalSyncs, successes, failures, successRate };
}

/**
 * Calculate overall health score and recommendations
 */
function calculateOverallHealth(params: {
  tokenStatus: XeroHealthMetrics['tokenStatus'];
  rateLimitStatus: XeroHealthMetrics['rateLimitStatus'];
  dataFreshnessStatus: XeroHealthMetrics['dataFreshnessStatus'];
  successRate: number;
  consecutiveFailures: number;
}): {
  healthScore: number;
  overallHealth: XeroHealthMetrics['overallHealth'];
  recommendations: string[];
} {
  const recommendations: string[] = [];
  let healthScore = 100;

  // Token health (30% weight)
  switch (params.tokenStatus) {
    case 'missing':
      healthScore -= 30;
      recommendations.push('Reconnect your Xero account - no valid token found.');
      break;
    case 'expired':
      healthScore -= 30;
      recommendations.push('Your Xero token has expired. Please reconnect.');
      break;
    case 'expiring_soon':
      healthScore -= 10;
      recommendations.push('Token expiring soon - will auto-refresh on next sync.');
      break;
  }

  // Rate limit health (20% weight)
  switch (params.rateLimitStatus) {
    case 'critical':
      healthScore -= 20;
      recommendations.push('API rate limit nearly exhausted. Reduce sync frequency.');
      break;
    case 'warning':
      healthScore -= 10;
      recommendations.push('API rate limit running low. Monitor usage.');
      break;
  }

  // Data freshness (20% weight)
  switch (params.dataFreshnessStatus) {
    case 'very_stale':
      healthScore -= 20;
      recommendations.push('Data is very stale. Run a sync to refresh.');
      break;
    case 'stale':
      healthScore -= 10;
      recommendations.push('Data is slightly stale. Consider syncing more frequently.');
      break;
  }

  // Success rate (30% weight)
  const successRateScore = params.successRate * 30;
  healthScore -= 30 - successRateScore;

  if (params.successRate < 0.5) {
    recommendations.push('Sync success rate is low. Check connection settings.');
  } else if (params.successRate < 0.8) {
    recommendations.push('Some syncs are failing. Review error logs.');
  }

  // Consecutive failures penalty
  if (params.consecutiveFailures >= 5) {
    healthScore -= 20;
    recommendations.push('Multiple consecutive failures. Immediate attention required.');
  } else if (params.consecutiveFailures >= 3) {
    healthScore -= 10;
    recommendations.push('Recent consecutive failures detected.');
  }

  // Ensure score is within bounds
  healthScore = Math.max(0, Math.min(100, healthScore));

  // Determine overall health status
  let overallHealth: XeroHealthMetrics['overallHealth'];
  if (healthScore >= 90) {
    overallHealth = 'excellent';
  } else if (healthScore >= 75) {
    overallHealth = 'good';
  } else if (healthScore >= 50) {
    overallHealth = 'fair';
  } else if (healthScore >= 25) {
    overallHealth = 'poor';
  } else {
    overallHealth = 'critical';
  }

  return { healthScore, overallHealth, recommendations };
}

/**
 * Store rate limit info from Xero API response headers
 * Call this after each Xero API request
 */
export async function updateXeroRateLimitInfo(
  connectionId: string,
  headers: Headers | Record<string, string>
): Promise<void> {
  try {
    // Xero rate limit headers
    // X-Rate-Limit-Problem: daily or minute
    // X-MinLimit-Remaining: remaining calls for minute window
    // X-DayLimit-Remaining: remaining calls for day window

    const getHeader = (name: string): string | null => {
      if (headers instanceof Headers) {
        return headers.get(name);
      }
      return headers[name] || headers[name.toLowerCase()] || null;
    };

    const minuteRemaining = getHeader('X-MinLimit-Remaining');
    const dayRemaining = getHeader('X-DayLimit-Remaining');
    const rateLimitProblem = getHeader('X-Rate-Limit-Problem');

    // Use the lower of the two limits
    const remaining = Math.min(
      minuteRemaining ? parseInt(minuteRemaining, 10) : 1000,
      dayRemaining ? parseInt(dayRemaining, 10) : 10000
    );

    // Update connection metadata with rate limit info
    await supabase
      .from('connections')
      .update({
        sync_summary: supabase.rpc('jsonb_set_path', {
          target: 'sync_summary',
          path: ['xero_rate_limit_remaining'],
          value: remaining,
        }),
      })
      .eq('id', connectionId);

    if (rateLimitProblem) {
      console.warn(`[Xero] Rate limit problem detected: ${rateLimitProblem}`);
    }
  } catch (error) {
    // Non-critical - just log and continue
    console.warn('Failed to update Xero rate limit info:', error);
  }
}

/**
 * Check if a Xero connection needs attention
 */
export async function xeroConnectionNeedsAttention(connectionId: string): Promise<{
  needsAttention: boolean;
  reasons: string[];
}> {
  const metrics = await getXeroHealthMetrics(connectionId);

  if (!metrics) {
    return { needsAttention: true, reasons: ['Unable to retrieve health metrics'] };
  }

  const reasons: string[] = [];

  if (metrics.tokenStatus === 'expired' || metrics.tokenStatus === 'missing') {
    reasons.push('Token needs refresh or reconnection');
  }

  if (metrics.rateLimitStatus === 'critical') {
    reasons.push('API rate limit critical');
  }

  if (metrics.dataFreshnessStatus === 'very_stale') {
    reasons.push('Data is very stale');
  }

  if (metrics.successRate < 0.5) {
    reasons.push('Low sync success rate');
  }

  return {
    needsAttention: reasons.length > 0,
    reasons,
  };
}

/**
 * Get all Xero connections that need attention in a tenant
 */
export async function getXeroConnectionsNeedingAttention(tenantId: string): Promise<
  Array<{
    connectionId: string;
    connectionName: string;
    reasons: string[];
    healthScore: number;
  }>
> {
  const { data: connections } = await supabase
    .from('connections')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('provider', 'xero');

  if (!connections || connections.length === 0) {
    return [];
  }

  const results: Array<{
    connectionId: string;
    connectionName: string;
    reasons: string[];
    healthScore: number;
  }> = [];

  for (const conn of connections) {
    const { needsAttention, reasons } = await xeroConnectionNeedsAttention(conn.id);
    if (needsAttention) {
      const metrics = await getXeroHealthMetrics(conn.id);
      results.push({
        connectionId: conn.id,
        connectionName: conn.name || 'Unknown',
        reasons,
        healthScore: metrics?.healthScore || 0,
      });
    }
  }

  return results;
}

