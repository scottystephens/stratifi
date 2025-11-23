-- Add unique constraint on transactions table for upsert operations
-- This fixes the ON CONFLICT error during transaction sync

DO $$
BEGIN
  -- Check if the constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'transactions_connection_transaction_key'
  ) THEN
    -- Add unique constraint on (connection_id, transaction_id)
    ALTER TABLE transactions 
    ADD CONSTRAINT transactions_connection_transaction_key 
    UNIQUE (connection_id, transaction_id);
    
    RAISE NOTICE 'Added unique constraint on (connection_id, transaction_id) to transactions table';
  ELSE
    RAISE NOTICE 'Unique constraint already exists on transactions table';
  END IF;
END $$;

-- Add index to support the constraint (if not exists)
CREATE INDEX IF NOT EXISTS idx_transactions_connection_transaction 
ON transactions(connection_id, transaction_id);

-- Add comment
COMMENT ON CONSTRAINT transactions_connection_transaction_key ON transactions IS 
'Ensures each transaction from a connection is unique, enables upsert operations during sync';

