// API endpoint to fetch ingestion jobs for a connection
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
    const jobId = searchParams.get('jobId'); // Optional: filter by specific job ID

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

    // Build query
    let query = supabase
      .from('ingestion_jobs')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('tenant_id', tenantId);

    // Filter by job ID if provided
    if (jobId) {
      query = query.eq('id', jobId);
    }

    // Get ingestion jobs
    const { data: jobs, error } = await query
      .order('created_at', { ascending: false })
      .limit(jobId ? 1 : 50); // If filtering by jobId, only need 1 result

    if (error) {
      console.error('Error fetching ingestion jobs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch ingestion jobs' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, jobs: jobs || [] });
  } catch (error) {
    console.error('Error fetching ingestion jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ingestion jobs' },
      { status: 500 }
    );
  }
}
