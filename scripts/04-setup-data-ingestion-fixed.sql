-- =====================================================
-- Data Ingestion Tables (Fixed - Safe Version)
-- Multi-source data ingestion (CSV, BAI2, APIs, SFTP)
-- =====================================================

-- First, let's create tables WITHOUT foreign key constraints
-- Then add constraints after if the referenced tables exist

-- Connections: Track data sources for each tenant
CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
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
  
  -- Link to internal account (no FK constraint yet)
  account_id UUID,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

-- Ingestion Jobs: Track each import/sync job
CREATE TABLE IF NOT EXISTS public.ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  connection_id UUID NOT NULL,
  
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
  tenant_id UUID NOT NULL,
  connection_id UUID NOT NULL,
  job_id UUID NOT NULL,
  
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
  tenant_id UUID NOT NULL,
  connection_id UUID NOT NULL,
  
  -- Mapping
  external_account_id VARCHAR(255) NOT NULL,
  external_account_name VARCHAR(255),
  account_id UUID NOT NULL,
  
  -- Metadata from external system
  external_metadata JSONB,
  
  -- Verification
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verified_by UUID,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint for account mappings
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_mappings_unique 
  ON public.account_mappings(tenant_id, connection_id, external_account_id);

-- Ingestion Audit Log: Track all ingestion activity
CREATE TABLE IF NOT EXISTS public.ingestion_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  connection_id UUID,
  job_id UUID,
  
  -- Event
  event_type VARCHAR(100) NOT NULL, -- 'connection_created', 'sync_started', 'data_imported', etc.
  event_data JSONB,
  
  -- User context
  user_id UUID,
  ip_address INET,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Add Foreign Key Constraints (if tables exist)
-- =====================================================

