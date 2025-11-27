-- Migration 30: Create xero_balances table for storing Bank Summary report data
-- This table stores balance snapshots from Xero's Bank Summary Report
-- which is the ONLY reliable way to get account balances from Xero

-- Create the xero_balances table
CREATE TABLE IF NOT EXISTS xero_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,  -- Xero AccountID
    xero_tenant_id TEXT NOT NULL,  -- Xero organization ID
    
    -- Balance data from Bank Summary report
    balance_date DATE NOT NULL,  -- Date the balance was fetched for
    opening_balance DECIMAL(19,4) NOT NULL DEFAULT 0,
    closing_balance DECIMAL(19,4) NOT NULL DEFAULT 0,
    cash_received DECIMAL(19,4),  -- Optional: from Bank Summary
    cash_spent DECIMAL(19,4),  -- Optional: from Bank Summary
    
    -- Metadata
    account_name TEXT,  -- Cached for display
    currency TEXT DEFAULT 'USD',
    raw_report_data JSONB,  -- Complete raw row from Bank Summary
    
    -- Timestamps
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint: one balance per account per date per connection
    CONSTRAINT xero_balances_unique UNIQUE (connection_id, account_id, balance_date)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_xero_balances_connection ON xero_balances(connection_id);
CREATE INDEX IF NOT EXISTS idx_xero_balances_account ON xero_balances(connection_id, account_id);
CREATE INDEX IF NOT EXISTS idx_xero_balances_date ON xero_balances(connection_id, balance_date DESC);
CREATE INDEX IF NOT EXISTS idx_xero_balances_tenant ON xero_balances(tenant_id);

-- Enable RLS
ALTER TABLE xero_balances ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant's Xero balances"
ON xero_balances FOR SELECT
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert Xero balances for their tenant"
ON xero_balances FOR INSERT
WITH CHECK (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their tenant's Xero balances"
ON xero_balances FOR UPDATE
USING (
    tenant_id IN (
        SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
);

-- Service role policy for automated syncs
CREATE POLICY "Service role can manage all Xero balances"
ON xero_balances FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Add comment
COMMENT ON TABLE xero_balances IS 'Stores balance snapshots from Xero Bank Summary Report - the only reliable source of account balances';

-- Log completion
DO $$ 
BEGIN
    RAISE NOTICE 'Migration 30: xero_balances table created successfully';
END $$;

