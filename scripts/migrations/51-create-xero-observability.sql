-- Migration: Create Xero observability tables
-- Purpose: Store API logs, sync metrics, and error tracking for Xero integration

-- =====================================================
-- API Call Logs Table
-- =====================================================

CREATE TABLE IF NOT EXISTS xero_api_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    xero_tenant_id TEXT NOT NULL,
    
    -- Request details
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    
    -- Response details
    status_code INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    request_size INTEGER,
    response_size INTEGER,
    error_message TEXT,
    
    -- Rate limiting
    rate_limit_remaining INTEGER,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for API logs
CREATE INDEX IF NOT EXISTS idx_xero_api_logs_connection 
ON xero_api_logs(connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xero_api_logs_status 
ON xero_api_logs(status_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xero_api_logs_errors 
ON xero_api_logs(connection_id, created_at DESC) 
WHERE status_code >= 400;

-- =====================================================
-- Sync Metrics Table
-- =====================================================

CREATE TABLE IF NOT EXISTS xero_sync_metrics (
    id TEXT PRIMARY KEY,  -- sync_<timestamp>_<random>
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Timing
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'in_progress',
    
    -- Account metrics
    accounts_fetched INTEGER DEFAULT 0,
    accounts_created INTEGER DEFAULT 0,
    accounts_updated INTEGER DEFAULT 0,
    
    -- Transaction metrics
    transactions_fetched INTEGER DEFAULT 0,
    transactions_created INTEGER DEFAULT 0,
    transactions_updated INTEGER DEFAULT 0,
    
    -- API metrics
    api_calls_count INTEGER DEFAULT 0,
    
    -- Issues
    errors JSONB DEFAULT '[]'::JSONB,
    warnings JSONB DEFAULT '[]'::JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for sync metrics
CREATE INDEX IF NOT EXISTS idx_xero_sync_metrics_connection 
ON xero_sync_metrics(connection_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_xero_sync_metrics_status 
ON xero_sync_metrics(status, start_time DESC);

-- =====================================================
-- Error Logs Table
-- =====================================================

CREATE TABLE IF NOT EXISTS xero_error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Error details
    error_type TEXT NOT NULL,  -- 'api_error', 'auth_error', 'rate_limit', 'validation', 'unknown'
    error_code TEXT,
    error_message TEXT NOT NULL,
    context JSONB DEFAULT '{}'::JSONB,
    
    -- Resolution
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for error logs
CREATE INDEX IF NOT EXISTS idx_xero_error_logs_connection 
ON xero_error_logs(connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xero_error_logs_unresolved 
ON xero_error_logs(connection_id, created_at DESC) 
WHERE resolved = FALSE;

CREATE INDEX IF NOT EXISTS idx_xero_error_logs_type 
ON xero_error_logs(error_type, created_at DESC);

-- =====================================================
-- RLS Policies
-- =====================================================

-- Enable RLS
ALTER TABLE xero_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_sync_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_error_logs ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on xero_api_logs"
ON xero_api_logs FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on xero_sync_metrics"
ON xero_sync_metrics FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on xero_error_logs"
ON xero_error_logs FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- User read access (for their tenants)
CREATE POLICY "Users can view their tenant xero_api_logs"
ON xero_api_logs FOR SELECT
USING (
    tenant_id IN (
        SELECT ut.tenant_id FROM user_tenants ut WHERE ut.user_id = auth.uid()
    )
);

CREATE POLICY "Users can view their tenant xero_sync_metrics"
ON xero_sync_metrics FOR SELECT
USING (
    tenant_id IN (
        SELECT ut.tenant_id FROM user_tenants ut WHERE ut.user_id = auth.uid()
    )
);

CREATE POLICY "Users can view their tenant xero_error_logs"
ON xero_error_logs FOR SELECT
USING (
    tenant_id IN (
        SELECT ut.tenant_id FROM user_tenants ut WHERE ut.user_id = auth.uid()
    )
);

-- =====================================================
-- Cleanup Functions
-- =====================================================

-- Clean up old API logs (keep 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_xero_api_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM xero_api_logs
    WHERE created_at < NOW() - INTERVAL '7 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- Clean up old sync metrics (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_xero_sync_metrics()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM xero_sync_metrics
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- Clean up resolved error logs (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_xero_error_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM xero_error_logs
    WHERE resolved = TRUE
    AND created_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE xero_api_logs IS 'Tracks all API calls to Xero for monitoring and debugging';
COMMENT ON TABLE xero_sync_metrics IS 'Records sync operation metrics for performance tracking';
COMMENT ON TABLE xero_error_logs IS 'Stores error details for troubleshooting and alerting';

COMMENT ON COLUMN xero_api_logs.rate_limit_remaining IS 'Remaining API calls before hitting rate limit';
COMMENT ON COLUMN xero_sync_metrics.status IS 'in_progress, completed, failed, or partial';
COMMENT ON COLUMN xero_error_logs.error_type IS 'Category: api_error, auth_error, rate_limit, validation, unknown';

