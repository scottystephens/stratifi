-- =====================================================
-- Stratifi - Generic Banking Provider Support
-- Extends the existing schema to support multiple banking providers
-- =====================================================

-- =====================================================
-- STEP 1: Create Generic Banking Providers Table
-- =====================================================

CREATE TABLE IF NOT EXISTS banking_providers (
  id TEXT PRIMARY KEY, -- e.g., 'bunq', 'plaid', 'nordigen'
  display_name TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('oauth', 'api_key', 'open_banking')),
  logo_url TEXT,
  color TEXT,
  description TEXT,
  website TEXT,
  documentation_url TEXT,
  supported_countries TEXT[], -- Array of ISO country codes
  enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}'::jsonb, -- Provider-specific configuration
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed with initial providers
INSERT INTO banking_providers (id, display_name, auth_type, logo_url, color, description, website, supported_countries, enabled)
VALUES 
  ('bunq', 'Bunq', 'oauth', '/logos/bunq.svg', '#FF6B00', 'Connect your Bunq account for automatic transaction sync', 'https://www.bunq.com', ARRAY['NL', 'DE', 'FR', 'AT', 'IE', 'ES', 'IT', 'BE'], true),
  ('tink', 'Tink', 'oauth', '/logos/tink.svg', '#00A8FF', 'Connect your bank accounts through Tink (3,500+ European banks)', 'https://www.tink.com', ARRAY['NL', 'GB', 'DE', 'FR', 'ES', 'IT', 'SE', 'NO', 'DK', 'FI', 'AT', 'BE', 'CH', 'IE', 'PT', 'PL', 'CZ', 'GR', 'RO', 'HU'], true)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STEP 2: Create Generic Provider Tokens Table
-- =====================================================

CREATE TABLE IF NOT EXISTS provider_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES banking_providers(id) ON DELETE CASCADE,
  
  -- OAuth/API tokens
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMP WITH TIME ZONE,
  scopes TEXT[],
  
  -- Provider-specific data
  provider_user_id TEXT, -- User ID in the provider's system
  provider_metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure only one active token per connection
  UNIQUE (connection_id, provider_id)
);

-- =====================================================
-- STEP 3: Create Generic Provider Accounts Table
-- =====================================================

CREATE TABLE IF NOT EXISTS provider_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES banking_providers(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES accounts(account_id) ON DELETE SET NULL, -- Link to Stratifi account
  
  -- Provider account data
  external_account_id TEXT NOT NULL, -- Account ID in provider's system
  account_name TEXT NOT NULL,
  account_number TEXT,
  account_type TEXT,
  currency TEXT NOT NULL,
  balance DECIMAL(19, 4),
  
  -- Banking details
  iban TEXT,
  bic TEXT,
  routing_number TEXT,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'closed')),
  
  -- Provider-specific metadata
  provider_metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Sync metadata
  last_synced_at TIMESTAMP WITH TIME ZONE,
  sync_enabled BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Prevent duplicate account mappings
  UNIQUE (connection_id, provider_id, external_account_id)
);

-- =====================================================
-- STEP 4: Create Generic Provider Transactions Table
-- =====================================================

CREATE TABLE IF NOT EXISTS provider_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES banking_providers(id) ON DELETE CASCADE,
  provider_account_id UUID REFERENCES provider_accounts(id) ON DELETE CASCADE,
  transaction_id TEXT REFERENCES transactions(transaction_id) ON DELETE SET NULL, -- Link to imported transaction
  
  -- Provider transaction data
  external_transaction_id TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  
  -- Transaction details
  amount DECIMAL(19, 4) NOT NULL,
  currency TEXT NOT NULL,
  description TEXT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('credit', 'debit')),
  
  -- Counterparty
  counterparty_name TEXT,
  counterparty_account TEXT,
  reference TEXT,
  category TEXT,
  
  -- Dates
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
  posted_date TIMESTAMP WITH TIME ZONE,
  
  -- Import status
  import_status TEXT DEFAULT 'pending' CHECK (import_status IN ('pending', 'imported', 'skipped', 'failed')),
  import_job_id UUID,
  import_error TEXT,
  
  -- Provider-specific metadata
  provider_metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Prevent duplicate imports
  UNIQUE (connection_id, provider_id, external_transaction_id)
);

