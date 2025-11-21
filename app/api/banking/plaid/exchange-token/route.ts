import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getProvider } from '@/lib/banking-providers/provider-registry';
import { supabase, updateConnection, createIngestionJob, updateIngestionJob } from '@/lib/supabase';
import { performSync } from '@/lib/services/sync-service';

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

    // Trigger initial sync
    // Run in background so we respond quickly to UI
    (async () => {
        try {
            console.log(`Starting initial sync for connection ${connectionId}`);
            
            await updateIngestionJob(ingestionJob.id, {
                status: 'in_progress',
            });

            const syncResult = await performSync({
                connectionId,
                tenantId: connection.tenant_id,
                providerId,
                userId: user.id,
                syncAccounts: true,
                syncTransactions: true,
                forceSync: true,
                jobId: ingestionJob.id,
            });

            const summary = (syncResult as any).summary || {};
            if (syncResult.success) {
                await updateIngestionJob(ingestionJob.id, {
                    status: 'completed',
                    records_processed: (summary.accountsSynced || 0) + (summary.transactionsSynced || 0),
                    records_imported: (summary.accountsSynced || 0) + (summary.transactionsSynced || 0),
                });
            } else {
                await updateIngestionJob(ingestionJob.id, {
                    status: 'failed',
                    error_message: (syncResult as any).error || 'Sync failed',
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
      redirectUrl: `/connections/${connection.id}`, // Redirect to connection detail page
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

