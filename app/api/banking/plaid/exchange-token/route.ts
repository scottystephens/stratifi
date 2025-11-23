import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getProvider } from '@/lib/banking-providers/provider-registry';
import { supabase, updateConnection, createIngestionJob, updateIngestionJob } from '@/lib/supabase';
import { orchestrateSync } from '@/lib/services/sync-orchestrator';

export async function POST(req: NextRequest) {
  try {
    // Get user from server-side client
    const supabaseClient = await createClient();
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { publicToken, connectionId, metadata } = body;

    if (!publicToken || !connectionId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Get the connection to verify ownership and provider
    // Note: Using service role client (via updateConnection internal logic) or checking ownership here
    // For safety, let's verify ownership first
    const { data: connection, error: connectionError } = await supabaseClient
      .from('connections')
      .select('*')
      .eq('id', connectionId)
      .eq('created_by', user.id)
      .single();

    if (connectionError || !connection) {
        return NextResponse.json(
            { error: 'Connection not found or unauthorized' },
            { status: 404 }
        );
    }

    const providerId = connection.provider;
    const provider = getProvider(providerId);

    // Exchange token using the provider implementation
    // We use exchangeCodeForToken interface method, where code = public_token
    const tokens = await provider.exchangeCodeForToken(publicToken);

    // Get user info from provider if possible
    let userInfo = { userId: user.id, name: 'Plaid User', metadata: {} };
    try {
        const providerUser = await provider.fetchUserInfo({
            connectionId: connection.id,
            tenantId: connection.tenant_id,
            tokens: tokens
        });
        userInfo = { 
            userId: providerUser.userId, 
            name: providerUser.name,
            metadata: providerUser.metadata || {}
        };
    } catch (e) {
        console.warn('Could not fetch provider user info, using defaults', e);
    }

    console.log('💾 Storing Plaid token in provider_tokens table:', {
        connectionId: connection.id,
        tenantId: connection.tenant_id,
        providerId,
        hasAccessToken: !!tokens.accessToken,
        hasRefreshToken: !!tokens.refreshToken,
        accessTokenLength: tokens.accessToken?.length,
    });

    // Store token in provider_tokens table (this is what the sync API looks for)
    const { data: tokenData, error: tokenError } = await supabase
        .from('provider_tokens')
        .upsert({
            tenant_id: connection.tenant_id,
            connection_id: connection.id,
            provider_id: providerId,
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken || null,
            token_type: tokens.tokenType || 'Bearer',
            expires_at: tokens.expiresAt?.toISOString() || null,
            scopes: tokens.scope || [],
            provider_user_id: userInfo.userId,
            provider_metadata: { ...userInfo.metadata, ...metadata },
            status: 'active',
        }, {
            onConflict: 'connection_id,provider_id',
            ignoreDuplicates: false
        })
        .select()
        .single();

    if (tokenError) {
        console.error('❌ Error storing OAuth token:', {
            error: tokenError,
            code: tokenError.code,
            message: tokenError.message,
            details: tokenError.details
        });
        throw new Error(`Failed to store OAuth token: ${tokenError.message}`);
    }

    console.log('✅ OAuth token stored successfully:', {
        tokenId: tokenData.id,
        connectionId: connection.id,
        providerId,
        hasRefreshToken: !!tokenData.refresh_token,
    });

    // Update connection status
    await updateConnection(connection.tenant_id, connectionId, {
        status: 'active',
        last_sync_at: new Date().toISOString()
    });

    // Create ingestion job for tracking sync progress
    const ingestionJob = await createIngestionJob({
        tenant_id: connection.tenant_id,
        connection_id: connection.id,
        job_type: 'oauth_initial_sync',
        status: 'pending',
    });

    // Trigger initial sync with reconnection detection
    // Run in background so we respond quickly to UI
    (async () => {
        try {
            console.log(`Starting initial sync for connection ${connectionId}`);
            
            await updateIngestionJob(ingestionJob.id, {
                status: 'in_progress',
            });

            // Get provider and credentials for orchestrator
            const provider = getProvider(providerId);
            const credentials = {
              connectionId,
              tenantId: connection.tenant_id,
              tokens: {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresAt: tokenData.expires_at ? new Date(tokenData.expires_at) : undefined,
              },
            };

            // STEP 1: Fetch accounts first to detect reconnection
            console.log('[Reconnection] Fetching accounts to check for reconnection...');
            const rawAccounts = await provider.fetchRawAccounts(credentials);
            
            // STEP 2: Check if this is a reconnection
            const { detectReconnection, linkConnectionToAccounts, linkConnectionToTransactions, recordReconnectionEvent, getReconnectionSyncStartDate } = await import('@/lib/services/reconnection-service');
            
            const reconnectionMatch = await detectReconnection({
              tenantId: connection.tenant_id,
              providerId,
              institutionId: rawAccounts.institutionData?.id || rawAccounts.institutionData?.institution_id,
              institutionName: rawAccounts.institutionData?.name,
              externalAccountIds: (rawAccounts.rawData as any).accounts?.map((acc: any) => acc.account_id) || [],
              accountNumbers: (rawAccounts.rawData as any).accounts?.map((acc: any) => acc.mask || acc.account?.mask).filter(Boolean) || [],
              ibans: (rawAccounts.rawData as any).accounts?.map((acc: any) => acc.iban).filter(Boolean) || [],
            });

            let syncStartDate: string | undefined;
            
            if (reconnectionMatch.isReconnection && reconnectionMatch.recommendation === 'link_and_resume') {
              console.log(`[Reconnection] 🔗 RECONNECTION DETECTED! Confidence: ${reconnectionMatch.matchedAccounts[0]?.matchConfidence}`);
              console.log(`[Reconnection] Found ${reconnectionMatch.matchedAccounts.length} matching accounts`);
              console.log(`[Reconnection] ${reconnectionMatch.totalTransactions} existing transactions`);
              console.log(`[Reconnection] Date range: ${reconnectionMatch.oldestTransactionDate} to ${reconnectionMatch.newestTransactionDate}`);
              
              // Link existing accounts to new connection
              const accountIds = reconnectionMatch.matchedAccounts.map(acc => acc.accountId);
              await linkConnectionToAccounts(connectionId, accountIds);
              await linkConnectionToTransactions(connectionId, accountIds);
              
              // Update connection metadata
              await supabase
                .from('connections')
                .update({
                  is_reconnection: true,
                  reconnected_from: reconnectionMatch.previousConnectionId,
                  reconnection_confidence: reconnectionMatch.matchedAccounts[0]?.matchConfidence,
                })
                .eq('id', connectionId);
              
              // Record reconnection event
              await recordReconnectionEvent(
                connection.tenant_id,
                connectionId,
                reconnectionMatch.previousConnectionId,
                reconnectionMatch.matchedAccounts.length,
                reconnectionMatch.totalTransactions,
                reconnectionMatch.matchedAccounts[0]?.matchConfidence
              );
              
              // Get smart sync start date (resume from last transaction)
              const smartStartDate = await getReconnectionSyncStartDate(accountIds);
              if (smartStartDate) {
                syncStartDate = smartStartDate.toISOString();
                console.log(`[Reconnection] Smart sync: Resuming from ${syncStartDate} (skipping ${reconnectionMatch.totalTransactions} existing transactions)`);
              }
            } else {
              console.log('[Reconnection] No reconnection detected - treating as new connection');
            }

            // STEP 3: Run full orchestrated sync (with smart start date for reconnections)
            const syncResult = await orchestrateSync({
              provider,
              connectionId,
              tenantId: connection.tenant_id,
              credentials,
              syncAccounts: true,
              syncTransactions: true,
              userId: user.id,
              startDate: syncStartDate, // Use smart date for reconnections
            });

            if (syncResult.success) {
                await updateIngestionJob(ingestionJob.id, {
                    status: 'completed',
                    records_processed: syncResult.accountsSynced + syncResult.transactionsSynced,
                    records_imported: syncResult.accountsSynced + syncResult.transactionsSynced,
                    completed_at: new Date().toISOString(),
                    summary: {
                        accounts_synced: syncResult.accountsSynced,
                        transactions_synced: syncResult.transactionsSynced,
                        accounts_created: reconnectionMatch.isReconnection ? 0 : syncResult.accountsSynced,
                        accounts_updated: reconnectionMatch.isReconnection ? syncResult.accountsSynced : 0,
                        errors: syncResult.errors,
                        duration_ms: syncResult.duration,
                        is_reconnection: reconnectionMatch.isReconnection,
                        reconnection_confidence: reconnectionMatch.matchedAccounts[0]?.matchConfidence,
                        existing_transactions: reconnectionMatch.totalTransactions,
                    },
                });
            } else {
                await updateIngestionJob(ingestionJob.id, {
                    status: 'failed',
                    error_message: syncResult.errors.join('; ') || 'Sync failed',
                    completed_at: new Date().toISOString(),
                });
            }

            console.log(`Initial sync completed for connection ${connectionId}`, syncResult);
        } catch (syncError) {
            console.error(`Initial sync failed for connection ${connectionId}`, syncError);
            await updateIngestionJob(ingestionJob.id, {
                status: 'failed',
                error_message: syncError instanceof Error ? syncError.message : 'Sync failed',
            });
        }
    })();

    return NextResponse.json({
      success: true,
      connectionId: connection.id,
      redirectUrl: `/connections/${connection.id}?syncing=true&jobId=${ingestionJob.id}`, // Redirect with sync status
      message: 'Connection successful! Syncing accounts and transactions...'
    });

  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to exchange token',
      },
      { status: 500 }
    );
  }
}

