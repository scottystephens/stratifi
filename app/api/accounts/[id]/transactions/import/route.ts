import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { createClient } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TransactionCsvRow {
  transaction_id?: string;
  external_transaction_id?: string;
  date: string;
  description?: string;
  amount: string | number;
  currency?: string;
  type?: string;
  category?: string;
  reference?: string;
  counterparty_name?: string;
  counterparty_account?: string;
  merchant_name?: string;
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

function normalizeType(value?: string | null) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (['credit', 'cr', 'c', 'inflow'].includes(normalized)) return 'credit';
  if (['debit', 'dr', 'd', 'outflow'].includes(normalized)) return 'debit';
  return null;
}

function validateTransactions(rows: TransactionCsvRow[]) {
  const errors: ValidationError[] = [];
  const cleaned: Array<TransactionCsvRow & { amount: number; type: 'credit' | 'debit' }> = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const amount = sanitizeNumber(row.amount);
    const txnType = normalizeType(row.type);

    if (!row.date) {
      errors.push({ row: rowNumber, field: 'date', message: 'Date is required' });
    }
    if (amount === null) {
      errors.push({ row: rowNumber, field: 'amount', message: 'Amount is required' });
    }
    if (!txnType) {
      errors.push({ row: rowNumber, field: 'type', message: 'Type must be credit or debit' });
    }

    if (!errors.find((e) => e.row === rowNumber)) {
      cleaned.push({
        ...row,
        amount: amount!,
        type: txnType!,
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

    const parsed = await new Promise<Papa.ParseResult<TransactionCsvRow>>((resolve) => {
      Papa.parse<TransactionCsvRow>(csvData, {
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

    const validation = validateTransactions(parsed.data);

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
      skipped: 0,
      errors: [] as Array<{ row: number; message: string }>,
    };

    for (let i = 0; i < validation.data.length; i++) {
      const row = validation.data[i];
      const rowNumber = i + 2;
      const currency = (row.currency || account.currency || 'USD').toUpperCase();
      const normalizedType = row.type;
      const signedAmount = normalizedType === 'debit' ? -Math.abs(row.amount) : Math.abs(row.amount);
      const transactionId =
        row.transaction_id?.trim() ||
        row.external_transaction_id?.trim() ||
        `MANUAL-${account.account_id}-${row.date}-${i}-${Date.now()}`;

      try {
        const { error: insertError } = await supabase
          .from('transactions')
          .upsert(
            {
              transaction_id: transactionId,
              tenant_id: tenantId,
              account_id: account.account_id,
              date: row.date,
              amount: signedAmount,
              currency,
              description: row.description || 'Manual import',
              type: normalizedType === 'credit' ? 'Credit' : 'Debit',
              category: row.category || 'Manual Import',
              status: 'Completed',
              reference: row.reference || row.external_transaction_id || null,
              connection_id: null,
              external_transaction_id: row.external_transaction_id || null,
              source_type: 'manual_import',
              metadata: {
                counterparty_name: row.counterparty_name || null,
                counterparty_account: row.counterparty_account || null,
                merchant_name: row.merchant_name || null,
                original_transaction_id: row.transaction_id || null,
              },
            },
            { onConflict: 'transaction_id' }
          );

        if (insertError) {
          results.errors.push({
            row: rowNumber,
            message: insertError.message,
          });
          continue;
        }

        results.imported++;
      } catch (rowError) {
        results.errors.push({
          row: rowNumber,
          message: rowError instanceof Error ? rowError.message : 'Failed to import transaction',
        });
      }
    }

    return NextResponse.json({
      success: results.errors.length === 0,
      results,
    });
  } catch (error) {
    console.error('Transaction import error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to import transactions' },
      { status: 500 }
    );
  }
}

