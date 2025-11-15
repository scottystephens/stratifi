-- =====================================================
-- Migration 11: Enhance Accounts and Connections
-- Purpose: Fix schema issues and add connection metadata
-- Date: 2025-11-15
-- =====================================================

-- =====================================================
-- PART 1: Fix provider_accounts Foreign Key
-- =====================================================

-- Drop existing foreign key if it exists (incorrect reference)
DO $$ 
BEGIN
  -- Check if constraint exists and drop it
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'provider_accounts_account_id_fkey'
  ) THEN
    ALTER TABLE provider_accounts DROP CONSTRAINT provider_accounts_account_id_fkey;
    RAISE NOTICE 'Dropped existing provider_accounts_account_id_fkey constraint';
  END IF;
END $$;

-- Change column type if needed (from TEXT to UUID)
DO $$
BEGIN
  -- Check if account_id is TEXT type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_accounts' 
    AND column_name = 'account_id' 
    AND data_type = 'text'
  ) THEN
    -- If there's data, we need to handle it carefully
    -- First, set invalid UUIDs to NULL
    UPDATE provider_accounts 
    SET account_id = NULL 
    WHERE account_id IS NOT NULL 
    AND account_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    
    -- Then alter the column type
    ALTER TABLE provider_accounts 
    ALTER COLUMN account_id TYPE UUID USING account_id::UUID;
    
    RAISE NOTICE 'Converted provider_accounts.account_id from TEXT to UUID';
  END IF;
END $$;

-- Add correct foreign key constraint
ALTER TABLE provider_accounts
ADD CONSTRAINT provider_accounts_account_id_fkey 
FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN provider_accounts.account_id IS 'Links to accounts(id) - the normalized Stratifi account';

-- =====================================================
-- PART 2: Add Connection Metadata Fields
-- =====================================================

-- Account statistics
ALTER TABLE connections ADD COLUMN IF NOT EXISTS 
  total_accounts INTEGER DEFAULT 0;

ALTER TABLE connections ADD COLUMN IF NOT EXISTS 
  active_accounts INTEGER DEFAULT 0;

-- Transaction statistics  
ALTER TABLE connections ADD COLUMN IF NOT EXISTS 
  total_transactions INTEGER DEFAULT 0;

ALTER TABLE connections ADD COLUMN IF NOT EXISTS 
  last_transaction_date TIMESTAMPTZ;

-- Sync health tracking
ALTER TABLE connections ADD COLUMN IF NOT EXISTS 
  last_successful_sync_at TIMESTAMPTZ;

ALTER TABLE connections ADD COLUMN IF NOT EXISTS 
  consecutive_failures INTEGER DEFAULT 0;

ALTER TABLE connections ADD COLUMN IF NOT EXISTS 
  sync_health_score DECIMAL(3,2) DEFAULT 1.00;

-- Rich metadata storage
ALTER TABLE connections ADD COLUMN IF NOT EXISTS 
  sync_summary JSONB DEFAULT '{}'::jsonb;

-- Add check constraint for health score
DO $$
BEGIN
  ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_health_score_check;
  ALTER TABLE connections 
    ADD CONSTRAINT connections_health_score_check 
    CHECK (sync_health_score >= 0 AND sync_health_score <= 1);
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN connections.total_accounts IS 'Total number of accounts synced from this connection';
COMMENT ON COLUMN connections.active_accounts IS 'Number of active accounts (status = active)';
COMMENT ON COLUMN connections.total_transactions IS 'Total number of transactions imported from this connection';
COMMENT ON COLUMN connections.last_transaction_date IS 'Date of the most recent transaction';
COMMENT ON COLUMN connections.last_successful_sync_at IS 'Timestamp of last successful sync (no errors)';
COMMENT ON COLUMN connections.consecutive_failures IS 'Number of consecutive failed sync attempts';
COMMENT ON COLUMN connections.sync_health_score IS 'Health score 0.00-1.00 based on sync success rate';
COMMENT ON COLUMN connections.sync_summary IS 'JSON summary of last sync: accounts, transactions, errors, warnings';

-- =====================================================
-- PART 3: Add Indexes for Performance
-- =====================================================

-- Index for account lookups by IBAN (deduplication)
CREATE INDEX IF NOT EXISTS idx_accounts_iban 
  ON accounts(iban) 
  WHERE iban IS NOT NULL;

-- Index for account lookups by external_account_id
CREATE INDEX IF NOT EXISTS idx_accounts_external_id 
  ON accounts(external_account_id) 
  WHERE external_account_id IS NOT NULL;

