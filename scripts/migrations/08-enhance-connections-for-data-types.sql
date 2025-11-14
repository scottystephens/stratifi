-- Migration: Enhance Connections for Data Types
-- Purpose: Support different connection types (transactions vs statements)
-- Date: 2024-11-14
-- Dependencies: Requires connections table from previous migrations

-- ============================================================
-- 1. ADD DATA TYPE FIELDS TO CONNECTIONS
-- ============================================================

-- Add data_type field to specify what kind of data this connection provides
ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS 
  data_type VARCHAR(20) DEFAULT 'transactions';

-- Add support for multiple data types (e.g., a connection that provides both)
ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS 
  supports_transactions BOOLEAN DEFAULT true;

ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS 
  supports_statements BOOLEAN DEFAULT false;

-- Add frequency field for how often data is retrieved
ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS 
  sync_frequency VARCHAR(20) DEFAULT 'daily'; -- 'real-time', 'hourly', 'daily', 'weekly', 'manual'

-- Add last sync timestamp
ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS 
  last_sync_at TIMESTAMPTZ;

-- Add next scheduled sync
ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS 
  next_sync_at TIMESTAMPTZ;

-- Add sync status
ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS 
  sync_status VARCHAR(20) DEFAULT 'active'; -- 'active', 'paused', 'error', 'disabled'

-- Add error tracking
ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS 
  last_error TEXT;

ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS 
  error_count INTEGER DEFAULT 0;

-- ============================================================
-- 2. ADD CHECK CONSTRAINTS
-- ============================================================

-- Ensure data_type is valid
ALTER TABLE public.connections 
  DROP CONSTRAINT IF EXISTS connections_data_type_check;

ALTER TABLE public.connections 
  ADD CONSTRAINT connections_data_type_check 
  CHECK (data_type IN ('transactions', 'statements', 'both'));

-- Ensure sync_frequency is valid
ALTER TABLE public.connections 
  DROP CONSTRAINT IF EXISTS connections_sync_frequency_check;

ALTER TABLE public.connections 
  ADD CONSTRAINT connections_sync_frequency_check 
  CHECK (sync_frequency IN ('real-time', 'intraday', 'hourly', 'daily', 'weekly', 'monthly', 'manual'));

-- Ensure sync_status is valid
ALTER TABLE public.connections 
  DROP CONSTRAINT IF EXISTS connections_sync_status_check;

ALTER TABLE public.connections 
  ADD CONSTRAINT connections_sync_status_check 
  CHECK (sync_status IN ('active', 'paused', 'error', 'disabled'));

-- Ensure at least one data type is supported
ALTER TABLE public.connections 
  DROP CONSTRAINT IF EXISTS connections_supports_data_check;

ALTER TABLE public.connections 
  ADD CONSTRAINT connections_supports_data_check 
  CHECK (supports_transactions = true OR supports_statements = true);

-- ============================================================
-- 3. UPDATE EXISTING DATA
-- ============================================================

-- Update existing CSV connections to explicitly support transactions
UPDATE public.connections 
SET 
  data_type = 'transactions',
  supports_transactions = true,
  supports_statements = false
WHERE connection_type = 'csv' AND data_type IS NULL;

-- ============================================================
-- 4. CREATE INDEXES
-- ============================================================

-- Index for data type filtering
CREATE INDEX IF NOT EXISTS idx_connections_data_type 
  ON public.connections(data_type);

-- Index for sync scheduling
CREATE INDEX IF NOT EXISTS idx_connections_next_sync 
  ON public.connections(next_sync_at) 
  WHERE sync_status = 'active' AND next_sync_at IS NOT NULL;

-- Index for error tracking
CREATE INDEX IF NOT EXISTS idx_connections_errors 
  ON public.connections(sync_status, error_count) 
  WHERE sync_status = 'error';

-- Index for active syncs
CREATE INDEX IF NOT EXISTS idx_connections_active_syncs 
  ON public.connections(tenant_id, sync_status) 
  WHERE sync_status = 'active';

-- ============================================================
-- 5. ADD COMMENTS
-- ============================================================

COMMENT ON COLUMN public.connections.data_type IS 
  'Type of data this connection provides: transactions, statements, or both';

COMMENT ON COLUMN public.connections.supports_transactions IS 
  'Whether this connection can provide transaction data';

COMMENT ON COLUMN public.connections.supports_statements IS 
  'Whether this connection can provide statement/balance data';

COMMENT ON COLUMN public.connections.sync_frequency IS 
  'How often data is synced: real-time, intraday, hourly, daily, weekly, monthly, manual';

COMMENT ON COLUMN public.connections.last_sync_at IS 
  'Timestamp of last successful sync';

COMMENT ON COLUMN public.connections.next_sync_at IS 
  'Timestamp when next sync is scheduled';

COMMENT ON COLUMN public.connections.sync_status IS 
  'Current sync status: active, paused, error, disabled';

COMMENT ON COLUMN public.connections.last_error IS 
  'Last error message encountered during sync';

COMMENT ON COLUMN public.connections.error_count IS 
  'Number of consecutive sync errors';

-- ============================================================
-- 6. CREATE HELPER FUNCTIONS
-- ============================================================