-- =====================================================
-- STEP 5: Migrate Existing Bunq Data
-- =====================================================

-- Migrate bunq_oauth_tokens to provider_tokens
INSERT INTO provider_tokens (
  tenant_id,
  connection_id,
  provider_id,
  access_token,
  refresh_token,
  token_type,
  expires_at,
  scopes,
  provider_user_id,
  provider_metadata,
  status,
  last_used_at,
  revoked_at,
  created_at,
  updated_at
)
SELECT 
  tenant_id,
  connection_id,
  'bunq' as provider_id,
  access_token,
  refresh_token,
  token_type,
  expires_at,
  scopes,
  bunq_user_id as provider_user_id,
  jsonb_build_object(
    'bunq_user_type', bunq_user_type,
    'bunq_environment', bunq_environment,
    'bunq_api_key', bunq_api_key,
    'bunq_session_token', bunq_session_token
  ) as provider_metadata,
  CASE 
    WHEN revoked_at IS NOT NULL THEN 'revoked'
    WHEN expires_at < NOW() THEN 'expired'
    ELSE 'active'
  END as status,
  last_used_at,
  revoked_at,
  created_at,
  updated_at
FROM bunq_oauth_tokens
ON CONFLICT (connection_id, provider_id) DO NOTHING;

-- Migrate bunq_accounts to provider_accounts
INSERT INTO provider_accounts (
  tenant_id,
  connection_id,
  provider_id,
  account_id,
  external_account_id,
  account_name,
  account_number,
  account_type,
  currency,
  balance,
  iban,
  bic,
  status,
  provider_metadata,
  last_synced_at,
  sync_enabled,
  created_at,
  updated_at
)
SELECT 
  tenant_id,
  connection_id,
  'bunq' as provider_id,
  account_id,
  bunq_monetary_account_id as external_account_id,
  display_name as account_name,
  iban as account_number,
  'Checking' as account_type,
  currency,
  balance,
  iban,
  bic,
  status,
  jsonb_build_object(
    'bunq_account_type', bunq_account_type,
    'description', description
  ) as provider_metadata,
  last_synced_at,
  sync_enabled,
  created_at,
  updated_at
FROM bunq_accounts
ON CONFLICT (connection_id, provider_id, external_account_id) DO NOTHING;

-- Migrate bunq_transactions_staging to provider_transactions
INSERT INTO provider_transactions (
  tenant_id,
  connection_id,
  provider_id,
  provider_account_id,
  transaction_id,
  external_transaction_id,
  external_account_id,
  amount,
  currency,
  description,
  transaction_type,
  counterparty_name,
  counterparty_account,
  reference,
  transaction_date,
  import_status,
  import_job_id,
  provider_metadata,
  created_at
)
SELECT 
  bt.tenant_id,
  bt.connection_id,
  'bunq' as provider_id,
  pa.id as provider_account_id,
  bt.transaction_id,
  bt.bunq_payment_id as external_transaction_id,
  bt.bunq_monetary_account_id as external_account_id,
  bt.amount,
  bt.currency,
  bt.description,
  CASE 
    WHEN bt.amount >= 0 THEN 'credit'
    ELSE 'debit'
  END as transaction_type,
  bt.counterparty_name,
  bt.counterparty_iban as counterparty_account,
  NULL as reference,
  bt.transaction_date,
  CASE 
    WHEN bt.imported_to_transactions THEN 'imported'
    ELSE 'pending'
  END as import_status,
  bt.import_job_id,
  bt.raw_data as provider_metadata,
  bt.created_at
FROM bunq_transactions_staging bt
LEFT JOIN provider_accounts pa ON 
  pa.connection_id = bt.connection_id 
  AND pa.provider_id = 'bunq'
  AND pa.external_account_id = bt.bunq_monetary_account_id
ON CONFLICT (connection_id, provider_id, external_transaction_id) DO NOTHING;