-- Index for account lookups by bank and account number (deduplication)
CREATE INDEX IF NOT EXISTS idx_accounts_bank_number 
  ON accounts(bank_name, account_number) 
  WHERE bank_name IS NOT NULL AND account_number IS NOT NULL;

-- Index for provider account lookups
CREATE INDEX IF NOT EXISTS idx_provider_accounts_account_id 
  ON provider_accounts(account_id) 
  WHERE account_id IS NOT NULL;

-- Index for connection health monitoring
CREATE INDEX IF NOT EXISTS idx_connections_health 
  ON connections(sync_health_score, last_successful_sync_at) 
  WHERE sync_health_score < 1.00;

-- Index for active connections needing sync
CREATE INDEX IF NOT EXISTS idx_connections_next_sync 
  ON connections(next_sync_at, status) 
  WHERE status = 'active' AND next_sync_at IS NOT NULL;

-- =====================================================
-- PART 4: Add Account Metadata Fields
-- =====================================================

-- Provider linkage (if not already exists from migration 05)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS 
  provider_id TEXT;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS 
  connection_id UUID;

-- Add foreign key for connection_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'accounts_connection_id_fkey'
  ) THEN
    ALTER TABLE accounts
    ADD CONSTRAINT accounts_connection_id_fkey 
    FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- IBAN field (if not exists)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS 
  iban VARCHAR(34);

-- BIC/SWIFT field
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS 
  bic VARCHAR(11);

-- Account holder information
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS 
  account_holder_name VARCHAR(255);

-- Add comments
COMMENT ON COLUMN accounts.provider_id IS 'Banking provider that syncs this account (e.g., tink, bunq)';
COMMENT ON COLUMN accounts.connection_id IS 'Connection that manages this account';
COMMENT ON COLUMN accounts.iban IS 'International Bank Account Number';
COMMENT ON COLUMN accounts.bic IS 'Bank Identifier Code (SWIFT)';
COMMENT ON COLUMN accounts.account_holder_name IS 'Name of the account holder';

-- =====================================================
-- PART 5: Create Helper Functions
-- =====================================================

-- Function to calculate connection health score
CREATE OR REPLACE FUNCTION calculate_connection_health(connection_uuid UUID)
RETURNS DECIMAL(3,2) AS $$
DECLARE
  total_jobs INTEGER;
  failed_jobs INTEGER;
  recent_jobs INTEGER;
  recent_failures INTEGER;
  health_score DECIMAL(3,2);
BEGIN
  -- Count total jobs in last 30 days
  SELECT COUNT(*) INTO total_jobs
  FROM ingestion_jobs
  WHERE connection_id = connection_uuid
    AND created_at > NOW() - INTERVAL '30 days';
  
  -- Count failed jobs
  SELECT COUNT(*) INTO failed_jobs
  FROM ingestion_jobs
  WHERE connection_id = connection_uuid
    AND created_at > NOW() - INTERVAL '30 days'
    AND status = 'failed';
  
  -- Count recent jobs (last 7 days)
  SELECT COUNT(*) INTO recent_jobs
  FROM ingestion_jobs
  WHERE connection_id = connection_uuid
    AND created_at > NOW() - INTERVAL '7 days';
  
  -- Count recent failures
  SELECT COUNT(*) INTO recent_failures
  FROM ingestion_jobs
  WHERE connection_id = connection_uuid
    AND created_at > NOW() - INTERVAL '7 days'
    AND status = 'failed';
  
  -- Calculate health score
  IF total_jobs = 0 THEN
    health_score := 1.00;
  ELSE
    -- Weight recent performance more heavily (70% recent, 30% historical)
    IF recent_jobs > 0 THEN
      health_score := (
        0.30 * (1.0 - (failed_jobs::DECIMAL / total_jobs)) +
        0.70 * (1.0 - (recent_failures::DECIMAL / recent_jobs))
      );
    ELSE
      health_score := 1.0 - (failed_jobs::DECIMAL / total_jobs);
    END IF;
  END IF;
  
  -- Ensure bounds
  IF health_score < 0 THEN
    health_score := 0;
  END IF;
  IF health_score > 1 THEN
    health_score := 1;
  END IF;
  
  RETURN health_score;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_connection_health IS 'Calculates health score (0-1) based on sync success rate, weighing recent performance more heavily';

-- Function to update connection statistics
CREATE OR REPLACE FUNCTION update_connection_stats(connection_uuid UUID)
RETURNS VOID AS $$
DECLARE
  account_count INTEGER;
  active_count INTEGER;
  transaction_count INTEGER;
  last_tx_date TIMESTAMPTZ;
