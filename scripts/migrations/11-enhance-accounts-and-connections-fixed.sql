-- =====================================================
-- Migration 11 (FIXED): Enhance Accounts and Connections
-- Purpose: Fix schema issues and add connection metadata
-- Date: 2025-11-15 (Fixed version)
-- =====================================================

-- =====================================================
-- PART 0: Determine and Standardize Accounts Primary Key
-- =====================================================

-- Check which primary key column exists and standardize on 'id' (UUID)
DO $$
DECLARE
  has_id_column BOOLEAN;
  has_account_id_column BOOLEAN;
  id_is_uuid BOOLEAN := FALSE;
BEGIN
  -- Check if 'id' column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'accounts' AND column_name = 'id'
  ) INTO has_id_column;
  
  -- Check if 'account_id' column exists  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'accounts' AND column_name = 'account_id'
  ) INTO has_account_id_column;
  
  IF has_id_column THEN
    -- Check if id is UUID type
    SELECT data_type = 'uuid' INTO id_is_uuid
    FROM information_schema.columns 
    WHERE table_name = 'accounts' AND column_name = 'id';
  END IF;
  
  RAISE NOTICE 'Accounts table schema check:';
  RAISE NOTICE '  has_id_column: %', has_id_column;
  RAISE NOTICE '  has_account_id_column: %', has_account_id_column;
  RAISE NOTICE '  id_is_uuid: %', id_is_uuid;
  
  -- If we have account_id but not id (UUID), we need to add id column
  IF has_account_id_column AND (NOT has_id_column OR NOT id_is_uuid) THEN
    RAISE NOTICE 'Adding UUID id column to accounts table...';
    
    -- Add id column if it doesn't exist
    IF NOT has_id_column THEN
      ALTER TABLE accounts ADD COLUMN id UUID DEFAULT gen_random_uuid();
      RAISE NOTICE 'Added id UUID column';
    END IF;
    
    -- Ensure all rows have a UUID id
    UPDATE accounts SET id = gen_random_uuid() WHERE id IS NULL;
    
    -- Make id NOT NULL
    ALTER TABLE accounts ALTER COLUMN id SET NOT NULL;
    
    -- Add UNIQUE constraint on id (required for foreign keys)
    ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_id_unique;
    ALTER TABLE accounts ADD CONSTRAINT accounts_id_unique UNIQUE (id);
    
    RAISE NOTICE 'ID column is now populated, NOT NULL, and UNIQUE';
  END IF;
  
  -- Now we have both account_id and id columns
  -- The primary key is still account_id, but id has a unique constraint for foreign keys
END $$;

-- =====================================================
-- PART 1: Fix provider_accounts Foreign Key
-- =====================================================

-- The provider_accounts.account_id should reference accounts.id (UUID)
-- But it may currently be TEXT type

DO $$ 
DECLARE
  provider_accounts_exists BOOLEAN;
  account_id_type TEXT;
BEGIN
  -- Check if provider_accounts table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'provider_accounts'
  ) INTO provider_accounts_exists;
  
  IF NOT provider_accounts_exists THEN
    RAISE NOTICE 'provider_accounts table does not exist, skipping foreign key fix';
    RETURN;
  END IF;
  
  -- Get current data type of provider_accounts.account_id
  SELECT data_type INTO account_id_type
  FROM information_schema.columns 
  WHERE table_name = 'provider_accounts' AND column_name = 'account_id';
  
  RAISE NOTICE 'provider_accounts.account_id type: %', account_id_type;
  
  -- Drop existing foreign key if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname LIKE '%provider_accounts%account_id%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE provider_accounts DROP CONSTRAINT ' || conname || ';'
      FROM pg_constraint 
      WHERE conname LIKE '%provider_accounts%account_id%'
      LIMIT 1
    );
    RAISE NOTICE 'Dropped existing provider_accounts foreign key constraint';
  END IF;
  
  -- If account_id is TEXT, convert to UUID
  IF account_id_type = 'text' OR account_id_type = 'character varying' THEN
    RAISE NOTICE 'Converting provider_accounts.account_id from TEXT to UUID...';
    
    -- First, set invalid UUIDs to NULL
    UPDATE provider_accounts 
    SET account_id = NULL 
    WHERE account_id IS NOT NULL 
    AND account_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    
    -- Then alter the column type
    ALTER TABLE provider_accounts 
    ALTER COLUMN account_id TYPE UUID USING account_id::UUID;
    
    RAISE NOTICE 'Converted provider_accounts.account_id to UUID';
  END IF;
  
  -- Add correct foreign key constraint to accounts.id (UUID)
  ALTER TABLE provider_accounts
  ADD CONSTRAINT provider_accounts_account_id_fkey 
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;
  
  RAISE NOTICE 'Added foreign key: provider_accounts.account_id -> accounts.id';
END $$;

COMMENT ON COLUMN provider_accounts.account_id IS 'Links to accounts(id) - the normalized Stratifi account UUID';

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
-- PART 3: Add Account Metadata Fields (BEFORE INDEXES!)
-- =====================================================

-- Provider linkage (if not already exists from migration 05)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS 
  provider_id TEXT;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS 
  connection_id UUID;

-- IBAN field (if not exists)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS 
  iban VARCHAR(34);

-- BIC/SWIFT field
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS 
  bic VARCHAR(11);

-- Account holder information
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS 
  account_holder_name VARCHAR(255);

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
    RAISE NOTICE 'Added FK: accounts.connection_id -> connections.id';
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN accounts.provider_id IS 'Banking provider that syncs this account (e.g., tink, bunq)';
COMMENT ON COLUMN accounts.connection_id IS 'Connection that manages this account';
COMMENT ON COLUMN accounts.iban IS 'International Bank Account Number';
COMMENT ON COLUMN accounts.bic IS 'Bank Identifier Code (SWIFT)';
COMMENT ON COLUMN accounts.account_holder_name IS 'Name of the account holder';

-- =====================================================
-- PART 4: Add Indexes for Performance (AFTER COLUMNS EXIST!)
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
  last_tx_date DATE;
BEGIN
  -- Count total and active accounts
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE account_status = 'active')
  INTO account_count, active_count
  FROM accounts
  WHERE connection_id = connection_uuid;
  
  -- Count transactions and get latest date
  -- Note: transactions table uses 'date' column, not 'transaction_date'
  SELECT 
    COUNT(*),
    MAX(date)
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
-- (Skipping for now due to complexity - can be added later)
-- =====================================================

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 11 (FIXED) completed successfully';
  RAISE NOTICE '   - Standardized accounts table to use UUID id column';
  RAISE NOTICE '   - Fixed provider_accounts foreign key to reference accounts.id';
  RAISE NOTICE '   - Added connection metadata fields';
  RAISE NOTICE '   - Created helper functions for stats and health';
  RAISE NOTICE '   - Added triggers for auto-updates';
  RAISE NOTICE '   - Backfilled existing data';
END $$;

