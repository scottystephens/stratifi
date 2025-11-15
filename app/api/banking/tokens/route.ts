// API endpoint to fetch provider tokens
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

    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get('connectionId');
    const tenantId = searchParams.get('tenantId');

    if (!connectionId || !tenantId) {
      return NextResponse.json(
        { error: 'Connection ID and Tenant ID are required' },
        { status: 400 }
      );
    }

    // Verify user has access to this tenant
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('*')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (!userTenant) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get provider token
    const { data: token, error } = await supabase
      .from('provider_tokens')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      // No token found is not an error, just return null
      return NextResponse.json({ success: true, token: null });
    }

    // Remove sensitive data before returning
    const sanitizedToken = {
      ...token,
      access_token: token.access_token ? '***' : null,
      refresh_token: token.refresh_token ? '***' : null,
    };

    return NextResponse.json({ success: true, token: sanitizedToken });
  } catch (error) {
    console.error('Error fetching provider token:', error);
    return NextResponse.json(
      { error: 'Failed to fetch provider token' },
      { status: 500 }
    );
  }
}