-- =====================================================
-- STEP 6: Create Indexes for Performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_provider_tokens_tenant ON provider_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_provider_tokens_connection ON provider_tokens(connection_id);
CREATE INDEX IF NOT EXISTS idx_provider_tokens_provider ON provider_tokens(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_tokens_expires ON provider_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_provider_tokens_status ON provider_tokens(status);

CREATE INDEX IF NOT EXISTS idx_provider_accounts_tenant ON provider_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_connection ON provider_accounts(connection_id);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_provider ON provider_accounts(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_account ON provider_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_external ON provider_accounts(external_account_id);

CREATE INDEX IF NOT EXISTS idx_provider_transactions_tenant ON provider_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_provider_transactions_connection ON provider_transactions(connection_id);
CREATE INDEX IF NOT EXISTS idx_provider_transactions_provider ON provider_transactions(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_transactions_date ON provider_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_provider_transactions_status ON provider_transactions(import_status);
CREATE INDEX IF NOT EXISTS idx_provider_transactions_external ON provider_transactions(external_transaction_id);

-- =====================================================
-- STEP 7: Row-Level Security (RLS) Policies
-- =====================================================

-- Banking providers is public (read-only)
ALTER TABLE banking_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view enabled providers"
ON banking_providers FOR SELECT
USING (enabled = true);

-- Provider tokens
ALTER TABLE provider_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's provider tokens"
ON provider_tokens FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Editors can manage provider tokens"
ON provider_tokens FOR ALL
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
  )
);

-- Provider accounts
ALTER TABLE provider_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's provider accounts"
ON provider_accounts FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Editors can manage provider accounts"
ON provider_accounts FOR ALL
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
  )
);

-- Provider transactions
ALTER TABLE provider_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's provider transactions"
ON provider_transactions FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Editors can manage provider transactions"
ON provider_transactions FOR ALL
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
  )
);

-- =====================================================
-- STEP 8: Helper Functions
-- =====================================================

-- Function to get enabled providers
CREATE OR REPLACE FUNCTION get_enabled_providers()
RETURNS TABLE (
  id TEXT,
  display_name TEXT,
  auth_type TEXT,
  logo_url TEXT,
  color TEXT,
  description TEXT,
  supported_countries TEXT[]
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, display_name, auth_type, logo_url, color, description, supported_countries
  FROM banking_providers
  WHERE enabled = true
  ORDER BY display_name;
$$;

-- Function to check if provider token needs refresh
CREATE OR REPLACE FUNCTION needs_token_refresh(p_token_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT expires_at INTO v_expires_at
  FROM provider_tokens
  WHERE id = p_token_id
    AND status = 'active';
  
  IF v_expires_at IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Return true if token expires within 5 minutes
  RETURN v_expires_at <= NOW() + INTERVAL '5 minutes';
END;
$$;

-- Function to mark token as expired
CREATE OR REPLACE FUNCTION mark_token_expired(p_token_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE provider_tokens
  SET status = 'expired',
      updated_at = NOW()
  WHERE id = p_token_id;
END;
$$;

-- =====================================================
-- STEP 9: Comments for Documentation
-- =====================================================

COMMENT ON TABLE banking_providers IS 'Registry of available banking providers (Bunq, Plaid, etc.)';
COMMENT ON TABLE provider_tokens IS 'OAuth/API tokens for all banking providers';
COMMENT ON TABLE provider_accounts IS 'Accounts from all banking providers mapped to Stratifi accounts';
COMMENT ON TABLE provider_transactions IS 'Transactions from all providers before import to main table';

COMMENT ON COLUMN provider_tokens.provider_id IS 'References banking_providers.id (e.g., bunq, plaid, nordigen)';
COMMENT ON COLUMN provider_accounts.external_account_id IS 'Account ID in the provider system';
COMMENT ON COLUMN provider_transactions.import_status IS 'pending, imported, skipped, or failed';

-- =====================================================
-- Success Message
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Generic banking provider support enabled!';
  RAISE NOTICE '📋 New tables created:';
  RAISE NOTICE '   - banking_providers (registry)';
  RAISE NOTICE '   - provider_tokens (generic OAuth/API tokens)';
  RAISE NOTICE '   - provider_accounts (generic accounts)';
  RAISE NOTICE '   - provider_transactions (generic transactions)';
  RAISE NOTICE '🔄 Migrated existing Bunq data to generic tables';
  RAISE NOTICE '🚀 Ready to add more banking providers!';
END $$;

