-- Migration: Enhance Transactions Table
-- Purpose: Add extended fields for bank transaction standards
-- Date: 2024-11-14
-- Dependencies: Requires transactions table from previous migrations

-- ============================================================
-- 1. ADD EXTENDED TRANSACTION FIELDS
-- ============================================================

-- Extended Fields
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  running_balance DECIMAL(19, 4);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  reference_number VARCHAR(100);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  check_number VARCHAR(20);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  counterparty_name VARCHAR(255);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  counterparty_account VARCHAR(100);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  bank_reference VARCHAR(100);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  transaction_code VARCHAR(10);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  memo TEXT;

-- ============================================================
-- 2. ADD ENHANCED TRANSACTION FIELDS
-- ============================================================

-- Categorization
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  category VARCHAR(100);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  sub_category VARCHAR(100);

-- Merchant Data
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  merchant_name VARCHAR(255);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  merchant_category_code VARCHAR(4);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  location VARCHAR(255);

-- Foreign Exchange
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  original_amount DECIMAL(19, 4);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  original_currency VARCHAR(3);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  exchange_rate DECIMAL(19, 8);

-- Fees and Taxes
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  fee_amount DECIMAL(19, 4);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  tax_amount DECIMAL(19, 4);

-- ============================================================
-- 3. ADD METADATA FIELDS
-- ============================================================

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  reconciliation_status VARCHAR(20) DEFAULT 'pending';

-- Ensure raw_data exists (may already exist from earlier migration)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS 
  raw_data JSONB;

-- ============================================================
-- 4. CREATE ADDITIONAL INDEXES
-- ============================================================

-- Index for reference number lookups (reconciliation)
CREATE INDEX IF NOT EXISTS idx_transactions_reference 
  ON public.transactions(reference_number) 
  WHERE reference_number IS NOT NULL;

-- Index for check number lookups
CREATE INDEX IF NOT EXISTS idx_transactions_check_number 
  ON public.transactions(check_number) 
  WHERE check_number IS NOT NULL;

-- Index for counterparty searches
CREATE INDEX IF NOT EXISTS idx_transactions_counterparty 
  ON public.transactions(counterparty_name) 
  WHERE counterparty_name IS NOT NULL;

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_transactions_category 
  ON public.transactions(category) 
  WHERE category IS NOT NULL;

-- Index for reconciliation status
CREATE INDEX IF NOT EXISTS idx_transactions_reconciliation 
  ON public.transactions(reconciliation_status);

-- Composite index for merchant searches
CREATE INDEX IF NOT EXISTS idx_transactions_merchant 
  ON public.transactions(merchant_name, merchant_category_code) 
  WHERE merchant_name IS NOT NULL;

-- Index for transaction code (BAI2/SWIFT codes)
CREATE INDEX IF NOT EXISTS idx_transactions_code 
  ON public.transactions(transaction_code) 
  WHERE transaction_code IS NOT NULL;

-- ============================================================
-- 5. ADD COMMENTS
-- ============================================================

COMMENT ON COLUMN public.transactions.running_balance IS 
  'Account balance after this transaction (if provided by bank)';

COMMENT ON COLUMN public.transactions.reference_number IS 
  'Bank reference or trace number for reconciliation';

COMMENT ON COLUMN public.transactions.check_number IS 
  'Check number for check transactions';

COMMENT ON COLUMN public.transactions.counterparty_name IS 
  'Name of the other party in the transaction';

COMMENT ON COLUMN public.transactions.counterparty_account IS 
  'Account number of the other party (if available)';

COMMENT ON COLUMN public.transactions.bank_reference IS 
  'Bank internal reference for inquiries';

COMMENT ON COLUMN public.transactions.transaction_code IS 
  'BAI2, SWIFT, or other format-specific transaction code';

COMMENT ON COLUMN public.transactions.category IS 
  'Transaction category for reporting (e.g., Payroll, Utilities)';

COMMENT ON COLUMN public.transactions.sub_category IS 
  'Sub-category for finer classification';

COMMENT ON COLUMN public.transactions.merchant_name IS 
  'Merchant name from card networks';

COMMENT ON COLUMN public.transactions.merchant_category_code IS 
  'ISO 18245 MCC code (e.g., 5812 for Restaurants)';

COMMENT ON COLUMN public.transactions.location IS 
  'Geographic location of transaction';

COMMENT ON COLUMN public.transactions.original_amount IS 
  'Transaction amount in original currency (for FX transactions)';

COMMENT ON COLUMN public.transactions.original_currency IS 
  'Original currency code (ISO 4217) for FX transactions';

COMMENT ON COLUMN public.transactions.exchange_rate IS 
  'Exchange rate applied for currency conversion';

COMMENT ON COLUMN public.transactions.fee_amount IS 
  'Transaction fees charged';

COMMENT ON COLUMN public.transactions.tax_amount IS 
  'Tax portion of transaction (sales tax, VAT, etc.)';

COMMENT ON COLUMN public.transactions.reconciliation_status IS 
  'Reconciliation status: pending, matched, unmatched, reviewed';

