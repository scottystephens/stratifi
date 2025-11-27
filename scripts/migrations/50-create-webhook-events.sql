-- Migration: Create webhook events table
-- Purpose: Store webhook events from all providers for audit trail and processing

-- =====================================================
-- Webhook Events Table
-- =====================================================

CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Provider identification
    provider TEXT NOT NULL,  -- 'xero', 'plaid', 'tink', etc.
    
    -- Event details
    event_type TEXT NOT NULL,  -- 'CREATE', 'UPDATE', 'DELETE', etc.
    event_category TEXT,  -- 'BANKTRANSACTION', 'INVOICE', etc.
    resource_id TEXT,  -- Provider's resource ID
    
    -- Payload storage
    payload JSONB NOT NULL,  -- Parsed webhook payload
    raw_payload TEXT,  -- Original raw payload for debugging
    
    -- Processing status
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    processing_error TEXT,
    
    -- Connection mapping (if we can determine it)
    connection_id UUID REFERENCES connections(id) ON DELETE SET NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    
    -- Timestamps
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- Indexes
-- =====================================================

-- Index for finding unprocessed events
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed 
ON webhook_events(provider, processed, received_at) 
WHERE processed = FALSE;

-- Index for finding events by provider and type
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_type 
ON webhook_events(provider, event_type, received_at DESC);

-- Index for finding events by connection
CREATE INDEX IF NOT EXISTS idx_webhook_events_connection 
ON webhook_events(connection_id, received_at DESC);

-- GIN index for JSONB payload queries
CREATE INDEX IF NOT EXISTS idx_webhook_events_payload 
ON webhook_events USING GIN (payload);

-- =====================================================
-- RLS Policies
-- =====================================================

-- Enable RLS
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (webhooks are system-level)
CREATE POLICY "Service role full access on webhook_events"
ON webhook_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can view webhook events for their tenants
CREATE POLICY "Users can view their tenant webhook events"
ON webhook_events
FOR SELECT
USING (
    tenant_id IN (
        SELECT ut.tenant_id 
        FROM user_tenants ut 
        WHERE ut.user_id = auth.uid()
    )
);

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE webhook_events IS 'Stores webhook events from banking providers for audit trail and processing';
COMMENT ON COLUMN webhook_events.provider IS 'Banking provider identifier (xero, plaid, tink, etc.)';
COMMENT ON COLUMN webhook_events.payload IS 'Parsed webhook payload as JSONB';
COMMENT ON COLUMN webhook_events.raw_payload IS 'Original raw payload for debugging and signature verification';
COMMENT ON COLUMN webhook_events.processed IS 'Whether the event has been processed';
COMMENT ON COLUMN webhook_events.processing_error IS 'Error message if processing failed';

-- =====================================================
-- Cleanup function for old events
-- =====================================================

-- Function to clean up old processed webhook events (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM webhook_events
    WHERE processed = TRUE
    AND received_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_webhook_events IS 'Removes processed webhook events older than 30 days';

