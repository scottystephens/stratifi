import { NextRequest, NextResponse } from 'next/server';
import { supabase, getAccountStatements, upsertAccountStatement, convertAmountToUsd } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : undefined;
    const pageSize = searchParams.get('pageSize') ? parseInt(searchParams.get('pageSize')!, 10) : undefined;

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 });
    }

    const accountIdentifier = params.id;
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, account_id, tenant_id')
      .eq('tenant_id', tenantId)
      .or(`account_id.eq.${accountIdentifier},id.eq.${accountIdentifier}`)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const result = await getAccountStatements(tenantId, account.id, {
      startDate,
      endDate,
      page,
      pageSize,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Get statements error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch statements' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const {
      tenantId,
      statementDate,
      endingBalance,
      availableBalance,
      currency,
      source = 'manual',
      confidence = 'medium',
      metadata = {},
    } = body;

    if (!tenantId || !statementDate || typeof endingBalance !== 'number') {
      return NextResponse.json(
        { error: 'Missing required fields: tenantId, statementDate, endingBalance' },
        { status: 400 }
      );
    }

    const accountIdentifier = params.id;
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, account_id, tenant_id, currency')
      .eq('tenant_id', tenantId)
      .or(`account_id.eq.${accountIdentifier},id.eq.${accountIdentifier}`)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const finalCurrency = (currency || account.currency || 'USD').toUpperCase();
    const usdEquivalent = await convertAmountToUsd(endingBalance, finalCurrency);

    const statement = await upsertAccountStatement({
      tenantId,
      accountId: account.id,
      statementDate,
      endingBalance,
      availableBalance,
      currency: finalCurrency,
      usdEquivalent: usdEquivalent ?? undefined,
      source,
      confidence,
      metadata,
    });

    return NextResponse.json({
      success: true,
      statement,
    });
  } catch (error) {
    console.error('Create statement error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create statement' },
      { status: 500 }
    );
  }
}

