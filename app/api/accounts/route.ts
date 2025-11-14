// API routes for accounts management
// GET /api/accounts?tenantId=xxx - List accounts
// POST /api/accounts - Create account
// PATCH /api/accounts - Update account
// DELETE /api/accounts?id=xxx&tenantId=xxx - Delete account

import { NextRequest, NextResponse } from 'next/server';
import {
  getAccountsByTenant,
  createAccount,
  updateAccount,
  deleteAccount,
  supabase,
  type Account,
} from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const accountId = searchParams.get('id');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      );
    }

    // Get single account or all accounts
    if (accountId) {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('account_id', accountId) // Use account_id (primary key in database)
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, account: data });
    } else {
      const accounts = await getAccountsByTenant(tenantId);
      return NextResponse.json({ success: true, accounts });
    }
  } catch (error) {
    console.error('Get accounts error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const account = body as Account;

    if (!account.tenant_id || !account.account_name || !account.account_type) {
      return NextResponse.json(
        { error: 'Missing required fields: tenant_id, account_name, account_type' },
        { status: 400 }
      );
    }

    const newAccount = await createAccount(account);

    return NextResponse.json({
      success: true,
      account: newAccount,
    });
  } catch (error) {
    console.error('Create account error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create account' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, tenantId, ...updates } = body;

    if (!accountId || !tenantId) {
      return NextResponse.json(
        { error: 'Account ID and Tenant ID are required' },
        { status: 400 }
      );
    }

    // Update using account_id field
    const { data, error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('tenant_id', tenantId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      account: data,
    });
  } catch (error) {
    console.error('Update account error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update account' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('id');
    const tenantId = searchParams.get('tenantId');

    if (!accountId || !tenantId) {
      return NextResponse.json(
        { error: 'Account ID and Tenant ID are required' },
        { status: 400 }
      );
    }

    // Delete using account_id field
    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('account_id', accountId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete account' },
      { status: 500 }
    );
  }
}