-- Add FK for connections -> tenants (if tenants table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
    ALTER TABLE public.connections 
      DROP CONSTRAINT IF EXISTS connections_tenant_id_fkey;
    ALTER TABLE public.connections 
      ADD CONSTRAINT connections_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add FK for connections -> accounts (if accounts table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts') THEN
    ALTER TABLE public.connections 
      DROP CONSTRAINT IF EXISTS connections_account_id_fkey;
    ALTER TABLE public.connections 
      ADD CONSTRAINT connections_account_id_fkey 
      FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add FK for connections -> auth.users (if auth.users exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    ALTER TABLE public.connections 
      DROP CONSTRAINT IF EXISTS connections_created_by_fkey;
    ALTER TABLE public.connections 
      ADD CONSTRAINT connections_created_by_fkey 
      FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

-- Add FK for ingestion_jobs -> tenants
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
    ALTER TABLE public.ingestion_jobs 
      DROP CONSTRAINT IF EXISTS ingestion_jobs_tenant_id_fkey;
    ALTER TABLE public.ingestion_jobs 
      ADD CONSTRAINT ingestion_jobs_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add FK for ingestion_jobs -> connections
ALTER TABLE public.ingestion_jobs 
  DROP CONSTRAINT IF EXISTS ingestion_jobs_connection_id_fkey;
ALTER TABLE public.ingestion_jobs 
  ADD CONSTRAINT ingestion_jobs_connection_id_fkey 
  FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE CASCADE;

-- Add FK for raw_ingestion_data -> tenants
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
    ALTER TABLE public.raw_ingestion_data 
      DROP CONSTRAINT IF EXISTS raw_ingestion_data_tenant_id_fkey;
    ALTER TABLE public.raw_ingestion_data 
      ADD CONSTRAINT raw_ingestion_data_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add FK for raw_ingestion_data -> connections
ALTER TABLE public.raw_ingestion_data 
  DROP CONSTRAINT IF EXISTS raw_ingestion_data_connection_id_fkey;
ALTER TABLE public.raw_ingestion_data 
  ADD CONSTRAINT raw_ingestion_data_connection_id_fkey 
  FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE CASCADE;

-- Add FK for raw_ingestion_data -> ingestion_jobs
ALTER TABLE public.raw_ingestion_data 
  DROP CONSTRAINT IF EXISTS raw_ingestion_data_job_id_fkey;
ALTER TABLE public.raw_ingestion_data 
  ADD CONSTRAINT raw_ingestion_data_job_id_fkey 
  FOREIGN KEY (job_id) REFERENCES public.ingestion_jobs(id) ON DELETE CASCADE;

-- Add FK for account_mappings -> tenants
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
    ALTER TABLE public.account_mappings 
      DROP CONSTRAINT IF EXISTS account_mappings_tenant_id_fkey;
    ALTER TABLE public.account_mappings 
      ADD CONSTRAINT account_mappings_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add FK for account_mappings -> connections
ALTER TABLE public.account_mappings 
  DROP CONSTRAINT IF EXISTS account_mappings_connection_id_fkey;
ALTER TABLE public.account_mappings 
  ADD CONSTRAINT account_mappings_connection_id_fkey 
  FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE CASCADE;

-- Add FK for account_mappings -> accounts (if exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts') THEN
    ALTER TABLE public.account_mappings 
      DROP CONSTRAINT IF EXISTS account_mappings_account_id_fkey;
    ALTER TABLE public.account_mappings 
      ADD CONSTRAINT account_mappings_account_id_fkey 
      FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add FK for account_mappings -> auth.users (if exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    ALTER TABLE public.account_mappings 
      DROP CONSTRAINT IF EXISTS account_mappings_verified_by_fkey;
    ALTER TABLE public.account_mappings 
      ADD CONSTRAINT account_mappings_verified_by_fkey 
      FOREIGN KEY (verified_by) REFERENCES auth.users(id);
  END IF;
END $$;

-- Add FK for audit_log -> tenants
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
    ALTER TABLE public.ingestion_audit_log 
      DROP CONSTRAINT IF EXISTS ingestion_audit_log_tenant_id_fkey;
    ALTER TABLE public.ingestion_audit_log 
      ADD CONSTRAINT ingestion_audit_log_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add FK for audit_log -> connections
DO $$ 
BEGIN
  ALTER TABLE public.ingestion_audit_log 
    DROP CONSTRAINT IF EXISTS ingestion_audit_log_connection_id_fkey;
  ALTER TABLE public.ingestion_audit_log 
    ADD CONSTRAINT ingestion_audit_log_connection_id_fkey 
    FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE SET NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Add FK for audit_log -> jobs
DO $$ 
BEGIN
  ALTER TABLE public.ingestion_audit_log 
    DROP CONSTRAINT IF EXISTS ingestion_audit_log_job_id_fkey;
  ALTER TABLE public.ingestion_audit_log 
    ADD CONSTRAINT ingestion_audit_log_job_id_fkey 
    FOREIGN KEY (job_id) REFERENCES public.ingestion_jobs(id) ON DELETE SET NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Add FK for audit_log -> auth.users (if exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    ALTER TABLE public.ingestion_audit_log 
      DROP CONSTRAINT IF EXISTS ingestion_audit_log_user_id_fkey;
    ALTER TABLE public.ingestion_audit_log 
      ADD CONSTRAINT ingestion_audit_log_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES auth.users(id);
  END IF;
END $$;

-- =====================================================
-- Enhance Transactions Table for Ingestion
-- =====================================================

-- Add ingestion tracking columns to transactions (if table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transactions') THEN
    -- Add columns if they don't exist
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS connection_id UUID;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS external_transaction_id VARCHAR(255);
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS import_job_id UUID;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS raw_data_id UUID;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reconciled BOOLEAN DEFAULT FALSE;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS source_type VARCHAR(50);
    
    -- Add foreign key constraints
    ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_connection_id_fkey;
    ALTER TABLE public.transactions 
      ADD CONSTRAINT transactions_connection_id_fkey 
      FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE SET NULL;
    
    ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_import_job_id_fkey;
    ALTER TABLE public.transactions 
      ADD CONSTRAINT transactions_import_job_id_fkey 
      FOREIGN KEY (import_job_id) REFERENCES public.ingestion_jobs(id) ON DELETE SET NULL;
    
    ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_raw_data_id_fkey;
    ALTER TABLE public.transactions 
      ADD CONSTRAINT transactions_raw_data_id_fkey 
      FOREIGN KEY (raw_data_id) REFERENCES public.raw_ingestion_data(id) ON DELETE SET NULL;
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_transactions_connection_id 
      ON public.transactions(connection_id) 
      WHERE connection_id IS NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_transactions_import_job 
      ON public.transactions(import_job_id) 
      WHERE import_job_id IS NOT NULL;
  END IF;
END $$;

-- Create unique index for deduplication (if transactions table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transactions') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_external_id 
      ON public.transactions(tenant_id, connection_id, external_transaction_id) 
      WHERE external_transaction_id IS NOT NULL;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- =====================================================
-- Row-Level Security (RLS) Policies
-- =====================================================

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_ingestion_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_audit_log ENABLE ROW LEVEL SECURITY;

-- Connections Policies
DROP POLICY IF EXISTS "Users can view their tenant's connections" ON public.connections;
CREATE POLICY "Users can view their tenant's connections" 
  ON public.connections FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants 
      WHERE user_tenants.tenant_id = connections.tenant_id 
      AND user_tenants.user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

DROP POLICY IF EXISTS "Admins can insert connections" ON public.connections;
CREATE POLICY "Admins can insert connections" 
  ON public.connections FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_tenants 
      WHERE user_tenants.tenant_id = connections.tenant_id
      AND user_tenants.user_id = auth.uid() 
      AND user_tenants.role IN ('owner', 'admin')
    )
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

DROP POLICY IF EXISTS "Admins can update connections" ON public.connections;
CREATE POLICY "Admins can update connections" 
  ON public.connections FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants 
      WHERE user_tenants.tenant_id = connections.tenant_id
      AND user_tenants.user_id = auth.uid() 
      AND user_tenants.role IN ('owner', 'admin')
    )
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

DROP POLICY IF EXISTS "Admins can delete connections" ON public.connections;
CREATE POLICY "Admins can delete connections" 
  ON public.connections FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants 
      WHERE user_tenants.tenant_id = connections.tenant_id
      AND user_tenants.user_id = auth.uid() 
      AND user_tenants.role IN ('owner', 'admin')
    )
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- Ingestion Jobs Policies
DROP POLICY IF EXISTS "Users can view their tenant's jobs" ON public.ingestion_jobs;
CREATE POLICY "Users can view their tenant's jobs" 
  ON public.ingestion_jobs FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants 
      WHERE user_tenants.tenant_id = ingestion_jobs.tenant_id 
      AND user_tenants.user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

DROP POLICY IF EXISTS "Users can create jobs" ON public.ingestion_jobs;
CREATE POLICY "Users can create jobs" 
  ON public.ingestion_jobs FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_tenants 
      WHERE user_tenants.tenant_id = ingestion_jobs.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

DROP POLICY IF EXISTS "System can update jobs" ON public.ingestion_jobs;
CREATE POLICY "System can update jobs" 
  ON public.ingestion_jobs FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants 
      WHERE user_tenants.tenant_id = ingestion_jobs.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- Raw Ingestion Data Policies
DROP POLICY IF EXISTS "Users can view their tenant's raw data" ON public.raw_ingestion_data;
CREATE POLICY "Users can view their tenant's raw data" 
  ON public.raw_ingestion_data FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants 
      WHERE user_tenants.tenant_id = raw_ingestion_data.tenant_id 
      AND user_tenants.user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

DROP POLICY IF EXISTS "System can manage raw data" ON public.raw_ingestion_data;
CREATE POLICY "System can manage raw data" 
  ON public.raw_ingestion_data FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants 
      WHERE user_tenants.tenant_id = raw_ingestion_data.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- Account Mappings Policies
DROP POLICY IF EXISTS "Users can view their tenant's mappings" ON public.account_mappings;
CREATE POLICY "Users can view their tenant's mappings" 
  ON public.account_mappings FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants 
      WHERE user_tenants.tenant_id = account_mappings.tenant_id 
      AND user_tenants.user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

DROP POLICY IF EXISTS "Users can manage their tenant's mappings" ON public.account_mappings;
CREATE POLICY "Users can manage their tenant's mappings" 
  ON public.account_mappings FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants 
      WHERE user_tenants.tenant_id = account_mappings.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- Audit Log Policies
DROP POLICY IF EXISTS "Users can view their tenant's audit log" ON public.ingestion_audit_log;
CREATE POLICY "Users can view their tenant's audit log" 
  ON public.ingestion_audit_log FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants 
      WHERE user_tenants.tenant_id = ingestion_audit_log.tenant_id 
      AND user_tenants.user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

DROP POLICY IF EXISTS "System can insert audit log" ON public.ingestion_audit_log;
CREATE POLICY "System can insert audit log" 
  ON public.ingestion_audit_log FOR INSERT 
  WITH CHECK (true); -- Allow all inserts for audit logging

-- =====================================================
-- Indexes for Performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_connections_tenant_id ON public.connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_connections_status ON public.connections(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_account_id ON public.connections(account_id) WHERE account_id IS NOT NULL;

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

DROP TRIGGER IF EXISTS update_connections_updated_at ON public.connections;
CREATE TRIGGER update_connections_updated_at 
  BEFORE UPDATE ON public.connections 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_account_mappings_updated_at ON public.account_mappings;
CREATE TRIGGER update_account_mappings_updated_at 
  BEFORE UPDATE ON public.account_mappings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

