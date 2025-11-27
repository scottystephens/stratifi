/**
 * Test fixtures and utilities for Stratiri tests
 */

import { vi } from 'vitest';

// Mock Tenant Data
export const mockTenant1 = {
  id: 'test-tenant-1',
  name: 'Test Organization 1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const mockTenant2 = {
  id: 'test-tenant-2',
  name: 'Test Organization 2',
  created_at: '2024-01-02T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
};

// Mock User Data
export const mockUser1 = {
  id: 'test-user-1',
  email: 'user1@test.com',
  created_at: '2024-01-01T00:00:00Z',
};

export const mockUser2 = {
  id: 'test-user-2',
  email: 'user2@test.com',
  created_at: '2024-01-02T00:00:00Z',
};

// Mock Account Data
export const mockAccount = {
  id: 'test-account-1',
  tenant_id: 'test-tenant-1',
  account_name: 'Test Checking Account',
  account_number: '1234567890',
  currency: 'USD',
  account_type: 'checking',
  balance: 10000.50,
  bank_name: 'Test Bank',
  iban: 'US12345678901234567890',
  bic: 'TESTUS33',
  account_holder_name: 'Test User',
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const mockAccount2 = {
  id: 'test-account-2',
  tenant_id: 'test-tenant-2',
  account_name: 'Other Tenant Account',
  account_number: '9876543210',
  currency: 'EUR',
  account_type: 'savings',
  balance: 5000.00,
  created_at: '2024-01-02T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
};

// Mock Transaction Data
export const mockTransaction = {
  id: 'test-tx-1',
  account_id: 'test-account-1',
  tenant_id: 'test-tenant-1',
  amount: 100.50,
  currency: 'USD',
  transaction_date: '2024-01-15',
  description: 'Test Transaction',
  transaction_type: 'debit',
  status: 'completed',
  created_at: '2024-01-15T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
};

// Mock Connection Data
export const mockConnection = {
  id: 'test-connection-1',
  tenant_id: 'test-tenant-1',
  name: 'Test Bank Connection',
  connection_type: 'plaid',
  provider: 'plaid',
  status: 'active',
  config: {
    provider: 'plaid',
    environment: 'sandbox',
  },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

// Mock Standard Bank Credentials
export const mockStandardBankCredentials = {
  appId: 'sbx-app-12345',
  clientSecret: 'super-secret-client-secret',
  subscriptionKeyBalances: 'balance-subscription-key-abc123',
  subscriptionKeyTransactions: 'transaction-subscription-key-def456',
  subscriptionKeyPayments: 'payment-subscription-key-ghi789',
  businessUnitId: 'BU-12345',
};

// Mock Supabase Response
export function mockSupabaseQuery<T>(data: T, error: any = null) {
  return {
    data,
    error,
    count: Array.isArray(data) ? data.length : null,
    status: error ? 400 : 200,
    statusText: error ? 'Bad Request' : 'OK',
  };
}

// Mock Supabase Client with customizable responses
export function createMockSupabaseClient(options?: {
  insertResponse?: any;
  updateResponse?: any;
  deleteResponse?: any;
  selectResponse?: any;
}) {
  const defaultInsertResponse = (data: any) => mockSupabaseQuery(data);
  const defaultUpdateResponse = () => mockSupabaseQuery({ success: true });
  const defaultDeleteResponse = () => mockSupabaseQuery({ success: true });
  const defaultSelectResponse = () => mockSupabaseQuery([mockAccount]);

  // Allow custom responses or use defaults
  const getInsertResponse = options?.insertResponse || defaultInsertResponse;
  const getUpdateResponse = options?.updateResponse || defaultUpdateResponse;
  const getDeleteResponse = options?.deleteResponse || defaultDeleteResponse;
  const getSelectResponse = options?.selectResponse || defaultSelectResponse;

  // Create mock methods that return promises for terminal operations
  const mockSingle = vi.fn().mockResolvedValue(
    typeof getSelectResponse === 'function' ? getSelectResponse() : getSelectResponse
  );
  const mockMaybeSingle = vi.fn().mockResolvedValue(
    typeof getSelectResponse === 'function' ? getSelectResponse() : getSelectResponse
  );
  
  // Track number of .eq() calls to know when to return a promise
  let eqCallCount = 0;
  let currentOperation: 'select' | 'insert' | 'update' | 'delete' | null = null;
  let currentData: any = null;
  
  // Create a chainable query builder object
  const createQueryBuilder = () => {
    eqCallCount = 0; // Reset for each new query
    
    const builder: any = {
      select: vi.fn((...args: any[]) => {
        currentOperation = 'select';
        eqCallCount = 0;
        return builder;
      }),
      insert: vi.fn((data: any) => {
        currentOperation = 'insert';
        currentData = data;
        eqCallCount = 0;
        // INSERT returns a promise immediately
        return Promise.resolve(typeof getInsertResponse === 'function' 
          ? getInsertResponse(data) 
          : getInsertResponse);
      }),
      update: vi.fn((data: any) => {
        currentOperation = 'update';
        currentData = data;
        eqCallCount = 0;
        return builder;
      }),
      delete: vi.fn(() => {
        currentOperation = 'delete';
        eqCallCount = 0;
        return builder;
      }),
      eq: vi.fn((column: string, value: any) => {
        eqCallCount++;
        
        // For SELECT, allow chaining for .single() or make builder awaitable
        if (currentOperation === 'select') {
          // Make builder thenable so it can be awaited
          builder.then = (resolve?: (value: any) => any, reject?: (reason: any) => any) => {
            const result = typeof getSelectResponse === 'function' 
              ? getSelectResponse() 
              : getSelectResponse;
            return Promise.resolve(result).then(resolve, reject);
          };
          return builder;
        }
        
        // For UPDATE/DELETE, if this is the second .eq() call, return a promise
        if ((currentOperation === 'update' || currentOperation === 'delete') && eqCallCount >= 2) {
          const response = currentOperation === 'update' 
            ? (typeof getUpdateResponse === 'function' 
                ? getUpdateResponse(currentData) 
                : getUpdateResponse)
            : (typeof getDeleteResponse === 'function' 
                ? getDeleteResponse() 
                : getDeleteResponse);
          return Promise.resolve(response);
        }
        
        // Otherwise, continue chaining
        return builder;
      }),
      in: vi.fn((column: string, values: any[]) => {
        return builder;
      }),
      single: mockSingle,
      maybeSingle: mockMaybeSingle,
    };
    return builder;
  };

  // Create mock methods that can be accessed directly for assertions
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockIn = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();

  return {
    from: vi.fn(() => createQueryBuilder()),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: mockUser1 },
        error: null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: mockUser1, session: {} },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'new-user-id',
            email: 'newuser@test.com',
            created_at: new Date().toISOString(),
          },
          session: null,
        },
        error: null,
      }),
      verifyOtp: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'user-id',
            email: 'user@test.com',
            email_confirmed_at: new Date().toISOString(),
          },
          session: { access_token: 'token' },
        },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'mock-token',
            refresh_token: 'mock-refresh',
            expires_at: Date.now() + 3600000,
            user: mockUser1,
          },
        },
        error: null,
      }),
      refreshSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'new-token',
            refresh_token: 'new-refresh',
            expires_at: Date.now() + 3600000,
            user: mockUser1,
          },
        },
        error: null,
      }),
    },
    mockSelect,
    mockEq,
    mockIn,
    mockInsert,
    mockUpdate,
    mockDelete,
    mockSingle,
    mockMaybeSingle,
  };
}

// Wait for async operations
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

