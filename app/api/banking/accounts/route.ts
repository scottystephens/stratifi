// API endpoint to fetch provider accounts
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

    // Get provider accounts
    const { data: accounts, error } = await supabase
      .from('provider_accounts')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching provider accounts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch provider accounts' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, accounts: accounts || [] });
  } catch (error) {
    console.error('Error fetching provider accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch provider accounts' },
      { status: 500 }
    );
  }
}

