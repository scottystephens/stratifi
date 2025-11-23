// Universal Banking Provider Sync
// Uses the new layered architecture with JSONB storage and single orchestrator

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getProvider } from '@/lib/banking-providers/provider-registry';
import { supabase, createIngestionJob, updateIngestionJob } from '@/lib/supabase';
import { orchestrateSync } from '@/lib/services/sync-orchestrator';
import {
  checkRateLimit,
  createRateLimitResponse,
  getRateLimitIdentifier,
  getIpAddress
} from '@/lib/security/rate-limit';

export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  console.log(`🔄 SYNC REQUEST STARTED: provider=${params.provider}, url=${req.url}`);

  try {
    const providerId = params.provider;

    // Get user from server-side client
    const supabaseClient = await createClient();
    const { data: { user } } = await supabaseClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ===== RATE LIMITING =====
    // Banking syncs are expensive API calls - limit to 10 per hour per user
    const ipAddress = getIpAddress(req.headers);
    const rateLimitId = getRateLimitIdentifier(user.id, ipAddress);
    const rateLimitResult = await checkRateLimit(rateLimitId, 'banking');

    if (!rateLimitResult.success) {
      console.log('[RATE_LIMIT] Banking sync blocked:', {
        userId: user.id,
        provider: providerId,
        remaining: rateLimitResult.remaining,
        reset: new Date(rateLimitResult.reset).toISOString(),
      });
      return createRateLimitResponse(rateLimitResult);
    }
    // ===== END RATE LIMITING =====

    // Parse request body
    const body = await req.json();
    console.log(`📋 SYNC REQUEST BODY:`, JSON.stringify(body, null, 2));

    const {
      connectionId,
      tenantId,
      syncAccounts = true,
      syncTransactions = true,
      transactionStartDate,
      transactionEndDate,
      accountIds, // Optional: specific accounts to sync
    } = body;

    console.log(`🔑 SYNC PARAMS: connectionId=${connectionId}, tenantId=${tenantId}, syncAccounts=${syncAccounts}, syncTransactions=${syncTransactions}`);

    if (!connectionId || !tenantId) {
      console.log(`❌ SYNC VALIDATION FAILED: Missing connectionId or tenantId`);
      return NextResponse.json(
        { error: 'Connection ID and Tenant ID are required' },
        { status: 400 }
      );
    }

    // Get connection
    const { data: connection, error: connectionError } = await supabase
      .from('connections')
      .select('*')
      .eq('id', connectionId)
      .eq('tenant_id', tenantId)
      .eq('provider', providerId)
      .single();

    if (connectionError || !connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    // ==========================================
    // UNIVERSAL SYNC USING NEW ARCHITECTURE
    // ==========================================

    // Get the banking provider
    const provider = getProvider(providerId);

    // Get active token
    const { data: tokenData, error: tokenError } = await supabase
      .from('provider_tokens')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('provider_id', providerId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenError || !tokenData) {
      console.error('❌ Token query error or no active token:', {
        connectionId,
        providerId,
        error: tokenError,
        hasToken: !!tokenData,
      });
      throw new Error('OAuth token not found. Please reconnect your account via the Connections page.');
    }

    // Check if token needs refresh
    const tokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || undefined,
      expiresAt: tokenData.expires_at ? new Date(tokenData.expires_at) : undefined,
      tokenType: tokenData.token_type || 'Bearer',
      scope: tokenData.scopes,
    };

    if (tokens.expiresAt && provider.isTokenExpired(tokens.expiresAt)) {
      if (!tokens.refreshToken) {
        throw new Error('Access token expired and no refresh token available. Please reconnect your account.');
      }

      console.log('🔄 Refreshing access token...');
      const newTokens = await provider.refreshAccessToken(tokens.refreshToken);

      // Update stored token
      await supabase
        .from('provider_tokens')
        .update({
          access_token: newTokens.accessToken,
          refresh_token: newTokens.refreshToken || tokenData.refresh_token,
          expires_at: newTokens.expiresAt?.toISOString() || null,
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', tokenData.id);

      tokens.accessToken = newTokens.accessToken;
      tokens.expiresAt = newTokens.expiresAt;
    }

    // Create ingestion job for tracking
    const ingestionJob = await createIngestionJob({
      tenant_id: tenantId,
      connection_id: connectionId,
      job_type: `${providerId}_sync`,
      status: 'running',
    });

    try {
      // Prepare credentials for orchestrator
      const credentials = {
        connectionId,
        tenantId,
        tokens,
      };

      // ==========================================
      // SINGLE LINE: Universal sync for ALL providers
      // ==========================================

      console.log(`🚀 CALLING SYNC ORCHESTRATOR: provider=${providerId}, connection=${connectionId}`);
      const result = await orchestrateSync({
        provider,
        connectionId,
        tenantId,
        credentials,
        syncAccounts,
        syncTransactions,
        userId: user.id,
        accountIds, // Optional: specific accounts to sync
        startDate: transactionStartDate,
        endDate: transactionEndDate,
      });

      // Update ingestion job with results
      await updateIngestionJob(ingestionJob.id, {
        status: result.success ? 'completed' : 'completed_with_errors',
        records_fetched: result.accountsSynced + result.transactionsSynced,
        records_imported: result.accountsSynced + result.transactionsSynced,
        records_failed: result.errors.length,
        completed_at: new Date().toISOString(),
        summary: result,
      });

      console.log(`✅ Orchestrated sync completed in ${result.duration}ms`);
      console.log(`📊 Final result: accounts=${result.accountsSynced}, transactions=${result.transactionsSynced}, success=${result.success}`);

      return NextResponse.json({
        success: result.success,
        message: `Synced ${result.accountsSynced} accounts, ${result.transactionsSynced} transactions`,
        summary: result,
        jobId: ingestionJob.id,
      });

    } catch (error) {
      // Update job as failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await updateIngestionJob(ingestionJob.id, {
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      });

      throw error;
    }
  } catch (error) {
    console.error('Provider sync error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to sync with provider',
      },
      { status: 500 }
    );
  }
}
