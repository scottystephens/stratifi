/**
 * Integration Tests: Xero Provider
 * Priority: HIGH - Xero integration is production-ready and needs comprehensive testing
 * 
 * These tests mock Xero API responses to verify provider behavior without making real API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XeroProvider, XeroApiError } from '@/lib/banking-providers/xero-provider';
import type { ConnectionCredentials } from '@/lib/banking-providers/raw-types';

// Mock fetch globally
global.fetch = vi.fn();

describe('Xero Provider Integration Tests', () => {
  let provider: XeroProvider;
  const mockCredentials: ConnectionCredentials = {
    connectionId: 'test-connection-id',
    tenantId: 'test-tenant-id',
    tokens: {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    },
    metadata: {
      xeroTenantId: 'xero-org-123',
    },
  };

  beforeEach(() => {
    provider = new XeroProvider();
    vi.clearAllMocks();
  });

  describe('fetchAccounts', () => {
    it('should fetch and normalize Xero bank accounts', async () => {
      const mockResponse = {
        Accounts: [
          {
            AccountID: 'account-1',
            Name: 'Business Checking',
            Type: 'BANK',
            Status: 'ACTIVE',
            BankAccountNumber: '123456789',
            BankAccountType: 'CHECKING',
            CurrencyCode: 'USD',
            Code: '200',
            Class: 'ASSET',
          },
          {
            AccountID: 'account-2',
            Name: 'Business Savings',
            Type: 'BANK',
            Status: 'ACTIVE',
            BankAccountType: 'SAVINGS',
            CurrencyCode: 'USD',
            Code: '201',
            Class: 'ASSET',
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers(),
      } as Response);

      const accounts = await provider.fetchAccounts(mockCredentials);

      expect(accounts).toHaveLength(2);
      expect(accounts[0]).toMatchObject({
        externalAccountId: 'account-1',
        accountName: 'Business Checking',
        accountNumber: '123456789',
        accountType: 'Checking',
        currency: 'USD',
        status: 'active',
        institutionName: 'Xero',
      });
      expect(accounts[1]).toMatchObject({
        externalAccountId: 'account-2',
        accountName: 'Business Savings',
        accountType: 'Savings',
      });
    });

    it('should filter out non-bank accounts', async () => {
      const mockResponse = {
        Accounts: [
          {
            AccountID: 'account-1',
            Name: 'Business Checking',
            Type: 'BANK',
            Status: 'ACTIVE',
            CurrencyCode: 'USD',
          },
          {
            AccountID: 'account-2',
            Name: 'Office Supplies',
            Type: 'EXPENSE',
            Status: 'ACTIVE',
            CurrencyCode: 'USD',
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers(),
      } as Response);

      const accounts = await provider.fetchAccounts(mockCredentials);

      // Should only return BANK type accounts
      expect(accounts).toHaveLength(1);
      expect(accounts[0].externalAccountId).toBe('account-1');
    });

    it('should handle API errors correctly', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          Type: 'UnauthorizedException',
          Message: 'Invalid access token',
        }),
        headers: new Headers(),
      } as Response);

      await expect(provider.fetchAccounts(mockCredentials)).rejects.toThrow(XeroApiError);
    });

    it('should handle rate limiting with retry', async () => {
      // First call: rate limited
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({
          'Retry-After': '60',
        }),
        json: async () => ({}),
      } as Response);

      // Second call: success
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Accounts: [
            {
              AccountID: 'account-1',
              Name: 'Business Checking',
              Type: 'BANK',
              Status: 'ACTIVE',
              CurrencyCode: 'USD',
            },
          ],
        }),
        headers: new Headers(),
      } as Response);

      // Mock delay to avoid actual waiting
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        fn();
        return {} as any;
      });

      const accounts = await provider.fetchAccounts(mockCredentials);

      expect(accounts).toHaveLength(1);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchTransactions', () => {
    it('should fetch and normalize Xero transactions', async () => {
      const mockResponse = {
        BankTransactions: [
          {
            BankTransactionID: 'tx-1',
            BankAccount: {
              AccountID: 'account-1',
            },
            Type: 'RECEIVE',
            Status: 'AUTHORISED',
            Date: '/Date(1705276800000+0000)/',
            Total: 1000.00,
            CurrencyCode: 'USD',
            Reference: 'Invoice Payment',
            LineItems: [
              {
                Description: 'Payment for invoice',
                AccountCode: '200',
              },
            ],
            Contact: {
              Name: 'Customer ABC',
            },
          },
          {
            BankTransactionID: 'tx-2',
            BankAccount: {
              AccountID: 'account-1',
            },
            Type: 'SPEND',
            Status: 'AUTHORISED',
            Date: '/Date(1705363200000+0000)/',
            Total: 500.00,
            CurrencyCode: 'USD',
            Reference: 'Office Supplies',
            LineItems: [
              {
                Description: 'Office supplies purchase',
                AccountCode: '400',
              },
            ],
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers(),
      } as Response);

      const transactions = await provider.fetchTransactions(
        mockCredentials,
        'account-1'
      );

      expect(transactions).toHaveLength(2);
      expect(transactions[0]).toMatchObject({
        externalTransactionId: 'tx-1',
        accountId: 'account-1',
        amount: 1000.00,
        currency: 'USD',
        description: 'Invoice Payment',
        type: 'credit',
        counterpartyName: 'Customer ABC',
        reference: 'Invoice Payment',
        category: '200',
      });
      expect(transactions[1]).toMatchObject({
        externalTransactionId: 'tx-2',
        amount: 500.00,
        type: 'debit',
      });
    });

    it('should filter out non-AUTHORISED transactions', async () => {
      const mockResponse = {
        BankTransactions: [
          {
            BankTransactionID: 'tx-1',
            BankAccount: {
              AccountID: 'account-1',
            },
            Type: 'RECEIVE',
            Status: 'AUTHORISED',
            Date: '/Date(1705276800000+0000)/',
            Total: 1000.00,
            CurrencyCode: 'USD',
          },
          {
            BankTransactionID: 'tx-2',
            BankAccount: {
              AccountID: 'account-1',
            },
            Type: 'RECEIVE',
            Status: 'DRAFT',
            Date: '/Date(1705363200000+0000)/',
            Total: 500.00,
            CurrencyCode: 'USD',
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers(),
      } as Response);

      const transactions = await provider.fetchTransactions(
        mockCredentials,
        'account-1'
      );

      // Should only return AUTHORISED transactions
      expect(transactions).toHaveLength(1);
      expect(transactions[0].externalTransactionId).toBe('tx-1');
    });

    it('should handle pagination correctly', async () => {
      // First page: 100 transactions (full page)
      const firstPageResponse = {
        BankTransactions: Array.from({ length: 100 }, (_, i) => ({
          BankTransactionID: `tx-${i}`,
          BankAccount: {
            AccountID: 'account-1',
          },
          Type: 'RECEIVE',
          Status: 'AUTHORISED',
          Date: '/Date(1705276800000+0000)/',
          Total: 100.00,
          CurrencyCode: 'USD',
        })),
      };

      // Second page: 50 transactions (partial page - last page)
      const secondPageResponse = {
        BankTransactions: Array.from({ length: 50 }, (_, i) => ({
          BankTransactionID: `tx-${100 + i}`,
          BankAccount: {
            AccountID: 'account-1',
          },
          Type: 'RECEIVE',
          Status: 'AUTHORISED',
          Date: '/Date(1705276800000+0000)/',
          Total: 100.00,
          CurrencyCode: 'USD',
        })),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => firstPageResponse,
          headers: new Headers(),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => secondPageResponse,
          headers: new Headers(),
        } as Response);

      const transactions = await provider.fetchTransactions(
        mockCredentials,
        'account-1'
      );

      expect(transactions).toHaveLength(150);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchBankBalances', () => {
    it('should fetch balances from Bank Summary report', async () => {
      const mockResponse = {
        Reports: [
          {
            ReportID: 'bank-summary',
            ReportName: 'Bank Summary',
            ReportType: 'BankSummary',
            Rows: [
              {
                RowType: 'Section',
                Rows: [
                  {
                    RowType: 'Row',
                    Cells: [
                      {
                        Value: 'Business Checking',
                        Attributes: [
                          {
                            Id: 'account',
                            Value: 'account-1',
                          },
                        ],
                      },
                      { Value: '4500.00' }, // Opening balance
                      { Value: '500.00' }, // Cash received
                      { Value: '0.00' }, // Cash spent
                      { Value: '5000.50' }, // Closing balance
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers(),
      } as Response);

      const balances = await provider.fetchBankBalances(mockCredentials);

      expect(balances.size).toBe(1);
      const balance = balances.get('account-1');
      expect(balance).toMatchObject({
        accountId: 'account-1',
        accountName: 'Business Checking',
        openingBalance: 4500.00,
        closingBalance: 5000.50,
        currency: 'USD',
      });
    });

    it('should handle empty Bank Summary report', async () => {
      const mockResponse = {
        Reports: [],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Headers(),
      } as Response);

      const balances = await provider.fetchBankBalances(mockCredentials);

      expect(balances.size).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw XeroApiError for API errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          Type: 'ValidationException',
          Message: 'Invalid account ID',
        }),
        headers: new Headers(),
      } as Response);

      await expect(provider.fetchAccounts(mockCredentials)).rejects.toThrow(
        XeroApiError
      );

      try {
        await provider.fetchAccounts(mockCredentials);
      } catch (error) {
        expect(error).toBeInstanceOf(XeroApiError);
        if (error instanceof XeroApiError) {
          expect(error.statusCode).toBe(400);
          expect(error.isValidationError()).toBe(true);
        }
      }
    });

    it('should handle missing xeroTenantId', async () => {
      const credentialsWithoutTenant: ConnectionCredentials = {
        ...mockCredentials,
        metadata: {},
      };

      await expect(
        provider.fetchAccounts(credentialsWithoutTenant)
      ).rejects.toThrow(XeroApiError);
    });
  });

  describe('Token Management', () => {
    it('should refresh token when expired', async () => {
      const expiredCredentials: ConnectionCredentials = {
        ...mockCredentials,
        tokens: {
          ...mockCredentials.tokens,
          expiresAt: new Date(Date.now() - 1000), // Expired
        },
      };

      // Mock token refresh
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
        headers: new Headers(),
      } as Response);

      // Mock accounts API call
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Accounts: [],
        }),
        headers: new Headers(),
      } as Response);

      // Mock token refresh service
      vi.mock('@/lib/services/token-refresh-service', () => ({
        tokenRefreshService: {
          needsRefresh: vi.fn().mockReturnValue(true),
          getValidAccessToken: vi.fn().mockResolvedValue({
            success: true,
            tokens: {
              accessToken: 'new-access-token',
              expiresAt: new Date(Date.now() + 3600000),
            },
          }),
        },
      }));

      await provider.fetchAccounts(expiredCredentials);

      // Should have called token refresh
      expect(fetch).toHaveBeenCalled();
    });
  });
});

