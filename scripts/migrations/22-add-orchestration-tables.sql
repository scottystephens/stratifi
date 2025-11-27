-- =====================================================
-- Stratiri - Data Orchestration Infrastructure
-- Adds sync scheduling, health tracking, and API quota monitoring
-- =====================================================

-- =====================================================
-- STEP 1: Enhance Connections Table for Orchestration
-- =====================================================

-- Add sync scheduling columns
ALTER TABLE connections ADD COLUMN IF NOT EXISTS sync_schedule TEXT DEFAULT 'manual'
  CHECK (sync_schedule IN ('manual', 'hourly', '4hours', '12hours', 'daily', 'weekly', 'custom'));
ALTER TABLE connections ADD COLUMN IF NOT EXISTS sync_cron_expression TEXT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT true;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS sync_priority INTEGER DEFAULT 50 
  CHECK (sync_priority >= 0 AND sync_priority <= 100);

-- Add health tracking columns
ALTER TABLE connections ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 100 
  CHECK (health_score >= 0 AND health_score <= 100);
ALTER TABLE connections ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

-- Add metadata columns
ALTER TABLE connections ADD COLUMN IF NOT EXISTS sync_metadata JSONB DEFAULT '{}'::jsonb;

-- Create indexes for efficient sync scheduling queries
CREATE INDEX IF NOT EXISTS idx_connections_sync_schedule ON connections(sync_schedule) 
  WHERE sync_enabled = true AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_connections_next_sync ON connections(next_sync_at) 
  WHERE sync_enabled = true AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_connections_health_score ON connections(health_score);

-- =====================================================
-- STEP 2: Provider API Usage Tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS provider_api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id TEXT NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Usage metrics
  api_calls_count INTEGER DEFAULT 0,
  api_calls_limit INTEGER,
  transactions_synced INTEGER DEFAULT 0,
  accounts_synced INTEGER DEFAULT 0,
  sync_jobs_count INTEGER DEFAULT 0,
  
  -- Performance metrics
  avg_response_time_ms INTEGER,
  total_data_transferred_kb INTEGER DEFAULT 0,
  
  -- Error tracking
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(provider_id, tenant_id, date)
);

