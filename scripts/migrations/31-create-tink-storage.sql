-- Migration 31: Create dedicated Tink data storage
-- Purpose: Store all Tink-specific data including cursors for incremental sync optimization
-- Mirrors Plaid storage structure (Migration 29) for consistency

-- =====================================================
-- 1. Store Tink sync cursors per connection
-- =====================================================

CREATE TABLE IF NOT EXISTS tink_sync_cursors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    
    -- Cursor management (Tink uses pageToken for pagination)
    page_token TEXT NOT NULL, -- The nextPageToken value from Tink's API response
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Sync metadata
    last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transactions_added INTEGER DEFAULT 0,
    transactions_modified INTEGER DEFAULT 0,
    accounts_synced INTEGER DEFAULT 0,
    has_more BOOLEAN DEFAULT FALSE,
    
    -- Prevent multiple cursors per connection
    UNIQUE(connection_id)
);

-- Enable RLS
ALTER TABLE tink_sync_cursors ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant's Tink cursors"
ON tink_sync_cursors FOR SELECT
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert Tink cursors for their tenant"
ON tink_sync_cursors FOR INSERT
WITH CHECK (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their tenant's Tink cursors"
ON tink_sync_cursors FOR UPDATE
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete their tenant's Tink cursors"
ON tink_sync_cursors FOR DELETE
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tink_cursors_tenant ON tink_sync_cursors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tink_cursors_connection ON tink_sync_cursors(connection_id);
CREATE INDEX IF NOT EXISTS idx_tink_cursors_last_sync ON tink_sync_cursors(last_sync_at);

-- =====================================================
-- 2. Store raw Tink transaction data
-- =====================================================

CREATE TABLE IF NOT EXISTS tink_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    
    -- Tink identifiers
    transaction_id TEXT NOT NULL, -- Tink's unique transaction ID
    account_id TEXT NOT NULL, -- Tink's account_id (not our UUID)
    
    -- Core transaction data
    amount DECIMAL(15, 2) NOT NULL,
    currency_code TEXT NOT NULL,
    
    -- Dates (Tink API v2 structure)
    date_booked DATE, -- dates.booked
    date_value DATE, -- dates.value
    original_date DATE,
    
    -- Description fields
    description_display TEXT,
    description_original TEXT,
    merchant_name TEXT,
    
    -- Transaction metadata
    booking_status TEXT, -- BOOKED, PENDING, etc.
    transaction_type TEXT, -- types.type
    transaction_code TEXT, -- types.code
    status TEXT,
    
    -- Categories (Tink's PFM categorization)
    category_id TEXT, -- categories.pfm.id
    category_name TEXT, -- categories.pfm.name
    
    -- Merchant details
    merchant_category_code TEXT,
    merchant_location TEXT,
    
    -- Additional metadata
    notes TEXT,
    reference TEXT,
    
    -- Provider identifiers (for deduplication)
    provider_transaction_id TEXT, -- identifiers.providerTransactionId
    identifiers JSONB,
    
    -- Full raw JSON from Tink (for future-proofing and full fidelity)
    raw_data JSONB NOT NULL,
    
    -- Import tracking
    imported_to_transactions BOOLEAN DEFAULT FALSE,
    import_job_id UUID REFERENCES ingestion_jobs(id),
    
    -- Sync metadata
    sync_action TEXT CHECK (sync_action IN ('added', 'modified', 'removed')),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint per Tink transaction
    UNIQUE(connection_id, transaction_id)
);

-- Enable RLS
ALTER TABLE tink_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant's Tink transactions"
ON tink_transactions FOR SELECT
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert Tink transactions for their tenant"
ON tink_transactions FOR INSERT
WITH CHECK (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their tenant's Tink transactions"
ON tink_transactions FOR UPDATE
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete their tenant's Tink transactions"
ON tink_transactions FOR DELETE
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tink_txns_tenant ON tink_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tink_txns_connection ON tink_transactions(connection_id);
CREATE INDEX IF NOT EXISTS idx_tink_txns_account ON tink_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_tink_txns_date_booked ON tink_transactions(date_booked);
CREATE INDEX IF NOT EXISTS idx_tink_txns_transaction_id ON tink_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tink_txns_imported ON tink_transactions(imported_to_transactions);
CREATE INDEX IF NOT EXISTS idx_tink_txns_sync_action ON tink_transactions(sync_action);

-- =====================================================
-- 3. Store raw Tink account data
-- =====================================================

CREATE TABLE IF NOT EXISTS tink_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    
    -- Tink identifiers
    account_id TEXT NOT NULL, -- Tink's account_id
    financial_institution_id TEXT, -- Bank identifier
    
    -- Account details
    name TEXT NOT NULL,
    account_number TEXT,
    account_type TEXT NOT NULL, -- CHECKING, SAVINGS, CREDIT_CARD, etc.
    holder_name TEXT,
    
    -- IBAN/BIC identifiers (Tink API v2 structure)
    iban TEXT,
    bic TEXT,
    bban TEXT,
    
    -- Balances (Tink API v2 structure: balances.booked.amount)
    balance_booked DECIMAL(15, 2),
    balance_available DECIMAL(15, 2),
    currency_code TEXT,
    
    -- Account status
    closed BOOLEAN DEFAULT FALSE,
    flags TEXT[], -- Account flags from Tink
    account_exclusion TEXT,
    
    -- Timestamps
    refreshed BIGINT, -- Unix timestamp of last refresh at Tink
    created BIGINT, -- Unix timestamp when account was created at Tink
    
    -- Full raw JSON from Tink
    raw_data JSONB NOT NULL,
    
    -- Link to our normalized account
    stratifi_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    
    -- Tracking
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint per Tink account
    UNIQUE(connection_id, account_id)
);

-- Enable RLS
ALTER TABLE tink_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant's Tink accounts"
ON tink_accounts FOR SELECT
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert Tink accounts for their tenant"
ON tink_accounts FOR INSERT
WITH CHECK (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their tenant's Tink accounts"
ON tink_accounts FOR UPDATE
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tink_accounts_tenant ON tink_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tink_accounts_connection ON tink_accounts(connection_id);
CREATE INDEX IF NOT EXISTS idx_tink_accounts_account_id ON tink_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_tink_accounts_stratifi_id ON tink_accounts(stratifi_account_id);
CREATE INDEX IF NOT EXISTS idx_tink_accounts_iban ON tink_accounts(iban) WHERE iban IS NOT NULL;

-- =====================================================
-- Comments for documentation
-- =====================================================

COMMENT ON TABLE tink_sync_cursors IS 'Stores pagination tokens for Tink API incremental sync';
COMMENT ON TABLE tink_transactions IS 'Raw transaction data from Tink API with full fidelity';
COMMENT ON TABLE tink_accounts IS 'Raw account data from Tink API with full metadata';

COMMENT ON COLUMN tink_sync_cursors.page_token IS 'The nextPageToken from Tink API for pagination';
COMMENT ON COLUMN tink_transactions.raw_data IS 'Complete transaction JSON from Tink API for audit trail';
COMMENT ON COLUMN tink_accounts.raw_data IS 'Complete account JSON from Tink API for audit trail';

