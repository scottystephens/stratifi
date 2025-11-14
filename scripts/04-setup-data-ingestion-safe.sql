-- =====================================================
-- Data Ingestion Tables (Ultra-Safe Version)
-- Multi-source data ingestion (CSV, BAI2, APIs, SFTP)
-- =====================================================

-- Create tables WITHOUT any foreign key constraints
-- We'll add those later if the referenced tables and columns exist

-- Connections: Track data sources for each tenant
CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Connection metadata
  name VARCHAR(255) NOT NULL,
  connection_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  
  -- Configuration
  config JSONB NOT NULL DEFAULT '{}',
  credentials JSONB,
  
  -- Sync settings
  sync_frequency VARCHAR(50) DEFAULT 'manual',
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  
  -- Import behavior
  import_mode VARCHAR(50) DEFAULT 'append',
  
  -- Link to internal account (nullable, no FK yet)
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
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  job_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  
  -- Metrics
  records_fetched INTEGER DEFAULT 0,
  records_processed INTEGER DEFAULT 0,
  records_imported INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  
  -- Results
  error_message TEXT,
  error_details JSONB,
  summary JSONB,
  
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
  
  -- Raw data
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
  
  -- Metadata
  external_metadata JSONB,
  
  -- Verification
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verified_by UUID,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ingestion Audit Log
CREATE TABLE IF NOT EXISTS public.ingestion_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  connection_id UUID,
  job_id UUID,
  
  -- Event
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB,
  
  -- User context
  user_id UUID,
  ip_address INET,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Add Foreign Keys ONLY if both table AND column exist
-- =====================================================

-- Helper function to check if a column exists
CREATE OR REPLACE FUNCTION column_exists(
  p_schema TEXT,
  p_table TEXT,
  p_column TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = p_schema
      AND table_name = p_table
      AND column_name = p_column
  );
END;
$$ LANGUAGE plpgsql;

-- Add FK: connections -> tenants(id)
DO $$ 
BEGIN
  IF column_exists('public', 'tenants', 'id') THEN
    ALTER TABLE public.connections DROP CONSTRAINT IF EXISTS connections_tenant_id_fkey;
    ALTER TABLE public.connections 
      ADD CONSTRAINT connections_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: connections -> tenants';
  ELSE
    RAISE NOTICE 'Skipped FK: connections -> tenants (table or column not found)';
  END IF;
END $$;

-- Add FK: connections -> accounts(id)
DO $$ 
BEGIN
  IF column_exists('public', 'accounts', 'id') THEN
    ALTER TABLE public.connections DROP CONSTRAINT IF EXISTS connections_account_id_fkey;
    ALTER TABLE public.connections 
      ADD CONSTRAINT connections_account_id_fkey 
      FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added FK: connections -> accounts';
  ELSE
    RAISE NOTICE 'Skipped FK: connections -> accounts (table or column not found)';
  END IF;
END $$;

-- Add FK: connections -> auth.users(id)
DO $$ 
BEGIN
  IF column_exists('auth', 'users', 'id') THEN
    ALTER TABLE public.connections DROP CONSTRAINT IF EXISTS connections_created_by_fkey;
    ALTER TABLE public.connections 
      ADD CONSTRAINT connections_created_by_fkey 
      FOREIGN KEY (created_by) REFERENCES auth.users(id);
    RAISE NOTICE 'Added FK: connections -> auth.users';
  ELSE
    RAISE NOTICE 'Skipped FK: connections -> auth.users';
  END IF;
END $$;

-- Add FK: ingestion_jobs -> tenants(id)
DO $$ 
BEGIN
  IF column_exists('public', 'tenants', 'id') THEN
    ALTER TABLE public.ingestion_jobs DROP CONSTRAINT IF EXISTS ingestion_jobs_tenant_id_fkey;
    ALTER TABLE public.ingestion_jobs 
      ADD CONSTRAINT ingestion_jobs_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: ingestion_jobs -> tenants';
  ELSE
    RAISE NOTICE 'Skipped FK: ingestion_jobs -> tenants';
  END IF;
END $$;

-- Add FK: ingestion_jobs -> connections(id) [this should always work]
DO $$ 
BEGIN
  ALTER TABLE public.ingestion_jobs DROP CONSTRAINT IF EXISTS ingestion_jobs_connection_id_fkey;
  ALTER TABLE public.ingestion_jobs 
    ADD CONSTRAINT ingestion_jobs_connection_id_fkey 
    FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE CASCADE;
  RAISE NOTICE 'Added FK: ingestion_jobs -> connections';
END $$;