-- ============================================================
-- 6. CREATE HELPER FUNCTIONS
-- ============================================================

-- Function to calculate net amount (amount - fees - taxes)
CREATE OR REPLACE FUNCTION public.calculate_net_transaction_amount(
  p_amount DECIMAL(19, 4),
  p_fee_amount DECIMAL(19, 4),
  p_tax_amount DECIMAL(19, 4)
)
RETURNS DECIMAL(19, 4)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p_amount - COALESCE(p_fee_amount, 0) - COALESCE(p_tax_amount, 0);
END;
$$;

COMMENT ON FUNCTION public.calculate_net_transaction_amount IS 
  'Calculate net transaction amount after fees and taxes';

-- Function to get transaction by reference number
CREATE OR REPLACE FUNCTION public.get_transaction_by_reference(
  p_tenant_id UUID,
  p_reference_number VARCHAR(100)
)
RETURNS TABLE (
  id UUID,
  account_id UUID,
  transaction_date DATE,
  amount DECIMAL(19, 4),
  description TEXT,
  reference_number VARCHAR(100)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.account_id,
    t.transaction_date,
    t.amount,
    t.description,
    t.reference_number
  FROM public.transactions t
  WHERE t.tenant_id = p_tenant_id
    AND t.reference_number = p_reference_number;
END;
$$;

COMMENT ON FUNCTION public.get_transaction_by_reference IS 
  'Look up transaction by reference number for reconciliation';

-- ============================================================
-- 7. CREATE VIEWS FOR COMMON QUERIES
-- ============================================================

-- View: Unreconciled Transactions
CREATE OR REPLACE VIEW public.unreconciled_transactions AS
SELECT 
  t.id,
  t.tenant_id,
  t.account_id,
  a.account_name,
  a.account_number,
  t.transaction_date,
  t.amount,
  t.currency,
  t.description,
  t.transaction_type,
  t.reference_number,
  t.counterparty_name,
  t.reconciliation_status,
  t.created_at
FROM public.transactions t
JOIN public.accounts a ON t.account_id = a.id
WHERE t.reconciliation_status IN ('pending', 'unmatched');

COMMENT ON VIEW public.unreconciled_transactions IS 
  'View of transactions that need reconciliation';

-- View: Transactions by Category
CREATE OR REPLACE VIEW public.transactions_by_category AS
SELECT 
  t.tenant_id,
  t.account_id,
  t.category,
  t.sub_category,
  COUNT(*) as transaction_count,
  SUM(t.amount) as total_amount,
  AVG(t.amount) as average_amount,
  MIN(t.transaction_date) as first_transaction_date,
  MAX(t.transaction_date) as last_transaction_date
FROM public.transactions t
WHERE t.category IS NOT NULL
GROUP BY t.tenant_id, t.account_id, t.category, t.sub_category;

COMMENT ON VIEW public.transactions_by_category IS 
  'Summary of transactions grouped by category';

-- ============================================================
-- 8. ADD CHECK CONSTRAINTS
-- ============================================================

-- Ensure reconciliation status is valid
ALTER TABLE public.transactions 
  DROP CONSTRAINT IF EXISTS transactions_reconciliation_status_check;

ALTER TABLE public.transactions 
  ADD CONSTRAINT transactions_reconciliation_status_check 
  CHECK (reconciliation_status IN ('pending', 'matched', 'unmatched', 'reviewed', 'ignored'));

-- Ensure MCC code is 4 digits if provided
ALTER TABLE public.transactions 
  DROP CONSTRAINT IF EXISTS transactions_mcc_check;

ALTER TABLE public.transactions 
  ADD CONSTRAINT transactions_mcc_check 
  CHECK (merchant_category_code IS NULL OR LENGTH(merchant_category_code) = 4);

-- Ensure exchange rate is positive if provided
ALTER TABLE public.transactions 
  DROP CONSTRAINT IF EXISTS transactions_exchange_rate_check;

ALTER TABLE public.transactions 
  ADD CONSTRAINT transactions_exchange_rate_check 
  CHECK (exchange_rate IS NULL OR exchange_rate > 0);

-- ============================================================
-- 9. GRANT PERMISSIONS TO VIEWS
-- ============================================================

GRANT SELECT ON public.unreconciled_transactions TO authenticated;
GRANT SELECT ON public.transactions_by_category TO authenticated;

-- ============================================================
-- SUCCESS
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Transactions table enhanced successfully';
  RAISE NOTICE '✅ Added extended fields: reference_number, check_number, counterparty, etc.';
  RAISE NOTICE '✅ Added enhanced fields: category, merchant_name, FX data, etc.';
  RAISE NOTICE '✅ Created indexes for performance';
  RAISE NOTICE '✅ Added helper functions and views';
  RAISE NOTICE '';
  RAISE NOTICE '📊 New capabilities:';
  RAISE NOTICE '  - Transaction reconciliation';
  RAISE NOTICE '  - Category-based reporting';
  RAISE NOTICE '  - Merchant tracking';
  RAISE NOTICE '  - FX transaction support';
  RAISE NOTICE '  - Enhanced search and filtering';
END $$;

