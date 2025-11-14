// Bunq OAuth Authorization Initiation
// Creates a connection and redirects user to Bunq OAuth page

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getBunqAuthorizationUrl, generateOAuthState } from '@/lib/bunq-client';
import { createConnection } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    // Get user from server-side client
    const supabaseClient = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    console.log('Auth check:', { hasUser: !!user, authError, headers: req.headers.get('cookie') ? 'present' : 'missing' });

    if (!user) {
      return NextResponse.json({ 
        error: 'Unauthorized', 
        details: authError?.message || 'Not authenticated',
        debug: {
          hasCookies: !!req.headers.get('cookie'),
          authError: authError?.message
        }
      }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { tenantId, connectionName, accountId } = body;

    if (!tenantId || !connectionName) {
      return NextResponse.json(
        { error: 'Tenant ID and connection name are required' },
        { status: 400 }
      );
    }

    // Verify user has access to this tenant
    const { data: userTenants, error: tenantError } = await supabaseClient
      .from('user_tenants')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (tenantError || !userTenants) {
      return NextResponse.json(
        { error: 'You do not have access to this tenant' },
        { status: 403 }
      );
    }

    // Check if user has permission to create connections
    if (!['owner', 'admin', 'editor'].includes(userTenants.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to create connections' },
        { status: 403 }
      );
    }

    // Generate OAuth state for security
    const oauthState = generateOAuthState();

    // Create connection record
    const connection = await createConnection({
      tenant_id: tenantId,
      name: connectionName,
      connection_type: 'bunq_oauth',
      provider: 'bunq',
      account_id: accountId || null,
      import_mode: 'incremental',
      config: {
        environment: process.env.BUNQ_ENVIRONMENT || 'sandbox',
        created_at: new Date().toISOString(),
      },
      created_by: user.id,
      oauth_state: oauthState,
    });

    // Generate Bunq authorization URL
    const authorizationUrl = getBunqAuthorizationUrl(oauthState);

    return NextResponse.json({
      success: true,
      connectionId: connection.id,
      authorizationUrl: authorizationUrl,
      message: 'Connection created. Redirect user to authorization URL.',
    });
  } catch (error) {
    console.error('Bunq authorization initiation error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to initiate Bunq authorization',
      },
      { status: 500 }
    );
  }
}

