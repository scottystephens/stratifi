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
      // Try to query by both account_id (TEXT primary key) and id (UUID)
      // First try by UUID id, then by account_id (TEXT)
      let data = null;
      let error = null;
      
      // Try by UUID id first
      const byIdResult = await supabase
        .from('accounts')
        .select(`
          *,
          connections:connection_id(
            provider,
            name,
            status
          ),
          provider_accounts:provider_accounts_account_id_fkey(
            last_sync_status,
            last_sync_error,
            last_sync_duration_ms,
            last_synced_at
          ),
          latest_statement:account_statements_account_id_fkey(
            statement_date,
            ending_balance,
            available_balance,
            currency,
            source,
            confidence
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('id', accountId)
        .order('statement_date', {
          ascending: false,
          foreignTable: 'account_statements_account_id_fkey',
        })
        .limit(1, { foreignTable: 'account_statements_account_id_fkey' })
        .maybeSingle();
      
      if (byIdResult.data) {
        data = byIdResult.data;
      } else {
        // Try by account_id (TEXT primary key)
        const byAccountIdResult = await supabase
          .from('accounts')
          .select(`
            *,
            connections:connection_id(
              provider,
              name,
              status
            ),
            provider_accounts:provider_accounts_account_id_fkey(
              last_sync_status,
              last_sync_error,
              last_sync_duration_ms,
              last_synced_at
            ),
            latest_statement:account_statements_account_id_fkey(
              statement_date,
              ending_balance,
              available_balance,
              currency,
              source,
              confidence
            )
          `)
          .eq('tenant_id', tenantId)
          .eq('account_id', accountId)
          .order('statement_date', {
            ascending: false,
            foreignTable: 'account_statements_account_id_fkey',
          })
          .limit(1, { foreignTable: 'account_statements_account_id_fkey' })
          .maybeSingle();
        
        data = byAccountIdResult.data;
        error = byAccountIdResult.error;
      }

      if (error || !data) {
        return NextResponse.json({ error: error?.message || 'Account not found' }, { status: error ? 500 : 404 });
      }

      // Flatten connection data for consistency
      const account: Account = { ...data }
      if (data.connections) {
        account.connection_provider = data.connections.provider
        account.connection_name = data.connections.name
        account.connection_status = data.connections.status
      }
      account.is_synced = !!data.connection_id

      if (Array.isArray(data.latest_statement) && data.latest_statement.length > 0) {
        account.statement_snapshot = data.latest_statement[0]
      }

      if (Array.isArray(data.provider_accounts) && data.provider_accounts.length > 0) {
        const providerMeta = data.provider_accounts[0]
        account.provider_sync_status = providerMeta.last_sync_status
        account.provider_sync_error = providerMeta.last_sync_error
        account.provider_sync_duration_ms = providerMeta.last_sync_duration_ms
        account.provider_last_synced_at = providerMeta.last_synced_at
      }

      delete (account as any).provider_accounts
      delete (account as any).latest_statement

      return NextResponse.json({ success: true, account });
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

    // Handle entity_id: convert empty string to null
    if ('entity_id' in account && account.entity_id === '') {
      account.entity_id = null;
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

    // Handle entity_id: convert empty string to null
    if ('entity_id' in updates && updates.entity_id === '') {
      updates.entity_id = null;
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

    // First, verify the account exists
    const { data: accountData, error: accountLookupError } = await supabase
      .from('accounts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('account_id', accountId)
      .single();

    if (accountLookupError || !accountData) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Check if account has provider accounts linked (using UUID id)
    const { count: providerAccountCount, error: providerCountError } = await supabase
      .from('provider_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountData.id); // Use UUID id, not TEXT account_id

    if (providerCountError) {
      console.error('Error checking provider accounts:', providerCountError);
    }

    if (providerAccountCount && providerAccountCount > 0) {
      return NextResponse.json(
        { 
          error: `Cannot delete account: Account is linked to ${providerAccountCount} provider account(s). Please disconnect the account from the banking provider first.`,
          providerAccountCount 
        },
        { status: 400 }
      );
    }

    // Get count of transactions before deletion
    const { count: transactionCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('account_id', accountId);

    // Delete all transactions for this account first (required due to foreign key constraint)
    const { error: deleteTransactionsError } = await supabase
      .from('transactions')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('account_id', accountId);

    if (deleteTransactionsError) {
      console.error('Error deleting transactions:', deleteTransactionsError);
      return NextResponse.json(
        { 
          error: `Failed to delete transactions: ${deleteTransactionsError.message}`,
          details: deleteTransactionsError 
        },
        { status: 500 }
      );
    }

    console.log(`Deleted ${transactionCount || 0} transaction(s) for account ${accountId}`);

    // Now delete the account
    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('account_id', accountId);

    if (error) {
      // Check for foreign key constraint violation
      if (error.code === '23503') {
        return NextResponse.json(
          { 
            error: 'Cannot delete account: Account is referenced by other records (transactions, provider accounts, etc.). Please remove these references first.',
            details: error.message 
          },
          { status: 400 }
        );
      }
      
      console.error('Delete account error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Account deleted successfully${transactionCount ? ` (${transactionCount} transaction(s) also deleted)` : ''}`,
      transactionsDeleted: transactionCount || 0,
    });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete account' },
      { status: 500 }
    );
  }
}
