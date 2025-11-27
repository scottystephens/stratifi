// API endpoint to fetch transactions for a specific account
// GET /api/accounts/[id]/transactions?tenantId=xxx&limit=xxx&startDate=xxx&endDate=xxx

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
    const pageSizeParam = searchParams.get('pageSize') || searchParams.get('limit');
    const rawPageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : 100;
    const pageSize = Math.min(Math.max(rawPageSize, 1), 500);
    const offset = (page - 1) * pageSize;
    const rangeEnd = offset + pageSize - 1;

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      );
    }

    const accountId = params.id;

    // Build query
    let query = supabase
      .from('transactions')
      .select('transaction_id, account_id, date, amount, currency, description, type, category, reference, counterparty_name, counterparty_account, merchant_name, metadata', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('date', { ascending: false })
      .range(offset, rangeEnd);

    // Filter by account_id (could be UUID id or TEXT account_id)
    // First try by id (UUID), then by account_id (TEXT)
    let account = null;
    
    // Try by UUID id first
    const { data: byId } = await supabase
      .from('accounts')
      .select('account_id, id')
      .eq('tenant_id', tenantId)
      .eq('id', accountId)
      .maybeSingle();
    
    if (byId) {
      account = byId;
    } else {
      // Try by account_id (TEXT primary key)
      const { data: byAccountId } = await supabase
        .from('accounts')
        .select('account_id, id')
        .eq('tenant_id', tenantId)
        .eq('account_id', accountId)
        .maybeSingle();
      account = byAccountId;
    }

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Use account_id (TEXT) for transaction filtering
    query = query.eq('account_id', account.account_id);

    // Date filtering
    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }

    const { data: transactions, error, count } = await query;

    if (error) {
      console.error('Error fetching transactions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch transactions' },
        { status: 500 }
      );
    }

    const totalCount = count || 0;
    const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);

    return NextResponse.json({
      success: true,
      transactions: transactions || [],
      count: totalCount,
      page,
      pageSize,
      totalPages,
      hasMore: page < totalPages,
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}

