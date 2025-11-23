/**
 * Connection Metadata Service
 * Manages connection statistics, health scoring, and sync summaries
 * Production-grade implementation with proper error handling and performance optimization
 */

import { supabase } from '@/lib/supabase';

// =====================================================
// Types and Interfaces
// =====================================================

export interface SyncSummary {
  accounts_synced: number;
  accounts_created: number;
  accounts_updated: number;
  transactions_synced?: number;
  transactions_created?: number;
  transactions_updated?: number;
  sync_duration_ms: number;
  errors: string[];
  warnings: string[];
  started_at: string;
  completed_at: string;
}

export interface ConnectionHealth {
  score: number; // 0.00 to 1.00
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  lastSuccessfulSync: string | null;
  consecutiveFailures: number;
  recommendation?: string;
}

export interface ConnectionStats {
  totalAccounts: number;
  activeAccounts: number;
  totalTransactions: number;
  lastTransactionDate: string | null;
  totalBalance: number;
  currencies: string[];
}

// =====================================================
// Health Scoring
// =====================================================

/**
 * Calculates connection health score based on sync success rate
 * Weights recent performance (last 7 days) more heavily than historical (30 days)
 */
export async function calculateHealthScore(connectionId: string): Promise<number> {
  try {
    // Get job statistics from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentJobs } = await supabase
      .from('ingestion_jobs')
      .select('status, created_at')
      .eq('connection_id', connectionId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (!recentJobs || recentJobs.length === 0) {
      // No jobs yet - default to perfect health
      return 1.0;
    }

    // Split into recent (7 days) and historical (8-30 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentJobsList = recentJobs.filter(
      (job) => new Date(job.created_at) >= sevenDaysAgo
    );
    const historicalJobs = recentJobs.filter(
      (job) => new Date(job.created_at) < sevenDaysAgo
    );

    // Calculate success rates
    const recentSuccessRate = recentJobsList.length > 0
      ? recentJobsList.filter((j) => j.status === 'completed').length / recentJobsList.length
      : 1.0;

    const historicalSuccessRate = historicalJobs.length > 0
      ? historicalJobs.filter((j) => j.status === 'completed').length / historicalJobs.length
      : 1.0;

    // Weighted average: 70% recent, 30% historical
    const healthScore = 0.7 * recentSuccessRate + 0.3 * historicalSuccessRate;

    // Penalty for consecutive recent failures
    const recentFailures = recentJobsList.slice(0, 5).filter((j) => j.status === 'failed').length;
    const failurePenalty = recentFailures * 0.05; // 5% penalty per recent failure

    const finalScore = Math.max(0, Math.min(1, healthScore - failurePenalty));

    return parseFloat(finalScore.toFixed(2));
  } catch (error) {
    console.error('Error calculating health score:', error);
    return 0.5; // Default to 50% if calculation fails
  }
}

/**
 * Gets comprehensive health information for a connection
 */
export async function getConnectionHealth(connectionId: string): Promise<ConnectionHealth> {
  try {
    const { data: connection } = await supabase
      .from('connections')
      .select('last_successful_sync_at, consecutive_failures, sync_health_score')
      .eq('id', connectionId)
      .single();

    const score = connection?.sync_health_score || await calculateHealthScore(connectionId);

    // Determine status based on score
    let status: ConnectionHealth['status'];
    let recommendation: string | undefined;

    if (score >= 0.9) {
      status = 'excellent';
    } else if (score >= 0.75) {
      status = 'good';
    } else if (score >= 0.5) {
      status = 'fair';
      recommendation = 'Some sync issues detected. Monitor connection closely.';
    } else if (score >= 0.25) {
      status = 'poor';
      recommendation = 'Frequent sync failures. Check connection settings and credentials.';
    } else {
      status = 'critical';
      recommendation = 'Connection failing consistently. Reconnect or contact support.';
    }

    return {
      score,
      status,
      lastSuccessfulSync: connection?.last_successful_sync_at || null,
      consecutiveFailures: connection?.consecutive_failures || 0,
      recommendation,
    };
  } catch (error) {
    console.error('Error getting connection health:', error);
    return {
      score: 0,
      status: 'critical',
      lastSuccessfulSync: null,
      consecutiveFailures: 0,
      recommendation: 'Unable to determine health status',
    };
  }
}

