import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface AccountStatementResponse {
  statements: any[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

export interface StatementQueryOptions {
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export const statementKeys = {
  all: ['statements'] as const,
  lists: () => [...statementKeys.all, 'list'] as const,
  list: (tenantId: string, accountId: string) =>
    [...statementKeys.lists(), tenantId, accountId] as const,
};

async function fetchAccountStatements(
  tenantId: string,
  accountId: string,
  options?: StatementQueryOptions
) {
  const params = new URLSearchParams({
    tenantId,
    ...(options?.startDate && { startDate: options.startDate }),
    ...(options?.endDate && { endDate: options.endDate }),
    ...(options?.page && { page: String(options.page) }),
    ...(options?.pageSize && { pageSize: String(options.pageSize) }),
  });

  const response = await fetch(`/api/accounts/${accountId}/statements?${params.toString()}`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch statements');
  }

  return data as AccountStatementResponse;
}

export function useAccountStatements(
  tenantId: string | undefined,
  accountId: string | undefined,
  options?: StatementQueryOptions
) {
  return useQuery({
    queryKey: [...statementKeys.list(tenantId || '', accountId || ''), options],
    queryFn: () => fetchAccountStatements(tenantId!, accountId!, options),
    enabled: !!tenantId && !!accountId,
    staleTime: 30 * 1000,
  });
}

export function useCreateStatement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      tenantId: string;
      accountId: string;
      statementDate: string;
      endingBalance: number;
      availableBalance?: number | null;
      currency?: string;
      source?: 'synced' | 'calculated' | 'manual' | 'imported';
      confidence?: 'high' | 'medium' | 'low';
      metadata?: Record<string, any>;
    }) => {
      const response = await fetch(`/api/accounts/${payload.accountId}/statements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create statement');
      }

      return data.statement;
    },
    onSuccess: (_data, variables) => {
      toast.success('Statement saved');
      queryClient.invalidateQueries({
        queryKey: statementKeys.list(variables.tenantId, variables.accountId),
      });
    },
    onError: (error: any) => {
      toast.error('Failed to save statement', {
        description: error?.message,
      });
    },
  });
}

export function useImportStatements() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      tenantId: string;
      accountId: string;
      csvData: string;
      mode?: 'validate' | 'import';
    }) => {
      const response = await fetch(`/api/accounts/${payload.accountId}/statements/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Failed to process statements CSV');
      }

      return data;
    },
    onSuccess: (data, variables) => {
      if (data?.results?.imported) {
        toast.success(`Imported ${data.results.imported} statement(s)`);
        queryClient.invalidateQueries({
          queryKey: statementKeys.list(variables.tenantId, variables.accountId),
        });
      } else {
        toast.info('Validation complete', {
          description: data?.validation
            ? `${data.validation.rowCount} rows checked`
            : 'Review CSV results',
        });
      }
    },
    onError: (error: any) => {
      toast.error('Statement import failed', {
        description: error?.message,
      });
    },
  });
}

export function useImportTransactions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      tenantId: string;
      accountId: string;
      csvData: string;
      mode?: 'validate' | 'import';
    }) => {
      const response = await fetch(`/api/accounts/${payload.accountId}/transactions/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Failed to process transactions CSV');
      }

      return data;
    },
    onSuccess: (data, variables) => {
      if (data?.results?.imported) {
        toast.success(`Imported ${data.results.imported} transaction(s)`);
        queryClient.invalidateQueries({
          predicate: ({ queryKey }) =>
            Array.isArray(queryKey) && queryKey.includes(variables.accountId),
        });
      } else {
        toast.info('Validation complete', {
          description: data?.validation
            ? `${data.validation.rowCount} rows checked`
            : 'Review CSV results',
        });
      }
    },
    onError: (error: any) => {
      toast.error('Transaction import failed', {
        description: error?.message,
      });
    },
  });
}

