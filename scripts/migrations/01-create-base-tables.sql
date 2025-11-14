-- =====================================================
-- TreasuryX Base Tables
-- Core financial data tables (before multi-tenancy)
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Entities (Legal entities/companies)
-- =====================================================

CREATE TABLE IF NOT EXISTS entities (
  entity_id TEXT PRIMARY KEY,
  entity_name TEXT NOT NULL,
  type TEXT NOT NULL, -- Corporation, LLC, Partnership, etc.
  jurisdiction TEXT NOT NULL,
  tax_id TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Dissolved')),
  contact_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- Accounts (Bank accounts)
-- =====================================================

CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY,
  account_name TEXT NOT NULL,
  entity_id TEXT NOT NULL REFERENCES entities(entity_id),
  bank_name TEXT NOT NULL,
  account_number TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_entity ON accounts(entity_id);

-- =====================================================
-- Transactions
-- =====================================================

CREATE TABLE IF NOT EXISTS transactions (
  transaction_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  type TEXT NOT NULL CHECK (type IN ('Credit', 'Debit')),
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Completed' CHECK (status IN ('Pending', 'Completed', 'Failed', 'Cancelled')),
  reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);

-- =====================================================
-- Payments (Scheduled/pending payments)
-- =====================================================

CREATE TABLE IF NOT EXISTS payments (
  payment_id TEXT PRIMARY KEY,
  from_account TEXT NOT NULL REFERENCES accounts(account_id),
  to_entity TEXT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  scheduled_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Pending Approval', 'Approved', 'Completed', 'Failed', 'Cancelled')),
  approver TEXT,
  description TEXT NOT NULL,
  payment_type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_from_account ON payments(from_account);
CREATE INDEX IF NOT EXISTS idx_payments_scheduled_date ON payments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- =====================================================
-- Forecasts (Cash flow forecasts)
-- =====================================================

CREATE TABLE IF NOT EXISTS forecasts (
  forecast_id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  predicted_balance DECIMAL(15, 2) NOT NULL,
  actual_balance DECIMAL(15, 2),
  variance DECIMAL(15, 2),
  confidence DECIMAL(5, 2), -- 0-100%
  entity_id TEXT NOT NULL REFERENCES entities(entity_id),
  currency TEXT NOT NULL DEFAULT 'USD',
  category TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecasts_entity ON forecasts(entity_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_date ON forecasts(date);

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE entities IS 'Legal entities (companies, subsidiaries) managed in the system';
COMMENT ON TABLE accounts IS 'Bank accounts linked to entities';
COMMENT ON TABLE transactions IS 'Historical financial transactions';
COMMENT ON TABLE payments IS 'Scheduled and pending payments';
COMMENT ON TABLE forecasts IS 'Cash flow forecasts and predictions';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Base tables created successfully!';
  RAISE NOTICE '📋 Next: Run 02-setup-multi-tenant.sql to add multi-tenancy';
END $$;

