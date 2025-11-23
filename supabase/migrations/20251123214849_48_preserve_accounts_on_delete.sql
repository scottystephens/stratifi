-- Migration 48: Preserve accounts on connection deletion (for reconnection)
--
-- Problem: CASCADE DELETE constraints on accounts/transactions mean when a connection
-- is deleted, all data is lost. This prevents reconnection detection from working.
--
-- Solution: Change to SET NULL so data is preserved and can be re-linked when user reconnects.
-- This is critical for:
-- - Token expiration scenarios
-- - Accidental deletions
-- - Reconnection after temporary issues

-- =====================================================
-- Remove CASCADE DELETE, use SET NULL instead
-- =====================================================

-- 1. Accounts: Preserve accounts when connection is deleted
ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_connection_id_fkey;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_connection_id_fkey 
  FOREIGN KEY (connection_id) 
  REFERENCES public.connections(id) 
  ON DELETE SET NULL;  -- Changed from CASCADE to SET NULL

COMMENT ON CONSTRAINT accounts_connection_id_fkey ON public.accounts IS 
'SET NULL on delete: When connection is deleted, accounts are preserved (orphaned) for potential reconnection';

-- 2. Transactions: Preserve transactions when connection is deleted
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_connection_id_fkey;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_connection_id_fkey 
  FOREIGN KEY (connection_id) 
  REFERENCES public.connections(id) 
  ON DELETE SET NULL;  -- Changed from CASCADE to SET NULL

COMMENT ON CONSTRAINT transactions_connection_id_fkey ON public.transactions IS 
'SET NULL on delete: When connection is deleted, transactions are preserved (orphaned) for potential reconnection';

-- 3. Statements: Preserve statements when connection is deleted
ALTER TABLE public.statements
  DROP CONSTRAINT IF EXISTS statements_connection_id_fkey;

ALTER TABLE public.statements
  ADD CONSTRAINT statements_connection_id_fkey 
  FOREIGN KEY (connection_id) 
  REFERENCES public.connections(id) 
  ON DELETE SET NULL;  -- Changed from CASCADE to SET NULL

COMMENT ON CONSTRAINT statements_connection_id_fkey ON public.statements IS 
'SET NULL on delete: When connection is deleted, statements are preserved for potential reconnection';

-- =====================================================
-- Update reconnection detection to find orphaned accounts
-- =====================================================

-- Add index for orphaned accounts (connection_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_accounts_orphaned 
  ON public.accounts(tenant_id, external_account_id) 
  WHERE connection_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_orphaned 
  ON public.transactions(account_id) 
  WHERE connection_id IS NULL;

COMMENT ON INDEX idx_accounts_orphaned IS 'Optimizes reconnection detection for orphaned accounts (deleted connections)';
COMMENT ON INDEX idx_transactions_orphaned IS 'Optimizes transaction re-linking for orphaned transactions';

-- =====================================================
-- Add soft delete support (optional future enhancement)
-- =====================================================

ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_connections_deleted 
  ON public.connections(deleted_at) 
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN public.connections.deleted_at IS 'Soft delete timestamp - allows recovery and reconnection detection';
COMMENT ON COLUMN public.connections.deleted_by IS 'User who deleted the connection';

