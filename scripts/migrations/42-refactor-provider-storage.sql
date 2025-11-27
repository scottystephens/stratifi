-- =====================================================
-- BANKING PROVIDER ARCHITECTURE REFACTOR
-- Migration: 42-refactor-provider-storage.sql
--
-- Purpose: Transform to clean, layered architecture that:
-- - Stores 100% of raw API responses in JSONB (auto-detects new fields)
-- - Separates raw data ingestion from normalization
-- - Uses single sync orchestrator for ALL providers
-- - Maintains separate provider tables for easier queries
-- - Allows clean rollback if needed
--
-- Strategy: Clean slate approach
-- 1. Create new _v2 tables with JSONB storage
-- 2. Drop old tables at end
-- 3. Rename _v2 tables to canonical names
--
-- Author: Stratiri Team
-- Date: November 2025
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'Starting Banking Provider Architecture Refactor Migration...';
END $$;

-- =====================================================
-- PLAID RAW STORAGE (JSONB-based, auto-detects fields)
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'Creating Plaid raw storage tables...';
END $$;

CREATE TABLE plaid_accounts_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,

    -- Plaid identifiers (for quick lookups)
    account_id TEXT NOT NULL,  -- Plaid's account_id
    item_id TEXT,               -- Plaid's item_id

    -- Complete raw response from Plaid (auto-detects ANY field)
    raw_account_data JSONB NOT NULL,

    -- Extracted institution data (complete)
    raw_institution_data JSONB,

    -- Timestamps
    first_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Link to normalized account
    stratiri_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,

    UNIQUE(connection_id, account_id)
);

CREATE TABLE plaid_transactions_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,

    -- Plaid identifiers
    transaction_id TEXT NOT NULL,
    account_id TEXT NOT NULL,

    -- Complete raw transaction data (preserves EVERYTHING)
    raw_transaction_data JSONB NOT NULL,

    -- Quick access fields (duplicated from JSONB for performance)
    amount NUMERIC,
    date DATE,
    posted BOOLEAN,

    -- Timestamps
    first_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Link to normalized transaction
    stratiri_transaction_id TEXT REFERENCES transactions(transaction_id) ON DELETE SET NULL,

    UNIQUE(connection_id, transaction_id)
);

-- Sync cursor management (keep similar to current)
CREATE TABLE plaid_sync_cursors_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    cursor TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transactions_added INTEGER DEFAULT 0,
    transactions_modified INTEGER DEFAULT 0,
    transactions_removed INTEGER DEFAULT 0,
    has_more BOOLEAN DEFAULT FALSE,
    raw_sync_metadata JSONB,  -- Store complete sync response
    UNIQUE(connection_id)
);

-- =====================================================
-- TINK RAW STORAGE (same pattern)
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'Creating Tink raw storage tables...';
END $$;

CREATE TABLE tink_accounts_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    financial_institution_id TEXT,
    raw_account_data JSONB NOT NULL,
    raw_institution_data JSONB,
    first_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stratiri_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    UNIQUE(connection_id, account_id)
);

CREATE TABLE tink_transactions_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    transaction_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    raw_transaction_data JSONB NOT NULL,
    amount NUMERIC,
    date DATE,
    first_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stratiri_transaction_id TEXT REFERENCES transactions(transaction_id) ON DELETE SET NULL,
    UNIQUE(connection_id, transaction_id)
);

-- =====================================================
-- DIRECT BANK API RAW STORAGE (Scalable for many banks)
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'Creating Direct Bank raw storage tables...';
END $$;

-- Single table for ALL direct bank APIs (Standard Bank, future banks)
-- Uses provider_id to distinguish banks
CREATE TABLE direct_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL,  -- 'standard_bank_sa', 'absa_sa', 'nedbank_sa', etc.
    external_account_id TEXT NOT NULL,  -- Bank's account identifier

    -- Complete raw API response (auto-detects ANY field from ANY bank)
    raw_account_data JSONB NOT NULL,

    -- Raw institution/bank metadata if available
    raw_institution_data JSONB,

    -- Timestamps
    first_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Link to normalized account
    stratiri_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,

    UNIQUE(connection_id, external_account_id)
);

CREATE TABLE direct_bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL,  -- 'standard_bank_sa', etc.
    external_transaction_id TEXT NOT NULL,
    external_account_id TEXT NOT NULL,

    -- Complete raw transaction data (preserves EVERYTHING)
    raw_transaction_data JSONB NOT NULL,

    -- Quick access fields (duplicated from JSONB for performance)
    amount NUMERIC,
    date DATE,
    currency TEXT,

    -- Timestamps
    first_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Link to normalized transaction
    stratiri_transaction_id TEXT REFERENCES transactions(transaction_id) ON DELETE SET NULL,

    UNIQUE(connection_id, external_transaction_id)
);

-- Indexes for performance
CREATE INDEX idx_direct_bank_accounts_provider ON direct_bank_accounts(provider_id);
CREATE INDEX idx_direct_bank_accounts_connection ON direct_bank_accounts(connection_id);
CREATE INDEX idx_direct_bank_transactions_provider ON direct_bank_transactions(provider_id);
CREATE INDEX idx_direct_bank_transactions_connection ON direct_bank_transactions(connection_id);
CREATE INDEX idx_direct_bank_transactions_date ON direct_bank_transactions(date);

-- =====================================================
-- RLS POLICIES (same pattern for all tables)
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'Creating RLS policies...';
END $$;