// =====================================================
// Connection Statistics
// =====================================================

/**
 * Calculates and returns connection statistics
 */
export async function getConnectionStats(connectionId: string): Promise<ConnectionStats> {
  try {
    // Get account statistics
    const { data: accounts } = await supabase
      .from('accounts')
      .select('account_status, current_balance, currency')
      .eq('connection_id', connectionId);

    const totalAccounts = accounts?.length || 0;
    const activeAccounts = accounts?.filter((a) => a.account_status === 'active').length || 0;
    
    const totalBalance = accounts
      ?.filter((a) => a.account_status === 'active')
      .reduce((sum, a) => sum + (a.current_balance || 0), 0) || 0;

    const currencies = accounts
      ? [...new Set(accounts.map((a) => a.currency).filter(Boolean))]
      : [];

    // Get transaction statistics
    const { data: transactionData } = await supabase
      .from('transactions')
      .select('transaction_date')
      .eq('connection_id', connectionId)
      .order('transaction_date', { ascending: false })
      .limit(1);

    const { count: totalTransactions } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('connection_id', connectionId);

    return {
      totalAccounts,
      activeAccounts,
      totalTransactions: totalTransactions || 0,
      lastTransactionDate: transactionData?.[0]?.transaction_date || null,
      totalBalance,
      currencies,
    };
  } catch (error) {
    console.error('Error getting connection stats:', error);
    return {
      totalAccounts: 0,
      activeAccounts: 0,
      totalTransactions: 0,
      lastTransactionDate: null,
      totalBalance: 0,
      currencies: [],
    };
  }
}

/**
 * Updates connection metadata (stats and health) in database
 */
export async function updateConnectionMetadata(
  connectionId: string,
  stats?: Partial<ConnectionStats>,
  healthScore?: number
): Promise<void> {
  try {
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (stats) {
      if (stats.totalAccounts !== undefined) updates.total_accounts = stats.totalAccounts;
      if (stats.activeAccounts !== undefined) updates.active_accounts = stats.activeAccounts;
      if (stats.totalTransactions !== undefined) updates.total_transactions = stats.totalTransactions;
      if (stats.lastTransactionDate !== undefined) updates.last_transaction_date = stats.lastTransactionDate;
    }

    if (healthScore !== undefined) {
      updates.sync_health_score = healthScore;
    }

    const { error } = await supabase
      .from('connections')
      .update(updates)
      .eq('id', connectionId);

    if (error) {
      console.error('Error updating connection metadata:', error);
    }
  } catch (error) {
    console.error('Error in updateConnectionMetadata:', error);
  }
}

/**
 * Refreshes all connection metadata (stats + health)
 * Called after successful sync operations
 * 
 * @param connectionId - The connection to refresh metadata for
 * @param retries - Number of retry attempts (default: 3)
 * @param delayMs - Delay between retries in milliseconds (default: 500ms)
 */
export async function refreshConnectionMetadata(
  connectionId: string,
  retries: number = 3,
  delayMs: number = 500
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔄 Refreshing metadata for connection ${connectionId} (attempt ${attempt}/${retries})`);

      // Calculate stats and health in parallel
      const [stats, healthScore] = await Promise.all([
        getConnectionStats(connectionId),
        calculateHealthScore(connectionId),
      ]);

      // Update database
      await updateConnectionMetadata(connectionId, stats, healthScore);

      console.log(`✅ Metadata refreshed: ${stats.totalAccounts} accounts, ${stats.totalTransactions} transactions, health ${healthScore}`);
      return; // Success - exit retry loop
    } catch (error) {
      console.error(`❌ Error refreshing connection metadata (attempt ${attempt}/${retries}):`, error);
      
      // If not the last attempt, wait before retrying
      if (attempt < retries) {
        console.log(`⏳ Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        // Exponential backoff
        delayMs = delayMs * 1.5;
      } else {
        console.error('❌ Failed to refresh connection metadata after all retries');
      }
    }
  }
}

// =====================================================
// Sync Summary Management
// =====================================================

/**
 * Creates and stores a sync summary in connection metadata
 */
