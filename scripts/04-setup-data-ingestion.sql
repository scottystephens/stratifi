-- =====================================================
-- Data Ingestion Tables
-- Multi-source data ingestion (CSV, BAI2, APIs, SFTP)
-- =====================================================

-- Connections: Track data sources for each tenant
CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Connection metadata
  name VARCHAR(255) NOT NULL,
  connection_type VARCHAR(50) NOT NULL, -- 'csv', 'bai2', 'plaid', 'stripe', 'sftp', 'api'
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'error', 'pending_setup'
  
  -- Configuration (integration-specific settings)
  config JSONB NOT NULL DEFAULT '{}',
  credentials JSONB, -- encrypted credentials for API integrations
  
  -- Sync settings
  sync_frequency VARCHAR(50) DEFAULT 'manual', -- 'manual', 'daily', 'hourly', 'realtime'
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  
  -- Import behavior
  import_mode VARCHAR(50) DEFAULT 'append', -- 'append' or 'override'
  
  -- Link to internal account
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Ingestion Jobs: Track each import/sync job
CREATE TABLE IF NOT EXISTS public.ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  
  -- Job details
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'partial'
  job_type VARCHAR(50) NOT NULL DEFAULT 'manual', -- 'manual', 'scheduled', 'realtime'
  
  -- Metrics
  records_fetched INTEGER DEFAULT 0,
  records_processed INTEGER DEFAULT 0,
  records_imported INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  
  -- Results
  error_message TEXT,
  error_details JSONB,
  summary JSONB, -- stats, warnings, etc.
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Raw Ingestion Data: Store original data before transformation
CREATE TABLE IF NOT EXISTS public.raw_ingestion_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.ingestion_jobs(id) ON DELETE CASCADE,
  
  -- Raw data (stored as-is)
  raw_data JSONB NOT NULL,
  file_name VARCHAR(500),
  file_size_bytes BIGINT,
  
  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  processing_errors JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Account Mappings: Link external accounts to internal accounts
CREATE TABLE IF NOT EXISTS public.account_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  
  -- Mapping
  external_account_id VARCHAR(255) NOT NULL,
  external_account_name VARCHAR(255),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Metadata from external system
  external_metadata JSONB,
  
  -- Verification
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, connection_id, external_account_id)
);

-- Ingestion Audit Log: Track all ingestion activity
CREATE TABLE IF NOT EXISTS public.ingestion_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.connections(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.ingestion_jobs(id) ON DELETE SET NULL,
  
  -- Event
  event_type VARCHAR(100) NOT NULL, -- 'connection_created', 'sync_started', 'data_imported', etc.
  event_data JSONB,
  
  -- User context
  user_id UUID REFERENCES auth.users(id),
  ip_address INET,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Enhance Transactions Table for Ingestion
-- =====================================================

-- Add ingestion tracking columns to transactions
ALTER TABLE public.transactions 
  ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES public.connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_transaction_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS import_job_id UUID REFERENCES public.ingestion_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS raw_data_id UUID REFERENCES public.raw_ingestion_data(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reconciled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;

-- Add source tracking if not exists
ALTER TABLE public.transactions 
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(50);

-- Index for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_external_id 
  ON public.transactions(tenant_id, connection_id, external_transaction_id) 
  WHERE external_transaction_id IS NOT NULL;

-- Index for connection queries
CREATE INDEX IF NOT EXISTS idx_transactions_connection_id 
  ON public.transactions(connection_id) 
  WHERE connection_id IS NOT NULL;

-- Index for import job queries
CREATE INDEX IF NOT EXISTS idx_transactions_import_job 
  ON public.transactions(import_job_id) 
  WHERE import_job_id IS NOT NULL;

-- =====================================================
-- Row-Level Security (RLS) Policies
-- =====================================================

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_ingestion_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_audit_log ENABLE ROW LEVEL SECURITY;

-- Connections Policies
CREATE POLICY "Users can view their tenant's connections" 
  ON public.connections FOR SELECT 
  USING (tenant_id IN (
    SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can insert connections" 
  ON public.connections FOR INSERT 
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can update connections" 
  ON public.connections FOR UPDATE 
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can delete connections" 
  ON public.connections FOR DELETE 
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Ingestion Jobs Policies
CREATE POLICY "Users can view their tenant's jobs" 
  ON public.ingestion_jobs FOR SELECT 
  USING (tenant_id IN (
    SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create jobs" 
  ON public.ingestion_jobs FOR INSERT 
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can update jobs" 
  ON public.ingestion_jobs FOR UPDATE 
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- Raw Ingestion Data Policies
CREATE POLICY "Users can view their tenant's raw data" 
  ON public.raw_ingestion_data FOR SELECT 
  USING (tenant_id IN (
    SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
  ));

CREATE POLICY "System can manage raw data" 
  ON public.raw_ingestion_data FOR ALL 
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- Account Mappings Policies
CREATE POLICY "Users can view their tenant's mappings" 
  ON public.account_mappings FOR SELECT 
  USING (tenant_id IN (
    SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their tenant's mappings" 
  ON public.account_mappings FOR ALL 
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );

-- Audit Log Policies
CREATE POLICY "Users can view their tenant's audit log" 
  ON public.ingestion_audit_log FOR SELECT 
  USING (tenant_id IN (
    SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
  ));

CREATE POLICY "System can insert audit log" 
  ON public.ingestion_audit_log FOR INSERT 
  WITH CHECK (true); -- Allow all inserts for audit logging

-- =====================================================
-- Indexes for Performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_connections_tenant_id ON public.connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_connections_status ON public.connections(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_account_id ON public.connections(account_id);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_tenant_id ON public.ingestion_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_connection_id ON public.ingestion_jobs(connection_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON public.ingestion_jobs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_created_at ON public.ingestion_jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_raw_data_job_id ON public.raw_ingestion_data(job_id);
CREATE INDEX IF NOT EXISTS idx_raw_data_processed ON public.raw_ingestion_data(processed);

CREATE INDEX IF NOT EXISTS idx_account_mappings_tenant ON public.account_mappings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_account_mappings_connection ON public.account_mappings(connection_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON public.ingestion_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.ingestion_audit_log(created_at DESC);

-- =====================================================
-- Updated At Triggers
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_connections_updated_at 
  BEFORE UPDATE ON public.connections 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_account_mappings_updated_at 
  BEFORE UPDATE ON public.account_mappings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Cleanup: Comments for documentation
-- =====================================================

COMMENT ON TABLE public.connections IS 'Data source connections for importing transactions';
COMMENT ON TABLE public.ingestion_jobs IS 'Tracks import/sync jobs with metrics';
COMMENT ON TABLE public.raw_ingestion_data IS 'Stores original data before transformation';
COMMENT ON TABLE public.account_mappings IS 'Maps external account IDs to internal accounts';
COMMENT ON TABLE public.ingestion_audit_log IS 'Audit trail for all ingestion activity';

COMMENT ON COLUMN public.connections.import_mode IS 'append: add new transactions | override: replace all transactions from this connection';

