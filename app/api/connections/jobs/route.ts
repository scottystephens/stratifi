// API route for fetching ingestion jobs (import history)
// GET /api/connections/jobs?tenantId=xxx&connectionId=xxx

import { NextRequest, NextResponse } from 'next/server';
import { getIngestionJobs, getIngestionJobsByConnection } from '@/lib/supabase';
import { supabase } from '@/lib/supabase-client';

export async function GET(req: NextRequest) {
  try {
    // Get user session
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const connectionId = searchParams.get('connectionId');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      );
    }

    let jobs;
    if (connectionId) {
      jobs = await getIngestionJobsByConnection(tenantId, connectionId);
    } else {
      jobs = await getIngestionJobs(tenantId);
    }

    return NextResponse.json({
      success: true,
      jobs,
    });

  } catch (error) {
    console.error('Get jobs error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}

