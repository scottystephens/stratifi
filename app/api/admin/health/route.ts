// Admin API - System Health
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    // Get user from server-side client
    const supabaseClient = await createClient();
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super admin
    const isSuperAdmin = user.user_metadata?.is_super_admin === true;

    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Get recent health metrics
    const { data: metrics, error: metricsError } = await supabase
      .from('system_health_metrics')
      .select('*')
      .order('measured_at', { ascending: false })
      .limit(50);

    if (metricsError) throw metricsError;

    // Get connection health stats
    const { data: connectionStats, error: statsError } = await supabase
      .from('connection_stats')
      .select('health_score, status, consecutive_failures');

    if (statsError) throw statsError;

    // Calculate connection health summary
    const totalConnections = connectionStats?.length || 0;
    const healthyConnections =
      connectionStats?.filter((c) => c.health_score >= 80).length || 0;
    const warningConnections =
      connectionStats?.filter((c) => c.health_score >= 50 && c.health_score < 80)
        .length || 0;
    const criticalConnections =
      connectionStats?.filter((c) => c.health_score < 50).length || 0;

    // Statement coverage (accounts with statements in last 3 days)
    const { data: allAccounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id')
      .eq('account_status', 'active');

    if (accountsError) throw accountsError;

    const { data: statementRows, error: statementsError } = await supabase
      .from('account_statements')
      .select('account_id, statement_date')
      .order('statement_date', { ascending: false });

    if (statementsError) throw statementsError;

    const statementMap = new Map<string, string>();
    (statementRows || []).forEach((row) => {
      if (!statementMap.has(row.account_id)) {
        statementMap.set(row.account_id, row.statement_date);
      }
    });

    const staleThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    let withRecentStatements = 0;
    (allAccounts || []).forEach((account) => {
      const dateStr = statementMap.get(account.id);
      if (!dateStr) {
        return;
      }
      const statementDate = new Date(dateStr);
      if (statementDate >= staleThreshold) {
        withRecentStatements += 1;
      }
    });

    const totalAccounts = allAccounts?.length || 0;
    const missingStatements = Math.max(totalAccounts - withRecentStatements, 0);
    const coveragePercent =
      totalAccounts > 0 ? Math.round((withRecentStatements / totalAccounts) * 100) : 0;

    // Get recent failed jobs (last 24 hours)
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();
    const { data: recentJobs, error: jobsError } = await supabase
      .from('ingestion_jobs')
      .select('status, created_at')
      .gte('created_at', twentyFourHoursAgo);

    if (jobsError) throw jobsError;

    const totalJobs = recentJobs?.length || 0;
    const failedJobs = recentJobs?.filter((j) => j.status === 'failed').length || 0;
    const errorRate = totalJobs > 0 ? (failedJobs / totalJobs) * 100 : 0;

    return NextResponse.json({
      success: true,
      health: {
        metrics: metrics || [],
        connections: {
          total: totalConnections,
          healthy: healthyConnections,
          warning: warningConnections,
          critical: criticalConnections,
        },
        jobs: {
          total24h: totalJobs,
          failed24h: failedJobs,
          errorRate24h: Math.round(errorRate * 10) / 10,
        },
        statements: {
          totalAccounts,
          withRecentStatements,
          missingStatements,
          coveragePercent,
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching health data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch health data' },
      { status: 500 }
    );
  }
}

