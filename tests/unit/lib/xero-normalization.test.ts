/**
 * Test: Xero Normalization Service
 * Priority: HIGH - Xero integration is production-ready and needs robust testing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizationService } from '@/lib/services/normalization-service';
import { supabase } from '@/lib/supabase';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('Xero Normalization Service', () => {
  const mockConnectionId = 'test-connection-id';
  const mockTenantId = 'test-tenant-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeXeroAccounts', () => {
    it('should normalize Xero bank accounts correctly', async () => {
      const mockRawAccounts = [
        {
          id: '1',
          connection_id: mockConnectionId,
          tenant_id: mockTenantId,
          account_id: 'xero-account-1',
          xero_tenant_id: 'xero-org-123',
          raw_account_data: {
            AccountID: 'xero-account-1',
            Name: 'Business Checking',
            Type: 'BANK',
            Status: 'ACTIVE',
            BankAccountNumber: '123456789',
            BankAccountType: 'CHECKING',
            CurrencyCode: 'USD',
            Code: '200',
            Class: 'ASSET',
          },
        },
        {
          id: '2',
          connection_id: mockConnectionId,
          tenant_id: mockTenantId,
          account_id: 'xero-account-2',
          xero_tenant_id: 'xero-org-123',
          raw_account_data: {
            AccountID: 'xero-account-2',
            Name: 'Business Savings',
            Type: 'BANK',
            Status: 'ACTIVE',
            BankAccountType: 'SAVINGS',
            CurrencyCode: 'USD',
            Code: '201',
            Class: 'ASSET',
          },
        },
        {
          id: '3',
          connection_id: mockConnectionId,
          tenant_id: mockTenantId,
          account_id: 'xero-account-3',
          xero_tenant_id: 'xero-org-123',
          raw_account_data: {
            AccountID: 'xero-account-3',
            Name: 'Credit Card',
            Type: 'BANK',
            Status: 'ACTIVE',
            BankAccountType: 'CREDITCARD',
            CurrencyCode: 'USD',
            Code: '202',
            Class: 'LIABILITY',
          },
        },
        // Non-bank account (should be filtered out)
        {
          id: '4',
          connection_id: mockConnectionId,
          tenant_id: mockTenantId,
          account_id: 'xero-account-4',
          xero_tenant_id: 'xero-org-123',
          raw_account_data: {
            AccountID: 'xero-account-4',
            Name: 'Office Supplies',
            Type: 'EXPENSE',
            Status: 'ACTIVE',
            CurrencyCode: 'USD',
            Code: '400',
            Class: 'EXPENSE',
          },
        },
      ];

      const mockBalances = [
        {
          account_id: 'xero-account-1',
          closing_balance: 5000.50,
          opening_balance: 4500.00,
          balance_date: '2024-01-15',
        },
        {
          account_id: 'xero-account-2',
          closing_balance: 10000.00,
          opening_balance: 9500.00,
          balance_date: '2024-01-15',
        },
      ];

      // Mock Supabase queries
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockReturnThis();

      mockSelect.mockResolvedValueOnce({ data: mockRawAccounts, error: null });
      mockSelect.mockResolvedValueOnce({ data: mockBalances, error: null });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        order: mockOrder,
      } as any);

      const normalized = await normalizationService.normalizeXeroAccounts(
        mockConnectionId,
        mockTenantId
      );

      // Should only return BANK type accounts
      expect(normalized).toHaveLength(3);
      
      // Check first account (checking)
      expect(normalized[0]).toMatchObject({
        externalAccountId: 'xero-account-1',
        accountName: 'Business Checking',
        accountNumber: '123456789',
        accountType: 'checking',
        currency: 'USD',
        balance: 5000.50,
        status: 'active',
        institutionName: 'Xero',
      });
      expect(normalized[0].metadata).toMatchObject({
        xero_account_id: 'xero-account-1',
        code: '200',
        type: 'BANK',
        class: 'ASSET',
        bank_account_type: 'CHECKING',
        xero_tenant_id: 'xero-org-123',
        closing_balance: 5000.50,
        opening_balance: 4500.00,
      });

      // Check second account (savings)
      expect(normalized[1]).toMatchObject({
        externalAccountId: 'xero-account-2',
        accountName: 'Business Savings',
        accountType: 'savings',
        balance: 10000.00,
      });

      // Check third account (credit card)
      expect(normalized[2]).toMatchObject({
        externalAccountId: 'xero-account-3',
        accountName: 'Credit Card',
        accountType: 'credit_card',
      });
    });

    it('should handle accounts without balances', async () => {
      const mockRawAccounts = [
        {
          id: '1',
          connection_id: mockConnectionId,
          tenant_id: mockTenantId,
          account_id: 'xero-account-1',
          xero_tenant_id: 'xero-org-123',
          raw_account_data: {
            AccountID: 'xero-account-1',
            Name: 'Business Checking',
            Type: 'BANK',
            Status: 'ACTIVE',
            CurrencyCode: 'USD',
          },
        },
      ];

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockReturnThis();

      mockSelect.mockResolvedValueOnce({ data: mockRawAccounts, error: null });
      mockSelect.mockResolvedValueOnce({ data: [], error: null }); // No balances

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        order: mockOrder,
      } as any);

      const normalized = await normalizationService.normalizeXeroAccounts(
        mockConnectionId,
        mockTenantId
      );

      expect(normalized).toHaveLength(1);
      expect(normalized[0].balance).toBe(0); // Default balance when none found
    });

    it('should filter out inactive accounts', async () => {
      const mockRawAccounts = [
        {
          id: '1',
          connection_id: mockConnectionId,
          tenant_id: mockTenantId,
          account_id: 'xero-account-1',
          xero_tenant_id: 'xero-org-123',
          raw_account_data: {
            AccountID: 'xero-account-1',
            Name: 'Inactive Account',
            Type: 'BANK',
            Status: 'ARCHIVED',
            CurrencyCode: 'USD',
          },
        },
      ];

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockReturnThis();

      mockSelect.mockResolvedValueOnce({ data: mockRawAccounts, error: null });
      mockSelect.mockResolvedValueOnce({ data: [], error: null });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        order: mockOrder,
      } as any);

      const normalized = await normalizationService.normalizeXeroAccounts(
        mockConnectionId,
        mockTenantId
      );

      // Should filter out ARCHIVED accounts
      expect(normalized).toHaveLength(0);
    });
  });

  describe('normalizeXeroTransactions', () => {
    it('should normalize Xero transactions correctly', async () => {
      const mockRawTransactions = [
        {
          id: '1',
          connection_id: mockConnectionId,
          tenant_id: mockTenantId,
          transaction_id: 'xero-tx-1',
          account_id: 'xero-account-1',
          xero_tenant_id: 'xero-org-123',
          raw_transaction_data: {
            BankTransactionID: 'xero-tx-1',
            BankAccount: {
              AccountID: 'xero-account-1',
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
        },
        {
          id: '2',
          connection_id: mockConnectionId,
          tenant_id: mockTenantId,
          transaction_id: 'xero-tx-2',
          account_id: 'xero-account-1',
          xero_tenant_id: 'xero-org-123',
          raw_transaction_data: {
            BankTransactionID: 'xero-tx-2',
            BankAccount: {
              AccountID: 'xero-account-1',
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
        },
        // Should be filtered out (not AUTHORISED or SUBMITTED)
        {
          id: '3',
          connection_id: mockConnectionId,
          tenant_id: mockTenantId,
          transaction_id: 'xero-tx-3',
          account_id: 'xero-account-1',
          xero_tenant_id: 'xero-org-123',
          raw_transaction_data: {
            BankTransactionID: 'xero-tx-3',
            BankAccount: {
              AccountID: 'xero-account-1',
            },
            Type: 'RECEIVE',
            Status: 'DRAFT',
            Date: '/Date(1705449600000+0000)/',
            Total: 200.00,
            CurrencyCode: 'USD',
          },
        },
      ];

      const mockAccounts = [
        {
          account_id: 'internal-account-1',
          external_account_id: 'xero-account-1',
        },
      ];

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();

      mockSelect.mockResolvedValueOnce({ data: mockRawTransactions, error: null });
      mockSelect.mockResolvedValueOnce({ data: mockAccounts, error: null });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
      } as any);

      const normalized = await normalizationService.normalizeXeroTransactions(
        mockConnectionId
      );

      // Should only return AUTHORISED transactions
      expect(normalized).toHaveLength(2);

      // Check first transaction (credit/RECEIVE)
      expect(normalized[0]).toMatchObject({
        externalTransactionId: 'xero-tx-1',
        accountId: 'internal-account-1',
        amount: 1000.00,
        currency: 'USD',
        description: 'Invoice Payment',
        type: 'credit',
        status: 'posted',
        counterpartyName: 'Customer ABC',
        reference: 'Invoice Payment',
        category: '200',
      });
      expect(normalized[0].metadata).toMatchObject({
        xero_transaction_id: 'xero-tx-1',
        xero_tenant_id: 'xero-org-123',
        type: 'RECEIVE',
        status: 'AUTHORISED',
        total: 1000.00,
      });

      // Check second transaction (debit/SPEND)
      expect(normalized[1]).toMatchObject({
        externalTransactionId: 'xero-tx-2',
        accountId: 'internal-account-1',
        amount: 500.00,
        type: 'debit',
        description: 'Office Supplies',
      });
    });

    it('should handle transactions without account mapping', async () => {
      const mockRawTransactions = [
        {
          id: '1',
          connection_id: mockConnectionId,
          tenant_id: mockTenantId,
          transaction_id: 'xero-tx-1',
          account_id: 'xero-account-unknown',
          xero_tenant_id: 'xero-org-123',
          raw_transaction_data: {
            BankTransactionID: 'xero-tx-1',
            BankAccount: {
              AccountID: 'xero-account-unknown',
            },
            Type: 'RECEIVE',
            Status: 'AUTHORISED',
            Date: '/Date(1705276800000+0000)/',
            Total: 1000.00,
            CurrencyCode: 'USD',
          },
        },
      ];

      const mockAccounts: any[] = []; // No matching account

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();

      mockSelect.mockResolvedValueOnce({ data: mockRawTransactions, error: null });
      mockSelect.mockResolvedValueOnce({ data: mockAccounts, error: null });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
      } as any);

      const normalized = await normalizationService.normalizeXeroTransactions(
        mockConnectionId
      );

      // Should filter out transactions without account mapping
      expect(normalized).toHaveLength(0);
    });

    it('should parse Xero date format correctly', async () => {
      const mockRawTransactions = [
        {
          id: '1',
          connection_id: mockConnectionId,
          tenant_id: mockTenantId,
          transaction_id: 'xero-tx-1',
          account_id: 'xero-account-1',
          xero_tenant_id: 'xero-org-123',
          raw_transaction_data: {
            BankTransactionID: 'xero-tx-1',
            BankAccount: {
              AccountID: 'xero-account-1',
            },
            Type: 'RECEIVE',
            Status: 'AUTHORISED',
            Date: '/Date(1705276800000+0000)/', // Xero date format
            DateString: '2024-01-15', // Alternative format
            Total: 1000.00,
            CurrencyCode: 'USD',
          },
        },
      ];

      const mockAccounts = [
        {
          account_id: 'internal-account-1',
          external_account_id: 'xero-account-1',
        },
      ];

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();

      mockSelect.mockResolvedValueOnce({ data: mockRawTransactions, error: null });
      mockSelect.mockResolvedValueOnce({ data: mockAccounts, error: null });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
      } as any);

      const normalized = await normalizationService.normalizeXeroTransactions(
        mockConnectionId
      );

      expect(normalized).toHaveLength(1);
      // Date should be parsed correctly
      expect(normalized[0].date).toBeInstanceOf(Date);
      expect(normalized[0].date.getTime()).toBeGreaterThan(0);
    });
  });
});

