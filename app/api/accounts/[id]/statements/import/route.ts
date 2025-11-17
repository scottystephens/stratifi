import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { createClient } from '@/lib/supabase-server';
import { supabase, upsertAccountStatement, convertAmountToUsd } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StatementCsvRow {
  statement_date: string;
  ending_balance: string | number;
  available_balance?: string | number;
  currency?: string;
  source?: 'synced' | 'calculated' | 'manual' | 'imported';
  confidence?: 'high' | 'medium' | 'low';
  notes?: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

function sanitizeNumber(value?: string | number | null) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function validateStatements(rows: StatementCsvRow[]) {
  const errors: ValidationError[] = [];
  const cleaned: Array<StatementCsvRow & { ending_balance: number }> = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // account for header row

    if (!row.statement_date) {
      errors.push({ row: rowNumber, field: 'statement_date', message: 'Statement date is required' });
    }

    const endingBalance = sanitizeNumber(row.ending_balance);
    if (endingBalance === null) {
      errors.push({ row: rowNumber, field: 'ending_balance', message: 'Ending balance is required' });
    }

    if (!errors.find((e) => e.row === rowNumber)) {
      cleaned.push({
        ...row,
        statement_date: row.statement_date,
        ending_balance: endingBalance!,
      });
    }
  });

  return { valid: errors.length === 0, errors, data: cleaned };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { tenantId, csvData, mode = 'validate' } = body;

    if (!tenantId || !csvData) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: tenantId or csvData' },
        { status: 400 }
      );
    }

    const supabaseClient = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabaseClient
      .from('user_tenants')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const accountIdentifier = params.id;
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, account_id, currency, tenant_id')
      .eq('tenant_id', tenantId)
      .or(`account_id.eq.${accountIdentifier},id.eq.${accountIdentifier}`)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    const parsed = await new Promise<Papa.ParseResult<StatementCsvRow>>((resolve) => {
      Papa.parse<StatementCsvRow>(csvData, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase().replace(/ /g, '_'),
        complete: resolve,
      });
    });

    if (parsed.errors.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'CSV parsing failed',
        details: parsed.errors,
      }, { status: 400 });
    }

    const validation = validateStatements(parsed.data);

    if (!validation.valid || mode === 'validate') {
      return NextResponse.json({
        success: validation.valid,
        validation: {
          valid: validation.valid,
          errors: validation.errors,
          rowCount: parsed.data.length,
        },
        preview: validation.valid ? validation.data.slice(0, 5) : undefined,
      }, { status: validation.valid ? 200 : 400 });
    }

    const results = {
      total: validation.data.length,
      imported: 0,
      errors: [] as Array<{ row: number; message: string }>,
    };

    for (let i = 0; i < validation.data.length; i++) {
      const row = validation.data[i];
      const rowNumber = i + 2;
      const currency = (row.currency || account.currency || 'USD').toUpperCase();

      try {
        const usdEquivalent = await convertAmountToUsd(row.ending_balance, currency);

        await upsertAccountStatement({
          tenantId,
          accountId: account.id,
          statementDate: row.statement_date,
          endingBalance: row.ending_balance,
          availableBalance: sanitizeNumber(row.available_balance) ?? row.ending_balance,
          currency,
          usdEquivalent: usdEquivalent ?? undefined,
          source: row.source || 'imported',
          confidence: row.confidence || 'high',
          metadata: row.notes ? { notes: row.notes } : undefined,
        });

        results.imported++;
      } catch (rowError) {
        results.errors.push({
          row: rowNumber,
          message: rowError instanceof Error ? rowError.message : 'Failed to import statement',
        });
      }
    }

    return NextResponse.json({
      success: results.errors.length === 0,
      results,
    });
  } catch (error) {
    console.error('Statement import error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to import statements' },
      { status: 500 }
    );
  }
}

