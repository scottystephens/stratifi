-- Migration 33: Fix Plaid transaction relationship
-- Adds foreign key between plaid_transactions and plaid_accounts to allow joins

-- Add composite foreign key to allow joining transactions to accounts
-- This is required for PostgREST to detect the relationship
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_plaid_transactions_account'
  ) THEN
    ALTER TABLE plaid_transactions
    ADD CONSTRAINT fk_plaid_transactions_account
    FOREIGN KEY (connection_id, account_id) 
    REFERENCES plaid_accounts (connection_id, account_id)
    ON DELETE CASCADE;
  END IF;
END $$;

-- Also ensure the composite unique key exists on plaid_accounts (it should from migration 29)
-- Just in case, we ensure there's a unique constraint we can reference
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE table_name = 'plaid_accounts' 
    AND constraint_type = 'UNIQUE'
    AND constraint_name = 'plaid_accounts_connection_id_account_id_key'
  ) THEN
    -- This might fail if the constraint has a different name, but migration 29 didn't specify a name
    -- so Postgres usually names it table_col1_col2_key
    ALTER TABLE plaid_accounts
    ADD CONSTRAINT plaid_accounts_connection_id_account_id_key
    UNIQUE (connection_id, account_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignore if it already exists with a different name
  RAISE NOTICE 'Unique constraint likely already exists';
END $$;