-- Add FK: raw_ingestion_data -> tenants(id)
DO $$ 
BEGIN
  IF column_exists('public', 'tenants', 'id') THEN
    ALTER TABLE public.raw_ingestion_data DROP CONSTRAINT IF EXISTS raw_ingestion_data_tenant_id_fkey;
    ALTER TABLE public.raw_ingestion_data 
      ADD CONSTRAINT raw_ingestion_data_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: raw_ingestion_data -> tenants';
  ELSE
    RAISE NOTICE 'Skipped FK: raw_ingestion_data -> tenants';
  END IF;
END $$;

-- Add FK: raw_ingestion_data -> connections(id)
DO $$ 
BEGIN
  ALTER TABLE public.raw_ingestion_data DROP CONSTRAINT IF EXISTS raw_ingestion_data_connection_id_fkey;
  ALTER TABLE public.raw_ingestion_data 
    ADD CONSTRAINT raw_ingestion_data_connection_id_fkey 
    FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE CASCADE;
  RAISE NOTICE 'Added FK: raw_ingestion_data -> connections';
END $$;

-- Add FK: raw_ingestion_data -> ingestion_jobs(id)
DO $$ 
BEGIN
  ALTER TABLE public.raw_ingestion_data DROP CONSTRAINT IF EXISTS raw_ingestion_data_job_id_fkey;
  ALTER TABLE public.raw_ingestion_data 
    ADD CONSTRAINT raw_ingestion_data_job_id_fkey 
    FOREIGN KEY (job_id) REFERENCES public.ingestion_jobs(id) ON DELETE CASCADE;
  RAISE NOTICE 'Added FK: raw_ingestion_data -> ingestion_jobs';
END $$;

-- Add FK: account_mappings -> tenants(id)
DO $$ 
BEGIN
  IF column_exists('public', 'tenants', 'id') THEN
    ALTER TABLE public.account_mappings DROP CONSTRAINT IF EXISTS account_mappings_tenant_id_fkey;
    ALTER TABLE public.account_mappings 
      ADD CONSTRAINT account_mappings_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: account_mappings -> tenants';
  ELSE
    RAISE NOTICE 'Skipped FK: account_mappings -> tenants';
  END IF;
END $$;

-- Add FK: account_mappings -> connections(id)
DO $$ 
BEGIN
  ALTER TABLE public.account_mappings DROP CONSTRAINT IF EXISTS account_mappings_connection_id_fkey;
  ALTER TABLE public.account_mappings 
    ADD CONSTRAINT account_mappings_connection_id_fkey 
    FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE CASCADE;
  RAISE NOTICE 'Added FK: account_mappings -> connections';
END $$;

-- Add FK: account_mappings -> accounts(id)
DO $$ 
BEGIN
  IF column_exists('public', 'accounts', 'id') THEN
    ALTER TABLE public.account_mappings DROP CONSTRAINT IF EXISTS account_mappings_account_id_fkey;
    ALTER TABLE public.account_mappings 
      ADD CONSTRAINT account_mappings_account_id_fkey 
      FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: account_mappings -> accounts';
  ELSE
    RAISE NOTICE 'Skipped FK: account_mappings -> accounts (table or column not found)';
  END IF;
END $$;

-- Add FK: account_mappings -> auth.users(id)
DO $$ 
BEGIN
  IF column_exists('auth', 'users', 'id') THEN
    ALTER TABLE public.account_mappings DROP CONSTRAINT IF EXISTS account_mappings_verified_by_fkey;
    ALTER TABLE public.account_mappings 
      ADD CONSTRAINT account_mappings_verified_by_fkey 
      FOREIGN KEY (verified_by) REFERENCES auth.users(id);
    RAISE NOTICE 'Added FK: account_mappings -> auth.users';
  ELSE
    RAISE NOTICE 'Skipped FK: account_mappings -> auth.users';
  END IF;
END $$;

-- Add FK: audit_log -> tenants(id)
DO $$ 
BEGIN
  IF column_exists('public', 'tenants', 'id') THEN
    ALTER TABLE public.ingestion_audit_log DROP CONSTRAINT IF EXISTS ingestion_audit_log_tenant_id_fkey;
    ALTER TABLE public.ingestion_audit_log 
      ADD CONSTRAINT ingestion_audit_log_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: ingestion_audit_log -> tenants';
  ELSE
    RAISE NOTICE 'Skipped FK: ingestion_audit_log -> tenants';
  END IF;
END $$;

-- Add FK: audit_log -> connections(id)
DO $$ 
BEGIN
  ALTER TABLE public.ingestion_audit_log DROP CONSTRAINT IF EXISTS ingestion_audit_log_connection_id_fkey;
  ALTER TABLE public.ingestion_audit_log 
    ADD CONSTRAINT ingestion_audit_log_connection_id_fkey 
    FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE SET NULL;
  RAISE NOTICE 'Added FK: ingestion_audit_log -> connections';
