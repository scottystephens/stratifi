-- Migration 29: Create dedicated Plaid data storage
-- Purpose: Store all Plaid-specific data including cursors for incremental sync optimization

-- =====================================================
-- 1. Store Plaid sync cursors per connection
-- =====================================================

CREATE TABLE IF NOT EXISTS plaid_sync_cursors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    
    -- Cursor management
    cursor TEXT NOT NULL, -- The next_cursor value from Plaid's API response
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Sync metadata
    last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transactions_added INTEGER DEFAULT 0,
    transactions_modified INTEGER DEFAULT 0,
    transactions_removed INTEGER DEFAULT 0,
    has_more BOOLEAN DEFAULT FALSE,
    
    -- Prevent multiple cursors per connection
    UNIQUE(connection_id)
);

-- Enable RLS
ALTER TABLE plaid_sync_cursors ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant's Plaid cursors"
ON plaid_sync_cursors FOR SELECT
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert Plaid cursors for their tenant"
ON plaid_sync_cursors FOR INSERT
WITH CHECK (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their tenant's Plaid cursors"
ON plaid_sync_cursors FOR UPDATE
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete their tenant's Plaid cursors"
ON plaid_sync_cursors FOR DELETE
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plaid_cursors_tenant ON plaid_sync_cursors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plaid_cursors_connection ON plaid_sync_cursors(connection_id);
CREATE INDEX IF NOT EXISTS idx_plaid_cursors_last_sync ON plaid_sync_cursors(last_sync_at);

-- =====================================================
-- 2. Store raw Plaid transaction data
-- =====================================================

CREATE TABLE IF NOT EXISTS plaid_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    
    -- Plaid identifiers
    transaction_id TEXT NOT NULL, -- Plaid's unique transaction_id
    account_id TEXT NOT NULL, -- Plaid's account_id (not our UUID)
    
    -- Core transaction data
    amount DECIMAL(15, 2) NOT NULL,
    iso_currency_code TEXT,
    unofficial_currency_code TEXT,
    date DATE NOT NULL,
    authorized_date DATE,
    datetime TIMESTAMPTZ,
    
    -- Description fields
    name TEXT NOT NULL,
    merchant_name TEXT,
    original_description TEXT,
    
    -- Transaction metadata
    pending BOOLEAN DEFAULT FALSE,
    pending_transaction_id TEXT,
    transaction_type TEXT,
    transaction_code TEXT,
    payment_channel TEXT,
    
    -- Categories (Plaid's taxonomy)
    category TEXT[], -- Array of category strings
    category_id TEXT,
    
    -- Personal Finance Category (new enhanced categorization)
    personal_finance_category_primary TEXT,
    personal_finance_category_detailed TEXT,
    personal_finance_category_confidence_level TEXT,
    
    -- Location data (for physical transactions)
    location_address TEXT,
    location_city TEXT,
    location_region TEXT,
    location_postal_code TEXT,
    location_country TEXT,
    location_lat DECIMAL(10, 7),
    location_lon DECIMAL(10, 7),
    location_store_number TEXT,
    
    -- Payment metadata
    payment_meta_reference_number TEXT,
    payment_meta_ppd_id TEXT,
    payment_meta_payee TEXT,
    payment_meta_by_order_of TEXT,
    payment_meta_payer TEXT,
    payment_meta_payment_method TEXT,
    payment_meta_payment_processor TEXT,
    payment_meta_reason TEXT,
    
    -- Counterparty information
    counterparty_name TEXT,
    counterparty_type TEXT,
    counterparty_logo_url TEXT,
    counterparty_website TEXT,
    counterparty_entity_id TEXT,
    counterparty_confidence_level TEXT,
    
    -- Check data (for check transactions)
    check_number TEXT,
    
    -- ACH/Wire data
    account_owner TEXT,
    
    -- Full raw JSON from Plaid (for future-proofing)
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
    
    -- Unique constraint per Plaid transaction
    UNIQUE(connection_id, transaction_id)
);

-- Enable RLS
ALTER TABLE plaid_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant's Plaid transactions"
ON plaid_transactions FOR SELECT
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert Plaid transactions for their tenant"
ON plaid_transactions FOR INSERT
WITH CHECK (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their tenant's Plaid transactions"
ON plaid_transactions FOR UPDATE
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_plaid_txns_tenant ON plaid_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plaid_txns_connection ON plaid_transactions(connection_id);
CREATE INDEX IF NOT EXISTS idx_plaid_txns_account ON plaid_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_plaid_txns_date ON plaid_transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_plaid_txns_transaction_id ON plaid_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_plaid_txns_pending ON plaid_transactions(pending) WHERE pending = true;
CREATE INDEX IF NOT EXISTS idx_plaid_txns_imported ON plaid_transactions(imported_to_transactions) WHERE imported_to_transactions = false;
CREATE INDEX IF NOT EXISTS idx_plaid_txns_sync_action ON plaid_transactions(sync_action);
CREATE INDEX IF NOT EXISTS idx_plaid_txns_merchant ON plaid_transactions(merchant_name) WHERE merchant_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plaid_txns_raw_data ON plaid_transactions USING GIN(raw_data); -- For JSONB queries

-- =====================================================
-- 3. Store raw Plaid account data
-- =====================================================

CREATE TABLE IF NOT EXISTS plaid_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    
    -- Plaid identifiers
    account_id TEXT NOT NULL, -- Plaid's account_id
    item_id TEXT, -- Plaid's item_id
    
    -- Account details
    name TEXT NOT NULL,
    official_name TEXT,
    mask TEXT, -- Last 4 digits
    type TEXT NOT NULL, -- depository, credit, loan, investment
    subtype TEXT, -- checking, savings, credit card, etc.
    
    -- Balances
    available DECIMAL(15, 2),
    current DECIMAL(15, 2),
    limit_amount DECIMAL(15, 2),
    iso_currency_code TEXT,
    unofficial_currency_code TEXT,
    
    -- Account verification
    verification_status TEXT,
    
    -- Full raw JSON from Plaid
    raw_data JSONB NOT NULL,
    
    -- Link to our normalized account
    stratiri_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    
    -- Tracking
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint per Plaid account
    UNIQUE(connection_id, account_id)
);

-- Enable RLS
ALTER TABLE plaid_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant's Plaid accounts"
ON plaid_accounts FOR SELECT
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert Plaid accounts for their tenant"
ON plaid_accounts FOR INSERT
WITH CHECK (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their tenant's Plaid accounts"
ON plaid_accounts FOR UPDATE
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_tenant ON plaid_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_connection ON plaid_accounts(connection_id);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_account_id ON plaid_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_stratiri_id ON plaid_accounts(stratiri_account_id);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_type ON plaid_accounts(type, subtype);

-- =====================================================
-- 4. Add comment documentation
-- =====================================================

COMMENT ON TABLE plaid_sync_cursors IS 'Stores Plaid /transactions/sync cursors for efficient incremental syncing and API cost optimization';
COMMENT ON TABLE plaid_transactions IS 'Stores ALL raw transaction data from Plaid API for audit trail and future data mining';
COMMENT ON TABLE plaid_accounts IS 'Stores ALL raw account data from Plaid API with full metadata preservation';

COMMENT ON COLUMN plaid_sync_cursors.cursor IS 'The next_cursor value from Plaid - used for incremental sync to fetch only new/modified/removed transactions';
COMMENT ON COLUMN plaid_transactions.raw_data IS 'Complete raw JSON response from Plaid API - preserves all fields for future use';
COMMENT ON COLUMN plaid_transactions.sync_action IS 'Whether this transaction was added, modified, or removed in the last sync';
COMMENT ON COLUMN plaid_transactions.personal_finance_category_primary IS 'Plaid Enhanced Categorization - primary category (e.g., FOOD_AND_DRINK)';
COMMENT ON COLUMN plaid_transactions.personal_finance_category_detailed IS 'Plaid Enhanced Categorization - detailed category (e.g., FOOD_AND_DRINK_RESTAURANTS)';
COMMENT ON COLUMN plaid_accounts.raw_data IS 'Complete raw JSON response from Plaid API - preserves all account metadata';

