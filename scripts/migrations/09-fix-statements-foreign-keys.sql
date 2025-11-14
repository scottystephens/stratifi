-- Migration: Fix Statements Table Foreign Keys
-- Purpose: Correct account_id type mismatch and fix views
-- Date: 2024-11-14

-- ============================================================
-- 1. FIX STATEMENTS TABLE FOREIGN KEY
-- ============================================================

-- Drop existing foreign key
ALTER TABLE public.statements 
  DROP CONSTRAINT IF EXISTS statements_account_id_fkey;

-- Change account_id from UUID to TEXT to match accounts table
ALTER TABLE public.statements 
  ALTER COLUMN account_id TYPE TEXT;

-- Re-add foreign key with correct type
ALTER TABLE public.statements
  ADD CONSTRAINT statements_account_id_fkey 
  FOREIGN KEY (account_id) 
  REFERENCES public.accounts(account_id) 
  ON DELETE CASCADE;

-- ============================================================
-- 2. FIX UNRECONCILED TRANSACTIONS VIEW
-- ============================================================

DROP VIEW IF EXISTS public.unreconciled_transactions;

CREATE VIEW public.unreconciled_transactions AS
SELECT 
  t.transaction_id as id,
  t.tenant_id,
  t.account_id,
  a.account_name,
  a.account_number,
  t.date as transaction_date,
  t.amount,
  t.currency,
  t.description,
  t.type as transaction_type,
  t.reference_number,
  t.counterparty_name,
  t.reconciliation_status,
  t.created_at
FROM public.transactions t
JOIN public.accounts a ON t.account_id = a.account_id
WHERE t.reconciliation_status IN ('pending', 'unmatched');

COMMENT ON VIEW public.unreconciled_transactions IS 
  'View of transactions that need reconciliation';

GRANT SELECT ON public.unreconciled_transactions TO authenticated;

-- ============================================================
-- 3. FIX TRANSACTIONS BY CATEGORY VIEW
-- ============================================================

DROP VIEW IF EXISTS public.transactions_by_category;

CREATE VIEW public.transactions_by_category AS
SELECT 
  t.tenant_id,
  t.account_id,
  t.category,
  t.sub_category,
  COUNT(*) as transaction_count,
  SUM(t.amount) as total_amount,
  AVG(t.amount) as average_amount,
  MIN(t.date) as first_transaction_date,
  MAX(t.date) as last_transaction_date
FROM public.transactions t
WHERE t.category IS NOT NULL
GROUP BY t.tenant_id, t.account_id, t.category, t.sub_category;

COMMENT ON VIEW public.transactions_by_category IS 
  'Summary of transactions grouped by category';

GRANT SELECT ON public.transactions_by_category TO authenticated;

-- ============================================================
-- 4. FIX CONNECTION SYNC STATUS VIEW
-- ============================================================

DROP VIEW IF EXISTS public.connection_sync_status;

CREATE VIEW public.connection_sync_status AS
SELECT 
  c.id,
  c.tenant_id,
  c.name as connection_name,
  c.connection_type,
  c.data_type,
  c.supports_transactions,
  c.supports_statements,
  c.sync_frequency,
  c.sync_status,
  c.last_sync_at,
  c.next_sync_at,
  c.error_count,
  c.last_error,
  a.account_name,
  a.account_number,
  CASE 
    WHEN c.next_sync_at IS NULL THEN 'Manual'
    WHEN c.next_sync_at > NOW() THEN 'Scheduled'
    ELSE 'Overdue'
  END as sync_schedule_status,
  CASE 
    WHEN c.last_sync_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (NOW() - c.last_sync_at))/3600 -- hours since last sync
  END as hours_since_last_sync
FROM public.connections c
LEFT JOIN public.accounts a ON c.account_id::text = a.account_id;

COMMENT ON VIEW public.connection_sync_status IS 
  'Overview of connection sync status and scheduling';

GRANT SELECT ON public.connection_sync_status TO authenticated;

-- ============================================================
-- SUCCESS
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Fixed statements table foreign key';
  RAISE NOTICE '✅ Created unreconciled_transactions view';
  RAISE NOTICE '✅ Created transactions_by_category view';
  RAISE NOTICE '✅ Created connection_sync_status view';
  RAISE NOTICE '';
  RAISE NOTICE '🎉 All migrations complete!';
END $$;