END $$;

-- Add FK: audit_log -> ingestion_jobs(id)
DO $$ 
BEGIN
  ALTER TABLE public.ingestion_audit_log DROP CONSTRAINT IF EXISTS ingestion_audit_log_job_id_fkey;
  ALTER TABLE public.ingestion_audit_log 
    ADD CONSTRAINT ingestion_audit_log_job_id_fkey 
    FOREIGN KEY (job_id) REFERENCES public.ingestion_jobs(id) ON DELETE SET NULL;
  RAISE NOTICE 'Added FK: ingestion_audit_log -> ingestion_jobs';
END $$;

-- Add FK: audit_log -> auth.users(id)
DO $$ 
BEGIN
  IF column_exists('auth', 'users', 'id') THEN
    ALTER TABLE public.ingestion_audit_log DROP CONSTRAINT IF EXISTS ingestion_audit_log_user_id_fkey;
    ALTER TABLE public.ingestion_audit_log 
      ADD CONSTRAINT ingestion_audit_log_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES auth.users(id);
    RAISE NOTICE 'Added FK: ingestion_audit_log -> auth.users';
  ELSE
    RAISE NOTICE 'Skipped FK: ingestion_audit_log -> auth.users';
  END IF;
END $$;

-- =====================================================
-- Enhance Transactions Table (if it exists)
-- =====================================================

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transactions') THEN
    -- Add columns
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS connection_id UUID;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS external_transaction_id VARCHAR(255);
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS import_job_id UUID;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS raw_data_id UUID;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reconciled BOOLEAN DEFAULT FALSE;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS source_type VARCHAR(50);
    
    -- Add foreign keys
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
    
    RAISE NOTICE 'Enhanced transactions table';
  ELSE
    RAISE NOTICE 'Transactions table not found - skipping enhancements';
  END IF;
END $$;

-- =====================================================
-- Row-Level Security (RLS) Policies
-- =====================================================

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_ingestion_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_audit_log ENABLE ROW LEVEL SECURITY;

-- Check if user_tenants table exists before creating policies that reference it
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_tenants') THEN
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

    -- Similar policies for other tables
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

    RAISE NOTICE 'Created RLS policies with user_tenants checks';
  ELSE
    RAISE NOTICE 'Skipped RLS policies - user_tenants table not found';
  END IF;
END $$;

-- Always allow audit log inserts
DROP POLICY IF EXISTS "System can insert audit log" ON public.ingestion_audit_log;
CREATE POLICY "System can insert audit log" 
  ON public.ingestion_audit_log FOR INSERT 
  WITH CHECK (true);

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_mappings_unique 
  ON public.account_mappings(tenant_id, connection_id, external_account_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON public.ingestion_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.ingestion_audit_log(created_at DESC);

-- Transactions table indexes (if table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transactions') THEN
    CREATE INDEX IF NOT EXISTS idx_transactions_connection_id 
      ON public.transactions(connection_id) 
      WHERE connection_id IS NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_transactions_import_job 
      ON public.transactions(import_job_id) 
      WHERE import_job_id IS NOT NULL;
    
    -- Unique index for deduplication (only if tenant_id column exists)
    IF column_exists('public', 'transactions', 'tenant_id') THEN
      CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_external_id 
        ON public.transactions(tenant_id, connection_id, external_transaction_id) 
        WHERE external_transaction_id IS NOT NULL;
    END IF;
    
    RAISE NOTICE 'Created transactions indexes';
  END IF;
END $$;

-- =====================================================
-- Triggers
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

-- =====================================================
-- Cleanup helper function
-- =====================================================

DROP FUNCTION IF EXISTS column_exists(TEXT, TEXT, TEXT);

-- =====================================================
-- Success Message
-- =====================================================

DO $$ 
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Data Ingestion Tables Created Successfully!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  ✓ connections';
  RAISE NOTICE '  ✓ ingestion_jobs';
  RAISE NOTICE '  ✓ raw_ingestion_data';
  RAISE NOTICE '  ✓ account_mappings';
  RAISE NOTICE '  ✓ ingestion_audit_log';
  RAISE NOTICE '';
  RAISE NOTICE 'Foreign keys added where possible';
  RAISE NOTICE 'RLS policies enabled';
  RAISE NOTICE 'Indexes created';
  RAISE NOTICE '';
  RAISE NOTICE 'Check the messages above to see which constraints were skipped';
  RAISE NOTICE '(skipped constraints will be added when the referenced tables exist)';
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;

