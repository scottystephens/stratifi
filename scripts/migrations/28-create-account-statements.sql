-- Migration 28: Account Statements (Daily Balances)
-- Creates table to store end-of-day balances per account with source/confidence metadata

-- Enable uuid extension if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS account_statements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  statement_date DATE NOT NULL,
  ending_balance NUMERIC(20, 4) NOT NULL,
  available_balance NUMERIC(20, 4),
  currency TEXT NOT NULL,
  usd_equivalent NUMERIC(20, 4),
  source TEXT NOT NULL CHECK (source IN ('synced', 'calculated', 'manual', 'imported')),
  confidence TEXT NOT NULL DEFAULT 'high' CHECK (confidence IN ('high', 'medium', 'low')),
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT account_statements_account_date_unique UNIQUE (account_id, statement_date)
);

COMMENT ON TABLE account_statements IS 'Daily balance snapshots per account (synced/manual statements).';
COMMENT ON COLUMN account_statements.source IS 'synced = provider API, calculated = derived from ledger, manual/imported = user provided.';

CREATE INDEX IF NOT EXISTS idx_account_statements_tenant_date
  ON account_statements (tenant_id, statement_date DESC);

CREATE INDEX IF NOT EXISTS idx_account_statements_account_date
  ON account_statements (account_id, statement_date DESC);