BEGIN
  -- Count total and active accounts
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE account_status = 'active')
  INTO account_count, active_count
  FROM accounts
  WHERE connection_id = connection_uuid;
  
  -- Count transactions and get latest date
  SELECT 
    COUNT(*),
    MAX(transaction_date)
  INTO transaction_count, last_tx_date
  FROM transactions
  WHERE connection_id = connection_uuid;
  
  -- Update connection
  UPDATE connections
  SET 
    total_accounts = account_count,
    active_accounts = active_count,
    total_transactions = transaction_count,
    last_transaction_date = last_tx_date,
    sync_health_score = calculate_connection_health(connection_uuid),
    updated_at = NOW()
  WHERE id = connection_uuid;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_connection_stats IS 'Updates connection statistics: account counts, transaction counts, and health score';

-- =====================================================
-- PART 6: Create Triggers for Auto-Updates
-- =====================================================

-- Trigger to update connection stats when accounts change
CREATE OR REPLACE FUNCTION trigger_update_connection_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.connection_id IS NOT NULL THEN
      PERFORM update_connection_stats(OLD.connection_id);
    END IF;
  ELSE
    IF NEW.connection_id IS NOT NULL THEN
      PERFORM update_connection_stats(NEW.connection_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on accounts table
DROP TRIGGER IF EXISTS update_connection_stats_on_account_change ON accounts;
CREATE TRIGGER update_connection_stats_on_account_change
AFTER INSERT OR UPDATE OR DELETE ON accounts
FOR EACH ROW
EXECUTE FUNCTION trigger_update_connection_stats();

-- =====================================================
-- PART 7: Backfill Existing Data
-- =====================================================

-- Update stats for all existing connections
DO $$
DECLARE
  conn_record RECORD;
BEGIN
  FOR conn_record IN 
    SELECT id FROM connections WHERE provider IS NOT NULL
  LOOP
    PERFORM update_connection_stats(conn_record.id);
  END LOOP;
  
  RAISE NOTICE 'Updated statistics for all existing connections';
END $$;

-- =====================================================
-- PART 8: Add Materialized View for Connection Dashboard
-- =====================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS connection_dashboard AS
SELECT 
  c.id,
  c.tenant_id,
  c.name,
  c.provider,
  c.status,
  c.total_accounts,
  c.active_accounts,
  c.total_transactions,
  c.last_transaction_date,
  c.last_sync_at,
  c.last_successful_sync_at,
  c.sync_health_score,
  c.consecutive_failures,
  c.created_at,
  
  -- Aggregated stats
  COUNT(DISTINCT pa.id) as provider_accounts_count,
  SUM(CASE WHEN a.account_status = 'active' THEN a.current_balance ELSE 0 END) as total_balance,
  
  -- Latest job info
  (
    SELECT status 
    FROM ingestion_jobs 
    WHERE connection_id = c.id 
    ORDER BY created_at DESC 
    LIMIT 1
  ) as latest_job_status,
  
  (
    SELECT created_at 
    FROM ingestion_jobs 
    WHERE connection_id = c.id 
    ORDER BY created_at DESC 
    LIMIT 1
  ) as latest_job_at
  
FROM connections c
LEFT JOIN provider_accounts pa ON pa.connection_id = c.id
LEFT JOIN accounts a ON a.connection_id = c.id
WHERE c.provider IS NOT NULL
GROUP BY c.id;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS connection_dashboard_id_idx ON connection_dashboard(id);

COMMENT ON MATERIALIZED VIEW connection_dashboard IS 'Aggregated view of connection health and statistics for dashboard display';

-- =====================================================
-- PART 9: Add RLS Policies (if not exist)
-- =====================================================

-- Ensure RLS is enabled on new columns (inherits from table)
-- The existing RLS policies on connections and accounts tables will automatically apply

-- =====================================================
-- PART 10: Create Indexes for Common Queries
-- =====================================================

-- Index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_connections_provider_status 
  ON connections(provider, status) 
  WHERE provider IS NOT NULL;

-- Index for tenant dashboard
CREATE INDEX IF NOT EXISTS idx_connections_tenant_provider 
  ON connections(tenant_id, provider) 
  WHERE provider IS NOT NULL;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 11 completed successfully';
  RAISE NOTICE '   - Fixed provider_accounts foreign key';
  RAISE NOTICE '   - Added connection metadata fields';
  RAISE NOTICE '   - Created helper functions for stats and health';
  RAISE NOTICE '   - Added triggers for auto-updates';
  RAISE NOTICE '   - Created connection_dashboard materialized view';
  RAISE NOTICE '   - Backfilled existing data';
END $$;

