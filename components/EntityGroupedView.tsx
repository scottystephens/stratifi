/**
 * Entity Organization View - Grouped Card Layout
 * Clear visual hierarchy showing entities and their accounts
 * No external dependencies, pure CSS-based layout
 */

'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Landmark, CreditCard, TrendingUp, ChevronRight, Link2 } from 'lucide-react';
import type { Entity } from '@/lib/types/entity';
import type { Account } from '@/lib/supabase';

interface EntityGroupedViewProps {
  entities: Entity[];
  accounts: Account[];
  onEntityClick?: (entityId: string) => void;
  onAccountClick?: (accountId: string) => void;
}

export function EntityGroupedView({
  entities,
  accounts,
  onEntityClick,
  onAccountClick,
}: EntityGroupedViewProps) {
  const router = useRouter();

  // Group accounts by entity
  const groupedData = useMemo(() => {
    const accountsByEntity = accounts.reduce((acc, account) => {
      const entityId = account.entity_id || 'unassigned';
      if (!acc[entityId]) acc[entityId] = [];
      acc[entityId].push(account);
      return acc;
    }, {} as Record<string, Account[]>);

    // Add unassigned entity if there are accounts without entity
    const entitiesWithUnassigned = [...entities];
    if (accountsByEntity['unassigned']?.length > 0) {
      entitiesWithUnassigned.push({
        entity_id: 'unassigned',
        entity_name: 'Unassigned Accounts',
        type: 'Other',
        jurisdiction: 'N/A',
        status: 'Active',
        tenant_id: entities[0]?.tenant_id || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Entity);
    }

    return entitiesWithUnassigned.map(entity => {
      const entityAccounts = accountsByEntity[entity.entity_id] || [];
      const currencyTotals = entityAccounts.reduce((totals, acc) => {
        const balance =
          acc.current_balance ??
          acc.available_balance ??
          acc.balance ??
          0;
        const currency = acc.currency || 'USD';
        totals[currency] = (totals[currency] || 0) + balance;
        return totals;
      }, {} as Record<string, number>);
      const primaryCurrency = entityAccounts[0]?.currency || 'USD';

      return {
        entity,
        accounts: entityAccounts,
        currencyTotals,
        primaryCurrency,
      };
    });
  }, [entities, accounts]);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'Inactive':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'Dissolved':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  const getAccountIcon = (type: string) => {
    const accountType = type?.toLowerCase() || '';
    if (accountType.includes('credit')) return CreditCard;
    if (accountType.includes('investment')) return TrendingUp;
    return Landmark;
  };

  const formatCurrencySummary = (totals: Record<string, number>) => {
    const entries = Object.entries(totals);
    if (entries.length === 0) {
      return formatCurrency(0, 'USD');
    }
    return entries
      .map(([currency, amount]) => formatCurrency(amount, currency))
      .join(' • ');
  };

  return (
    <div className="space-y-8">
      {groupedData.map(({ entity, accounts: entityAccounts, currencyTotals, primaryCurrency }) => (
        <div
          key={entity.entity_id}
          className="border-2 border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow"
        >
          {/* Entity Header */}
          <div
            className="bg-gradient-to-r from-blue-50 to-blue-100 border-b-2 border-blue-200 p-6 cursor-pointer hover:from-blue-100 hover:to-blue-150 transition-colors"
            onClick={() => onEntityClick?.(entity.entity_id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4 flex-1">
                <div className="p-3 bg-blue-600 rounded-xl shadow-md">
                  <Building2 className="h-8 w-8 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-bold text-gray-900">{entity.entity_name}</h2>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(
                        entity.status
                      )}`}
                    >
                      {entity.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">{entity.entity_id}</p>
                  <p className="text-sm text-gray-600">
                    {entity.type} • {entity.jurisdiction}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600 mb-1">Total Balance</p>
                <p className="text-3xl font-bold text-gray-900">
                  {formatCurrency(
                    currencyTotals[primaryCurrency!] || 0,
                    primaryCurrency || 'USD'
                  )}
                </p>
                {Object.keys(currencyTotals).length > 1 && (
                  <p className="text-sm text-gray-600 mt-1">
                    {formatCurrencySummary(currencyTotals)}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  {entityAccounts.length} account{entityAccounts.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Accounts Grid */}
          {entityAccounts.length > 0 ? (
            <div className="p-6 bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {entityAccounts.map((account) => {
                  const balance =
                    account.current_balance ??
                    account.available_balance ??
                    account.balance ??
                    0;
                  const accountCurrency = account.currency || 'USD';
                  const Icon = getAccountIcon(account.account_type || '');
                  const isSynced = !!account.connection_id;
                  const providerLabel = account.connection_provider || account.provider_id;
                  const providerSyncStatus = account.provider_sync_status || (account.last_synced_at ? 'success' : 'idle');
                  const providerSyncError = account.provider_sync_error;
                  const providerLastSyncedAt = account.provider_last_synced_at || account.last_synced_at;
                  const lastSynced = providerLastSyncedAt
                    ? new Date(providerLastSyncedAt).toLocaleDateString()
                    : null;

                  return (
                    <div
                      key={account.account_id || account.id}
                      onClick={() => onAccountClick?.(account.account_id || account.id || '')}
                      className={`relative p-4 rounded-lg border-2 cursor-pointer hover:shadow-lg transition-all ${
                        isSynced
                          ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-300 hover:border-green-400'
                          : 'bg-white border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {/* Account Header */}
                      <div className="flex items-start gap-3 mb-3">
                        <div
                          className={`p-2 rounded-lg ${
                            isSynced ? 'bg-green-600' : 'bg-gray-600'
                          }`}
                        >
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm text-gray-900 truncate">
                            {account.account_name}
                          </h3>
                          <p className="text-xs text-gray-600 truncate">
                            {account.bank_name || account.account_number || account.iban || account.external_account_id || 'No bank'}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      </div>

                      {/* Account Details */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-gray-600">
                          <span className="capitalize">{account.account_type || 'Unknown'}</span>
                          <span className="font-mono">{accountCurrency}</span>
                        </div>
                        {providerLabel && (
                          <div
                            className={`flex items-center gap-2 text-[11px] font-medium ${
                              providerSyncStatus === 'error' ? 'text-red-700' : 'text-emerald-700'
                            }`}
                          >
                            <Link2 className="h-3 w-3" />
                            <span>Synced via {providerLabel}</span>
                          </div>
                        )}
                        <div className="text-right">
                          <p className={`text-lg font-bold ${balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                            {formatCurrency(balance, accountCurrency)}
                          </p>
                        </div>
                        {providerSyncStatus === 'error' && providerSyncError && (
                          <p className="text-[11px] text-red-600 mt-1 line-clamp-2">
                            Error: {providerSyncError}
                          </p>
                        )}
                        {providerSyncStatus === 'error' && providerSyncError && (
                          <p className="text-[11px] text-red-600 mt-1 line-clamp-2">
                            Error: {providerSyncError}
                          </p>
                        )}
                        {lastSynced && (
                          <p className="text-[11px] text-gray-500 text-right">
                            Last synced {lastSynced}
                          </p>
                        )}
                        <p
                          className={`text-[11px] ${
                            account.statement_snapshot ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {account.statement_snapshot
                            ? `Statements up to ${new Date(
                                account.statement_snapshot.statement_date
                              ).toLocaleDateString()}`
                            : 'Missing daily statements'}
                        </p>
                      </div>

                      {/* Sync Badge */}
                      {isSynced && providerSyncStatus !== 'error' && (
                        <div className="absolute top-2 right-2">
                          <div className="flex items-center gap-1 px-2 py-1 bg-green-600 rounded-full">
                            <div className="h-2 w-2 bg-white rounded-full animate-pulse"></div>
                            <span className="text-xs text-white font-medium">Synced</span>
                          </div>
                        </div>
                      )}
                      {isSynced && providerSyncStatus === 'error' && (
                        <div className="absolute top-2 right-2">
                          <div className="flex items-center gap-1 px-2 py-1 bg-red-600 rounded-full">
                            <div className="h-2 w-2 bg-white rounded-full animate-pulse"></div>
                            <span className="text-xs text-white font-medium">Sync issue</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <Landmark className="h-12 w-12 mx-auto mb-3 text-gray-400" />
              <p className="text-sm">No accounts linked to this entity</p>
            </div>
          )}
        </div>
      ))}

      {groupedData.length === 0 && (
        <div className="text-center py-12">
          <Building2 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Entities Found</h3>
          <p className="text-gray-600">Create an entity to organize your accounts.</p>
        </div>
      )}
    </div>
  );
}