-- Function to schedule next sync based on frequency
CREATE OR REPLACE FUNCTION public.schedule_next_sync(
  p_connection_id UUID,
  p_base_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
  v_frequency VARCHAR(20);
  v_next_sync TIMESTAMPTZ;
BEGIN
  -- Get the connection's sync frequency
  SELECT sync_frequency INTO v_frequency
  FROM public.connections
  WHERE id = p_connection_id;
  
  -- Calculate next sync time based on frequency
  v_next_sync := CASE v_frequency
    WHEN 'real-time' THEN p_base_time + INTERVAL '5 minutes'
    WHEN 'intraday' THEN p_base_time + INTERVAL '4 hours'
    WHEN 'hourly' THEN p_base_time + INTERVAL '1 hour'
    WHEN 'daily' THEN p_base_time + INTERVAL '1 day'
    WHEN 'weekly' THEN p_base_time + INTERVAL '7 days'
    WHEN 'monthly' THEN p_base_time + INTERVAL '1 month'
    ELSE NULL -- manual sync
  END;
  
  -- Update the connection
  UPDATE public.connections
  SET 
    next_sync_at = v_next_sync,
    last_sync_at = p_base_time
  WHERE id = p_connection_id;
  
  RETURN v_next_sync;
END;
$$;

COMMENT ON FUNCTION public.schedule_next_sync IS 
  'Calculate and set the next sync time for a connection';

-- Function to mark sync as complete
CREATE OR REPLACE FUNCTION public.mark_sync_complete(
  p_connection_id UUID,
  p_success BOOLEAN DEFAULT true,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_success THEN
    -- Successful sync
    UPDATE public.connections
    SET 
      last_sync_at = NOW(),
      sync_status = 'active',
      error_count = 0,
      last_error = NULL,
      updated_at = NOW()
    WHERE id = p_connection_id;
    
    -- Schedule next sync
    PERFORM public.schedule_next_sync(p_connection_id, NOW());
  ELSE
    -- Failed sync
    UPDATE public.connections
    SET 
      sync_status = CASE 
        WHEN error_count + 1 >= 3 THEN 'error'
        ELSE sync_status
      END,
      error_count = error_count + 1,
      last_error = p_error_message,
      updated_at = NOW()
    WHERE id = p_connection_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.mark_sync_complete IS 
  'Mark a sync as complete (success or failure) and update connection status';

-- Function to get connections due for sync
CREATE OR REPLACE FUNCTION public.get_connections_due_for_sync(
  p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  connection_name VARCHAR(255),
  connection_type VARCHAR(50),
  data_type VARCHAR(20),
  sync_frequency VARCHAR(20),
  next_sync_at TIMESTAMPTZ,
  account_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.tenant_id,
    c.connection_name,
    c.connection_type,
    c.data_type,
    c.sync_frequency,
    c.next_sync_at,
    c.account_id
  FROM public.connections c
  WHERE c.sync_status = 'active'
    AND c.next_sync_at IS NOT NULL
    AND c.next_sync_at <= NOW()
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
  ORDER BY c.next_sync_at ASC;
END;
$$;

COMMENT ON FUNCTION public.get_connections_due_for_sync IS 
  'Get all connections that are due for syncing';

-- ============================================================
-- 7. CREATE VIEWS
-- ============================================================

-- View: Connection Sync Status
CREATE OR REPLACE VIEW public.connection_sync_status AS
SELECT 
  c.id,
  c.tenant_id,
  c.connection_name,
  c.connection_type,
  c.data_type,
  c.supports_transactions,
  c.supports_statements,
  c.sync_frequency,
  c.sync_status,
  c.last_sync_at,
  c.next_sync_at,
  c.error_count,
  c.last_error,
  a.account_name,
  a.account_number,
  CASE 
    WHEN c.next_sync_at IS NULL THEN 'Manual'
    WHEN c.next_sync_at > NOW() THEN 'Scheduled'
    ELSE 'Overdue'
  END as sync_schedule_status,
  CASE 
    WHEN c.last_sync_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (NOW() - c.last_sync_at))/3600 -- hours since last sync
  END as hours_since_last_sync
FROM public.connections c
LEFT JOIN public.accounts a ON c.account_id = a.id;

COMMENT ON VIEW public.connection_sync_status IS 
  'Overview of connection sync status and scheduling';

-- ============================================================
-- 8. GRANT PERMISSIONS
-- ============================================================

GRANT SELECT ON public.connection_sync_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_next_sync TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_sync_complete TO service_role;
GRANT EXECUTE ON FUNCTION public.get_connections_due_for_sync TO service_role;

-- ============================================================
-- SUCCESS
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Connections table enhanced for data types';
  RAISE NOTICE '✅ Added support for transactions and statements';
  RAISE NOTICE '✅ Added sync scheduling and error tracking';
  RAISE NOTICE '✅ Created helper functions for sync management';
  RAISE NOTICE '';
  RAISE NOTICE '📊 New capabilities:';
  RAISE NOTICE '  - Distinguish between transaction and statement connections';
  RAISE NOTICE '  - Automated sync scheduling';
  RAISE NOTICE '  - Error tracking and recovery';
  RAISE NOTICE '  - Support for multiple sync frequencies';
  RAISE NOTICE '';
  RAISE NOTICE '⏭️  Next: Run migrations 06 and 07 to add statements table';
END $$;