-- Indexes for usage queries
CREATE INDEX IF NOT EXISTS idx_provider_api_usage_date ON provider_api_usage(date DESC);
CREATE INDEX IF NOT EXISTS idx_provider_api_usage_provider ON provider_api_usage(provider_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_provider_api_usage_tenant ON provider_api_usage(tenant_id, date DESC);

-- =====================================================
-- STEP 3: System Health Metrics
-- =====================================================

CREATE TABLE IF NOT EXISTS system_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  metric_value NUMERIC,
  metric_unit TEXT,
  metric_metadata JSONB DEFAULT '{}'::jsonb,
  status TEXT CHECK (status IN ('healthy', 'warning', 'critical', 'unknown')) DEFAULT 'unknown',
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for latest metrics
CREATE INDEX IF NOT EXISTS idx_system_health_metrics_name_time ON system_health_metrics(metric_name, measured_at DESC);

-- =====================================================
-- STEP 4: Sync Job Performance Tracking
-- =====================================================

-- Add performance columns to ingestion_jobs
ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS api_calls_made INTEGER DEFAULT 0;
ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS provider_id TEXT;
ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS performance_metrics JSONB DEFAULT '{}'::jsonb;

-- Create index for job performance analysis
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_duration ON ingestion_jobs(duration_ms) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_provider ON ingestion_jobs(provider_id, status);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_connection ON ingestion_jobs(connection_id, status, created_at DESC);

-- =====================================================
-- STEP 5: Connection Health Calculation Function
-- =====================================================

CREATE OR REPLACE FUNCTION update_connection_health(p_connection_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_health_score INTEGER;
  v_recent_jobs_count INTEGER;
  v_failed_jobs_count INTEGER;
  v_success_rate NUMERIC;
  v_consecutive_failures INTEGER;
  v_last_sync_hours_ago NUMERIC;
BEGIN
  -- Get recent job stats (last 10 jobs)
  SELECT 
    COUNT(*),
    COUNT(CASE WHEN status = 'failed' THEN 1 END)
  INTO v_recent_jobs_count, v_failed_jobs_count
  FROM ingestion_jobs
  WHERE connection_id = p_connection_id
  ORDER BY created_at DESC
  LIMIT 10;
  
  -- Get consecutive failures
  SELECT consecutive_failures
  INTO v_consecutive_failures
  FROM connections
  WHERE id = p_connection_id;
  
  -- Calculate hours since last sync
  SELECT EXTRACT(EPOCH FROM (NOW() - last_sync_at)) / 3600
  INTO v_last_sync_hours_ago
  FROM connections
  WHERE id = p_connection_id;
  
  -- Calculate health score (0-100)
  v_health_score := 100;
  
  -- Deduct points for failures
  IF v_recent_jobs_count > 0 THEN
    v_success_rate := (v_recent_jobs_count - v_failed_jobs_count)::NUMERIC / v_recent_jobs_count;
    v_health_score := v_health_score - ((1 - v_success_rate) * 40)::INTEGER;
  END IF;
  
  -- Deduct points for consecutive failures
  v_health_score := v_health_score - (v_consecutive_failures * 15);
  
  -- Deduct points for stale connections (no sync in 7+ days)
  IF v_last_sync_hours_ago > 168 THEN -- 7 days
    v_health_score := v_health_score - 20;
  ELSIF v_last_sync_hours_ago > 72 THEN -- 3 days
    v_health_score := v_health_score - 10;
  END IF;
  
  -- Ensure health score is between 0-100
  v_health_score := GREATEST(0, LEAST(100, v_health_score));
  
  -- Update connection
  UPDATE connections
  SET health_score = v_health_score,
      updated_at = NOW()
  WHERE id = p_connection_id;
  
  RETURN v_health_score;
END;
$$;

-- =====================================================
-- STEP 6: Automatic Health Update Trigger
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_update_connection_health()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update health score after job completion
  IF NEW.status IN ('completed', 'failed') THEN
    PERFORM update_connection_health(NEW.connection_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on ingestion_jobs
DROP TRIGGER IF EXISTS trg_update_connection_health ON ingestion_jobs;
CREATE TRIGGER trg_update_connection_health
  AFTER INSERT OR UPDATE OF status ON ingestion_jobs
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'failed'))
  EXECUTE FUNCTION trigger_update_connection_health();

-- =====================================================
-- STEP 7: Connection Statistics View
-- =====================================================

CREATE OR REPLACE VIEW connection_stats AS
SELECT 
  c.id as connection_id,
  c.tenant_id,
  c.name as connection_name,
  c.provider,
  c.status,
  c.sync_schedule,
  c.sync_enabled,
  c.health_score,
  c.consecutive_failures,
  c.last_sync_at,
  c.next_sync_at,
  c.last_success_at,
  c.last_error,
  c.last_error_at,
  
  -- Job statistics (using subqueries to avoid GROUP BY issues)
  (SELECT COUNT(*) FROM ingestion_jobs ij WHERE ij.connection_id = c.id AND ij.created_at >= NOW() - INTERVAL '7 days') as jobs_last_7_days,
  (SELECT COUNT(*) FROM ingestion_jobs ij WHERE ij.connection_id = c.id AND ij.created_at >= NOW() - INTERVAL '24 hours') as jobs_last_24_hours,
  (SELECT COUNT(*) FROM ingestion_jobs ij WHERE ij.connection_id = c.id AND ij.status = 'completed') as total_successful_jobs,
  (SELECT COUNT(*) FROM ingestion_jobs ij WHERE ij.connection_id = c.id AND ij.status = 'failed') as total_failed_jobs,
  
  -- Performance metrics
  (SELECT AVG(duration_ms) FROM ingestion_jobs ij WHERE ij.connection_id = c.id AND ij.status = 'completed') as avg_duration_ms,
  COALESCE((SELECT SUM(records_imported) FROM ingestion_jobs ij WHERE ij.connection_id = c.id), 0) as total_records_imported,
  (SELECT MAX(created_at) FROM ingestion_jobs ij WHERE ij.connection_id = c.id) as last_job_at,
  
  -- Account statistics
  (SELECT COUNT(DISTINCT id) FROM provider_accounts pa WHERE pa.connection_id = c.id) as linked_accounts_count
  
FROM connections c;

-- =====================================================
-- STEP 8: RLS Policies for New Tables
-- =====================================================

-- Provider API Usage
ALTER TABLE provider_api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's API usage"
ON provider_api_usage FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Service role can manage API usage"
ON provider_api_usage FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

-- System Health Metrics
ALTER TABLE system_health_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view health metrics"
ON system_health_metrics FOR SELECT
USING (is_super_admin(auth.uid()));

CREATE POLICY "Service role can manage health metrics"
ON system_health_metrics FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

-- =====================================================
-- STEP 9: Helper Functions for Orchestration
-- =====================================================

-- Get connections ready for sync
CREATE OR REPLACE FUNCTION get_connections_ready_for_sync(p_schedule TEXT)
RETURNS TABLE (
  connection_id UUID,
  tenant_id UUID,
  provider TEXT,
  name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as connection_id,
    c.tenant_id,
    c.provider,
    c.name
  FROM connections c
  WHERE c.sync_enabled = true
    AND c.status = 'active'
    AND c.sync_schedule = p_schedule
    AND c.provider IS NOT NULL
    AND (c.next_sync_at IS NULL OR c.next_sync_at <= NOW())
  ORDER BY c.sync_priority DESC, c.last_sync_at ASC NULLS FIRST
  LIMIT 50; -- Batch limit to avoid timeouts
END;
$$;

-- Update next sync time
CREATE OR REPLACE FUNCTION update_next_sync_time(p_connection_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
  v_schedule TEXT;
  v_next_sync TIMESTAMPTZ;
BEGIN
  SELECT sync_schedule INTO v_schedule
  FROM connections
  WHERE id = p_connection_id;
  
  v_next_sync := CASE v_schedule
    WHEN 'hourly' THEN NOW() + INTERVAL '1 hour'
    WHEN '4hours' THEN NOW() + INTERVAL '4 hours'
    WHEN '12hours' THEN NOW() + INTERVAL '12 hours'
    WHEN 'daily' THEN NOW() + INTERVAL '1 day'
    WHEN 'weekly' THEN NOW() + INTERVAL '7 days'
    ELSE NULL
  END;
  
  UPDATE connections
  SET next_sync_at = v_next_sync,
      updated_at = NOW()
  WHERE id = p_connection_id;
  
  RETURN v_next_sync;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION update_connection_health TO authenticated;
GRANT EXECUTE ON FUNCTION get_connections_ready_for_sync TO authenticated;
GRANT EXECUTE ON FUNCTION update_next_sync_time TO authenticated;

-- =====================================================
-- STEP 10: Initial Data Population
-- =====================================================

-- Update existing connections with default orchestration values
UPDATE connections
SET 
  sync_schedule = 'manual',
  sync_enabled = true,
  sync_priority = 50,
  health_score = 100,
  consecutive_failures = 0
WHERE sync_schedule IS NULL;

-- Calculate initial health scores for all connections
DO $$
DECLARE
  conn RECORD;
BEGIN
  FOR conn IN SELECT id FROM connections
  LOOP
    PERFORM update_connection_health(conn.id);
  END LOOP;
END $$;