export async function recordSyncSummary(
  connectionId: string,
  summary: SyncSummary
): Promise<void> {
  try {
    const { error } = await supabase
      .from('connections')
      .update({
        sync_summary: summary,
        last_sync_at: summary.completed_at,
        last_successful_sync_at: summary.errors.length === 0 ? summary.completed_at : undefined,
        consecutive_failures: summary.errors.length > 0 
          ? supabase.rpc('increment_consecutive_failures', { connection_uuid: connectionId })
          : 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    if (error) {
      console.error('Error recording sync summary:', error);
    }
  } catch (error) {
    console.error('Error in recordSyncSummary:', error);
  }
}

/**
 * Updates failure tracking for a connection
 */
export async function recordSyncFailure(
  connectionId: string,
  errorMessage: string
): Promise<void> {
  try {
    // Get current consecutive failures
    const { data: connection } = await supabase
      .from('connections')
      .select('consecutive_failures')
      .eq('id', connectionId)
      .single();

    const consecutiveFailures = (connection?.consecutive_failures || 0) + 1;

    await supabase
      .from('connections')
      .update({
        consecutive_failures: consecutiveFailures,
        last_error: errorMessage,
        status: consecutiveFailures >= 3 ? 'error' : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    // Recalculate health score
    const healthScore = await calculateHealthScore(connectionId);
    await updateConnectionMetadata(connectionId, undefined, healthScore);

    console.log(`❌ Recorded sync failure for connection ${connectionId} (${consecutiveFailures} consecutive)`);
  } catch (error) {
    console.error('Error recording sync failure:', error);
  }
}

/**
 * Resets failure counter after successful sync
 */
export async function recordSyncSuccess(connectionId: string): Promise<void> {
  try {
    await supabase
      .from('connections')
      .update({
        consecutive_failures: 0,
        last_error: null,
        status: 'active',
        last_successful_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    console.log(`✅ Recorded sync success for connection ${connectionId}`);
  } catch (error) {
    console.error('Error recording sync success:', error);
  }
}

// =====================================================
// Dashboard Utilities
// =====================================================

/**
 * Gets aggregated statistics for all connections in a tenant
 */
export async function getTenantConnectionStats(tenantId: string): Promise<{
  totalConnections: number;
  activeConnections: number;
  totalAccounts: number;
  totalTransactions: number;
  averageHealth: number;
  connectionsNeedingAttention: number;
}> {
  try {
    const { data: connections } = await supabase
      .from('connections')
      .select('status, total_accounts, total_transactions, sync_health_score')
      .eq('tenant_id', tenantId)
      .not('provider', 'is', null); // Only banking provider connections

    if (!connections || connections.length === 0) {
      return {
        totalConnections: 0,
        activeConnections: 0,
        totalAccounts: 0,
        totalTransactions: 0,
        averageHealth: 1.0,
        connectionsNeedingAttention: 0,
      };
    }

    const totalConnections = connections.length;
    const activeConnections = connections.filter((c) => c.status === 'active').length;
    const totalAccounts = connections.reduce((sum, c) => sum + (c.total_accounts || 0), 0);
    const totalTransactions = connections.reduce((sum, c) => sum + (c.total_transactions || 0), 0);
    
    const healthScores = connections
      .map((c) => c.sync_health_score || 0)
      .filter((score) => score > 0);
    
    const averageHealth = healthScores.length > 0
      ? healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length
      : 1.0;

    const connectionsNeedingAttention = connections.filter(
      (c) => (c.sync_health_score || 1) < 0.75
    ).length;

    return {
      totalConnections,
      activeConnections,
      totalAccounts,
      totalTransactions,
      averageHealth: parseFloat(averageHealth.toFixed(2)),
      connectionsNeedingAttention,
    };
  } catch (error) {
    console.error('Error getting tenant connection stats:', error);
    return {
      totalConnections: 0,
      activeConnections: 0,
      totalAccounts: 0,
      totalTransactions: 0,
      averageHealth: 0,
      connectionsNeedingAttention: 0,
    };
  }
}

/**
 * Refreshes the materialized view for connection dashboard
 * Should be called periodically (e.g., every hour) or after major sync operations
 */
export async function refreshConnectionDashboard(): Promise<void> {
  try {
    // Refresh materialized view concurrently (non-blocking)
    await supabase.rpc('refresh_materialized_view', {
      view_name: 'connection_dashboard',
    });

    console.log('✅ Connection dashboard materialized view refreshed');
  } catch (error) {
    // Non-critical - log but don't throw
    console.warn('Warning: Could not refresh connection dashboard view:', error);
  }
}

