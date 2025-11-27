-- =====================================================
-- XERO PROVIDER RAW STORAGE
-- Migration: 49-create-xero-storage.sql
--
-- Purpose: Add JSONB-based raw storage for Xero API responses
-- Pattern: Same as Plaid/Tink raw storage architecture
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'Creating Xero raw storage tables...';
END $$;

-- =====================================================
-- XERO ACCOUNTS (Raw JSONB Storage)
-- =====================================================

CREATE TABLE IF NOT EXISTS xero_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,

    -- Xero identifiers
    account_id TEXT NOT NULL,  -- Xero AccountID (UUID format)
    xero_tenant_id TEXT NOT NULL,  -- Xero Organization/Tenant ID

    -- Complete raw response from Xero API
    raw_account_data JSONB NOT NULL,

    -- Timestamps
    first_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Link to normalized account in Stratiri
    stratiri_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,

    UNIQUE(connection_id, account_id)
);

-- =====================================================
-- XERO TRANSACTIONS (Raw JSONB Storage)
-- =====================================================

CREATE TABLE IF NOT EXISTS xero_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,

    -- Xero identifiers
    transaction_id TEXT NOT NULL,  -- Xero BankTransactionID
    account_id TEXT NOT NULL,      -- Xero AccountID (which bank account)
    xero_tenant_id TEXT NOT NULL,  -- Xero Organization/Tenant ID

    -- Complete raw transaction data (preserves EVERYTHING from Xero)
    raw_transaction_data JSONB NOT NULL,

    -- Quick access fields (duplicated from JSONB for performance/indexing)
    amount NUMERIC,
    date DATE,
    type TEXT,  -- 'RECEIVE', 'SPEND', 'RECEIVE-OVERPAYMENT', 'SPEND-OVERPAYMENT', etc.
    status TEXT,  -- 'AUTHORISED', 'DELETED', 'VOIDED', etc.

    -- Timestamps
    first_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Link to normalized transaction in Stratiri
    stratiri_transaction_id TEXT REFERENCES transactions(transaction_id) ON DELETE SET NULL,

    UNIQUE(connection_id, transaction_id)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Xero Accounts Indexes
CREATE INDEX IF NOT EXISTS idx_xero_accounts_tenant ON xero_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_xero_accounts_connection ON xero_accounts(connection_id);
CREATE INDEX IF NOT EXISTS idx_xero_accounts_account_id ON xero_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_xero_accounts_xero_tenant ON xero_accounts(xero_tenant_id);
CREATE INDEX IF NOT EXISTS idx_xero_accounts_stratiri_id ON xero_accounts(stratiri_account_id);

-- Xero Transactions Indexes
CREATE INDEX IF NOT EXISTS idx_xero_transactions_tenant ON xero_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_xero_transactions_connection ON xero_transactions(connection_id);
CREATE INDEX IF NOT EXISTS idx_xero_transactions_account_id ON xero_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_xero_transactions_xero_tenant ON xero_transactions(xero_tenant_id);
CREATE INDEX IF NOT EXISTS idx_xero_transactions_date ON xero_transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_xero_transactions_status ON xero_transactions(status);
CREATE INDEX IF NOT EXISTS idx_xero_transactions_stratiri_id ON xero_transactions(stratiri_transaction_id);

-- JSONB GIN indexes for flexible querying
CREATE INDEX IF NOT EXISTS idx_xero_accounts_raw_data ON xero_accounts USING GIN (raw_account_data);
CREATE INDEX IF NOT EXISTS idx_xero_transactions_raw_data ON xero_transactions USING GIN (raw_transaction_data);

-- =====================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE xero_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_transactions ENABLE ROW LEVEL SECURITY;

-- Xero Accounts RLS Policies
CREATE POLICY "Users can view their tenant's Xero accounts"
ON xero_accounts FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert Xero accounts for their tenant"
ON xero_accounts FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their tenant's Xero accounts"
ON xero_accounts FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

-- Xero Transactions RLS Policies
CREATE POLICY "Users can view their tenant's Xero transactions"
ON xero_transactions FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert Xero transactions for their tenant"
ON xero_transactions FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their tenant's Xero transactions"
ON xero_transactions FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

-- =====================================================
-- ADD XERO TO BANKING_PROVIDERS TABLE
-- =====================================================

INSERT INTO banking_providers (
  id,
  display_name,
  auth_type,
  logo_url,
  color,
  description,
  supported_countries,
  enabled
) VALUES (
  'xero',
  'Xero',
  'oauth',
  '/logos/xero.svg',
  '#13B5EA',
  'Connect to Xero accounting software to sync bank accounts and transactions',
  ARRAY['US', 'GB', 'AU', 'NZ', 'CA', 'ZA', 'IE', 'SG', 'HK'],
  true
) ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  auth_type = EXCLUDED.auth_type,
  logo_url = EXCLUDED.logo_url,
  color = EXCLUDED.color,
  description = EXCLUDED.description,
  supported_countries = EXCLUDED.supported_countries,
  enabled = EXCLUDED.enabled;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE xero_accounts IS 'Raw JSONB storage for Xero account data - stores 100% of API response for future-proofing';
COMMENT ON TABLE xero_transactions IS 'Raw JSONB storage for Xero bank transaction data - preserves all provider-specific fields';
COMMENT ON COLUMN xero_accounts.raw_account_data IS 'Complete JSON response from Xero /Accounts API - auto-detects new fields';
COMMENT ON COLUMN xero_transactions.raw_transaction_data IS 'Complete JSON response from Xero /BankTransactions API';
COMMENT ON COLUMN xero_accounts.xero_tenant_id IS 'Xero Organization ID (tenant) - required in all API calls as Xero-Tenant-Id header';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Xero raw storage tables created successfully';
    RAISE NOTICE '✅ RLS policies applied';
    RAISE NOTICE '✅ Xero provider registered in banking_providers';
    RAISE NOTICE 'Next: Implement XeroProvider class and update services';
END $$;

