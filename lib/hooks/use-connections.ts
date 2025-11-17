import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * Query key factory for connections
 */
export const connectionKeys = {
  all: ['connections'] as const,
  lists: () => [...connectionKeys.all, 'list'] as const,
  list: (tenantId: string) => [...connectionKeys.lists(), tenantId] as const,
  details: () => [...connectionKeys.all, 'detail'] as const,
  detail: (tenantId: string, connectionId: string) => [...connectionKeys.details(), tenantId, connectionId] as const,
};

/**
 * Fetch connections for a tenant
 */
async function fetchConnections(tenantId: string) {
  const response = await fetch(`/api/connections?tenantId=${tenantId}`);
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch connections');
  }
  
  return data.connections || [];
}

/**
 * Fetch a single connection
 */
async function fetchConnection(tenantId: string, connectionId: string) {
  const response = await fetch(`/api/connections?tenantId=${tenantId}&id=${connectionId}`);
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch connection');
  }
  
  return data.connection;
}

/**
 * Hook to fetch connections with caching
 */
export function useConnections(tenantId: string | undefined) {
  return useQuery({
    queryKey: connectionKeys.list(tenantId || ''),
    queryFn: () => {
      if (!tenantId) {
        throw new Error('Tenant ID is required');
      }
      return fetchConnections(tenantId);
    },
    enabled: !!tenantId && tenantId !== '',
    staleTime: 60 * 1000, // Connections are fresh for 1 minute
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    retry: 2, // Retry failed queries 2 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });
}

/**
 * Hook to fetch a single connection
 */
export function useConnection(tenantId: string | undefined, connectionId: string | undefined) {
  return useQuery({
    queryKey: connectionKeys.detail(tenantId || '', connectionId || ''),
    queryFn: () => {
      if (!tenantId || !connectionId) {
        throw new Error('Tenant ID and Connection ID are required');
      }
      return fetchConnection(tenantId, connectionId);
    },
    enabled: !!tenantId && !!connectionId && tenantId !== '' && connectionId !== '',
    staleTime: 30 * 1000, // Connection details are fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 2, // Retry failed queries 2 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });
}

/**
 * Hook to sync a connection
 */
export function useSyncConnection() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      provider,
      connectionId,
      tenantId,
      forceSync = true,
    }: {
      provider: string;
      connectionId: string;
      tenantId: string;
      forceSync?: boolean;
    }) => {
      const response = await fetch(`/api/banking/${provider}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          tenantId,
          syncAccounts: true,
          syncTransactions: true,
          forceSync,
        }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Sync failed');
      }
      
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate all related queries to refresh UI
      queryClient.invalidateQueries({
        queryKey: connectionKeys.detail(variables.tenantId, variables.connectionId),
      });
      // Invalidate accounts list (new accounts might have been created)
      queryClient.invalidateQueries({
        queryKey: ['accounts', 'list', variables.tenantId],
      });
      // Invalidate transactions for all accounts (new transactions might have been imported)
      queryClient.invalidateQueries({
        queryKey: ['transactions'],
      });
      // Invalidate dashboard data
      queryClient.invalidateQueries({
        queryKey: ['dashboard'],
      });
      
      // Refetch immediately to update UI
      queryClient.refetchQueries({
        queryKey: ['accounts', 'list', variables.tenantId],
      });
      queryClient.refetchQueries({
        queryKey: connectionKeys.detail(variables.tenantId, variables.connectionId),
      });
      
      const accountsCount = data.summary?.accountsSynced || 0;
      const transactionsCount = data.summary?.transactionsSynced || 0;
      
      toast.success('Sync complete!', {
        description: `${accountsCount} accounts synced, ${transactionsCount} transactions imported`,
      });
    },
    onError: (error) => {
      toast.error('Sync failed', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    },
  });
}

/**
 * Hook to delete a connection
 */
export function useDeleteConnection() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ connectionId, tenantId }: { connectionId: string; tenantId: string }) => {
      const response = await fetch(`/api/connections?id=${connectionId}&tenantId=${tenantId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete connection');
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate connections list
      queryClient.invalidateQueries({ queryKey: connectionKeys.list(variables.tenantId) });
      toast.success('Connection deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete connection', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

