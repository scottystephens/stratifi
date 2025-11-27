-- Migration 49: Add provider column to accounts and standardize provider naming
--
-- Fixes naming inconsistencies found during reconnection implementation:
-- 1. accounts table needs 'provider' for reconnection filtering
-- 2. Standardize provider naming across tables

-- =====================================================
-- Add provider column to accounts table
-- =====================================================

ALTER TABLE public.accounts 
  ADD COLUMN IF NOT EXISTS provider TEXT;

-- Backfill provider from provider_id (if exists)
UPDATE public.accounts 
  SET provider = provider_id 
  WHERE provider IS NULL AND provider_id IS NOT NULL;

-- Create index for reconnection queries
CREATE INDEX IF NOT EXISTS idx_accounts_provider_external 
  ON public.accounts(provider, external_account_id) 
  WHERE external_account_id IS NOT NULL;

COMMENT ON COLUMN public.accounts.provider IS 'Banking provider identifier (plaid, tink, etc.) - used for reconnection detection';
COMMENT ON INDEX idx_accounts_provider_external IS 'Optimizes reconnection detection by provider + external_account_id';

-- =====================================================
-- Standardize connections table provider naming
-- =====================================================

-- Rename 'provider' to 'provider_id' for consistency
-- (Keep old column temporarily for backward compatibility)
ALTER TABLE public.connections 
  ADD COLUMN IF NOT EXISTS provider_id TEXT;

-- Migrate data: provider → provider_id
UPDATE public.connections 
  SET provider_id = provider 
  WHERE provider_id IS NULL AND provider IS NOT NULL;

-- Create index on provider_id
CREATE INDEX IF NOT EXISTS idx_connections_provider_id 
  ON public.connections(provider_id) 
  WHERE provider_id IS NOT NULL;

COMMENT ON COLUMN public.connections.provider_id IS 'Banking provider identifier (plaid, tink, standard_bank_sa, etc.) - standardized naming';
COMMENT ON COLUMN public.connections.provider IS 'DEPRECATED: Use provider_id instead. Kept for backward compatibility.';

-- =====================================================
-- Add institution_id to accounts for better matching
-- =====================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS institution_id TEXT,
  ADD COLUMN IF NOT EXISTS institution_name TEXT;

CREATE INDEX IF NOT EXISTS idx_accounts_institution 
  ON public.accounts(tenant_id, institution_id, provider) 
  WHERE institution_id IS NOT NULL;

COMMENT ON COLUMN public.accounts.institution_id IS 'Bank institution identifier (ins_56 for Chase, etc.) - used for reconnection matching';
COMMENT ON COLUMN public.accounts.institution_name IS 'Human-readable bank name from provider API';

-- =====================================================
-- Summary of changes
-- =====================================================

DO $$ 
BEGIN
  RAISE NOTICE '✅ Migration 49 complete:';
  RAISE NOTICE '   - Added provider column to accounts table';
  RAISE NOTICE '   - Added provider_id to connections (standardized naming)';
  RAISE NOTICE '   - Added institution_id and institution_name to accounts';
  RAISE NOTICE '   - Created indexes for reconnection optimization';
  RAISE NOTICE '   - Old provider column kept for backward compatibility';
END $$;

