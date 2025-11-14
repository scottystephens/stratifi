-- Migration: Create Statements Table
-- Purpose: Add balance/statement reporting capability
-- Date: 2024-11-14
-- Dependencies: Requires accounts table from previous migrations

-- ============================================================
-- 1. CREATE STATEMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.statements (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign Keys
  tenant_id UUID NOT NULL,
  account_id UUID NOT NULL,
  connection_id UUID,
  
  -- Core Statement Fields
  statement_id VARCHAR(100),
  statement_date DATE NOT NULL,
  statement_period_start DATE,
  statement_period_end DATE,
  statement_type VARCHAR(20) NOT NULL DEFAULT 'daily', -- 'daily', 'intraday', 'monthly', 'closing'
  
  -- Balance Fields
  opening_balance DECIMAL(19, 4) NOT NULL,
  closing_balance DECIMAL(19, 4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  
  -- Extended Balance Fields
  available_balance DECIMAL(19, 4),
  current_balance DECIMAL(19, 4),
  collected_balance DECIMAL(19, 4),
  float_balance DECIMAL(19, 4),
  pending_deposits DECIMAL(19, 4),
  pending_withdrawals DECIMAL(19, 4),
  holds_amount DECIMAL(19, 4),
  overdraft_limit DECIMAL(19, 4),
  minimum_balance DECIMAL(19, 4),
  
  -- Summary Fields
  total_credits DECIMAL(19, 4),
  total_debits DECIMAL(19, 4),
  credit_count INTEGER,
  debit_count INTEGER,
  net_change DECIMAL(19, 4),
  average_balance DECIMAL(19, 4),
  interest_earned DECIMAL(19, 4),
  fees_charged DECIMAL(19, 4),
  
  -- Intraday Fields
  snapshot_time TIME,
  target_balance DECIMAL(19, 4),
  one_day_float DECIMAL(19, 4),
  two_day_float DECIMAL(19, 4),
  
  -- Metadata
  source VARCHAR(50),
  import_id UUID,
  raw_data JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. ADD FOREIGN KEY CONSTRAINTS
-- ============================================================

ALTER TABLE public.statements
  ADD CONSTRAINT statements_tenant_id_fkey 
  FOREIGN KEY (tenant_id) 
  REFERENCES public.tenants(id) 
  ON DELETE CASCADE;

ALTER TABLE public.statements
  ADD CONSTRAINT statements_account_id_fkey 
  FOREIGN KEY (account_id) 
  REFERENCES public.accounts(id) 
  ON DELETE CASCADE;

ALTER TABLE public.statements
  ADD CONSTRAINT statements_connection_id_fkey 
  FOREIGN KEY (connection_id) 
  REFERENCES public.connections(id) 
  ON DELETE SET NULL;

-- ============================================================
-- 3. ADD UNIQUE CONSTRAINT
-- ============================================================

-- Prevent duplicate statements for same account/date/type
ALTER TABLE public.statements
  ADD CONSTRAINT statements_unique_date 
  UNIQUE (tenant_id, account_id, statement_date, statement_type, snapshot_time);

-- ============================================================
-- 4. CREATE INDEXES
-- ============================================================

-- Primary lookup indexes
CREATE INDEX idx_statements_tenant_account 
  ON public.statements(tenant_id, account_id);

CREATE INDEX idx_statements_date 
  ON public.statements(statement_date DESC);

CREATE INDEX idx_statements_type 
  ON public.statements(statement_type);

CREATE INDEX idx_statements_connection 
  ON public.statements(connection_id) 
  WHERE connection_id IS NOT NULL;

-- Composite index for date range queries
CREATE INDEX idx_statements_account_date 
  ON public.statements(account_id, statement_date DESC);

-- Index for balance queries
CREATE INDEX idx_statements_closing_balance 
  ON public.statements(account_id, closing_balance);

-- ============================================================
-- 5. ADD ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS
ALTER TABLE public.statements ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see statements for their tenant
CREATE POLICY statements_tenant_isolation 
  ON public.statements
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- Policy: Service role can access all statements
CREATE POLICY statements_service_role 
  ON public.statements
  FOR ALL
  TO service_role
  USING (true);

-- ============================================================
-- 6. ADD COMMENTS
-- ============================================================

COMMENT ON TABLE public.statements IS 
  'Bank account statements with opening/closing balances and summary information';

COMMENT ON COLUMN public.statements.statement_type IS 
  'Type of statement: daily, intraday, monthly, or closing';

COMMENT ON COLUMN public.statements.available_balance IS 
  'Balance available for withdrawal (excluding holds and pending transactions)';

COMMENT ON COLUMN public.statements.collected_balance IS 
  'Funds that have cleared and are available';

COMMENT ON COLUMN public.statements.float_balance IS 
  'Uncollected funds (deposits not yet cleared)';

COMMENT ON COLUMN public.statements.snapshot_time IS 
  'Time of day for intraday statements (NULL for end-of-day statements)';

-- ============================================================
-- 7. CREATE UPDATED_AT TRIGGER
-- ============================================================

CREATE TRIGGER set_statements_updated_at
  BEFORE UPDATE ON public.statements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 8. GRANT PERMISSIONS
-- ============================================================

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.statements TO authenticated;
GRANT ALL ON public.statements TO service_role;

-- ============================================================
-- SUCCESS
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Statements table created successfully';
  RAISE NOTICE '✅ RLS policies enabled';
  RAISE NOTICE '✅ Indexes created for performance';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Next steps:';
  RAISE NOTICE '  1. Test statement imports';
  RAISE NOTICE '  2. Build balance trending dashboard';
  RAISE NOTICE '  3. Add statement reconciliation with transactions';
END $$;