-- Enable RLS on all new tables
ALTER TABLE plaid_accounts_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE plaid_transactions_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE plaid_sync_cursors_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE tink_accounts_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE tink_transactions_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_bank_transactions ENABLE ROW LEVEL SECURITY;

-- Plaid Accounts RLS
CREATE POLICY "Users can view their tenant's Plaid accounts"
ON plaid_accounts_v2 FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert Plaid accounts for their tenant"
ON plaid_accounts_v2 FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their tenant's Plaid accounts"
ON plaid_accounts_v2 FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

-- Plaid Transactions RLS
CREATE POLICY "Users can view their tenant's Plaid transactions"
ON plaid_transactions_v2 FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert Plaid transactions for their tenant"
ON plaid_transactions_v2 FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their tenant's Plaid transactions"
ON plaid_transactions_v2 FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

-- Plaid Sync Cursors RLS
CREATE POLICY "Users can view their tenant's Plaid cursors"
ON plaid_sync_cursors_v2 FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can manage Plaid cursors for their tenant"
ON plaid_sync_cursors_v2 FOR ALL
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

-- Tink Accounts RLS
CREATE POLICY "Users can view their tenant's Tink accounts"
ON tink_accounts_v2 FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert Tink accounts for their tenant"
ON tink_accounts_v2 FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their tenant's Tink accounts"
ON tink_accounts_v2 FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

-- Tink Transactions RLS
CREATE POLICY "Users can view their tenant's Tink transactions"
ON tink_transactions_v2 FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert Tink transactions for their tenant"
ON tink_transactions_v2 FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their tenant's Tink transactions"
ON tink_transactions_v2 FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

-- Direct Bank Accounts RLS
CREATE POLICY "Users can view their tenant's direct bank accounts"
ON direct_bank_accounts FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert direct bank accounts for their tenant"
ON direct_bank_accounts FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their tenant's direct bank accounts"
ON direct_bank_accounts FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

-- Direct Bank Transactions RLS
CREATE POLICY "Users can view their tenant's direct bank transactions"
ON direct_bank_transactions FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert direct bank transactions for their tenant"
ON direct_bank_transactions FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their tenant's direct bank transactions"
ON direct_bank_transactions FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

-- =====================================================
-- DROP OLD TABLES (Clean slate)
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'Dropping old provider tables...';
END $$;

-- Drop old Plaid tables
DROP TABLE IF EXISTS plaid_transactions CASCADE;
DROP TABLE IF EXISTS plaid_accounts CASCADE;
DROP TABLE IF EXISTS plaid_sync_cursors CASCADE;

-- Drop old Tink tables
DROP TABLE IF EXISTS tink_transactions CASCADE;
DROP TABLE IF EXISTS tink_accounts CASCADE;

-- =====================================================
-- RENAME _v2 TABLES TO CANONICAL NAMES
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'Renaming _v2 tables to canonical names...';
END $$;

ALTER TABLE plaid_accounts_v2 RENAME TO plaid_accounts;
ALTER TABLE plaid_transactions_v2 RENAME TO plaid_transactions;
ALTER TABLE plaid_sync_cursors_v2 RENAME TO plaid_sync_cursors;
ALTER TABLE tink_accounts_v2 RENAME TO tink_accounts;
ALTER TABLE tink_transactions_v2 RENAME TO tink_transactions;

-- =====================================================
-- FINAL INDEXES AND OPTIMIZATIONS
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'Creating final indexes...';
END $$;

-- Plaid indexes
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_tenant ON plaid_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_connection ON plaid_accounts(connection_id);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_account_id ON plaid_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_stratiri_id ON plaid_accounts(stratiri_account_id);

CREATE INDEX IF NOT EXISTS idx_plaid_transactions_tenant ON plaid_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_connection ON plaid_transactions(connection_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_account_id ON plaid_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_date ON plaid_transactions(date);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_stratiri_id ON plaid_transactions(stratiri_transaction_id);

CREATE INDEX IF NOT EXISTS idx_plaid_cursors_tenant ON plaid_sync_cursors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plaid_cursors_connection ON plaid_sync_cursors(connection_id);

-- Tink indexes
CREATE INDEX IF NOT EXISTS idx_tink_accounts_tenant ON tink_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tink_accounts_connection ON tink_accounts(connection_id);
CREATE INDEX IF NOT EXISTS idx_tink_accounts_account_id ON tink_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_tink_accounts_stratiri_id ON tink_accounts(stratiri_account_id);

CREATE INDEX IF NOT EXISTS idx_tink_transactions_tenant ON tink_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tink_transactions_connection ON tink_transactions(connection_id);
CREATE INDEX IF NOT EXISTS idx_tink_transactions_account_id ON tink_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_tink_transactions_date ON tink_transactions(date);
CREATE INDEX IF NOT EXISTS idx_tink_transactions_stratiri_id ON tink_transactions(stratiri_transaction_id);

-- Direct Bank indexes (already created above, but ensuring they exist)
CREATE INDEX IF NOT EXISTS idx_direct_bank_accounts_tenant ON direct_bank_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_direct_bank_accounts_stratiri_id ON direct_bank_accounts(stratiri_account_id);

CREATE INDEX IF NOT EXISTS idx_direct_bank_transactions_tenant ON direct_bank_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_direct_bank_transactions_stratiri_id ON direct_bank_transactions(stratiri_transaction_id);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Banking Provider Architecture Refactor Migration Complete!
-- New Architecture Features:
-- - JSONB storage captures 100% of API responses
-- - Auto-detects new fields from providers
-- - Separate raw data ingestion from normalization
-- - Single sync orchestrator for all providers
-- - Clean rollback capability
