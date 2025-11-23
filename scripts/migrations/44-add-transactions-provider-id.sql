-- Add provider_id column to transactions table
-- This fixes the sync error where transaction batch processing fails with missing provider_id

DO $$
BEGIN
  -- Add provider_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'provider_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN provider_id TEXT;
    RAISE NOTICE 'Added provider_id column to transactions table';
  ELSE
    RAISE NOTICE 'provider_id column already exists on transactions table';
  END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_transactions_provider_id ON transactions(provider_id);

-- Add comment
COMMENT ON COLUMN transactions.provider_id IS 'Banking provider ID (plaid, tink, etc.) for tracking transaction source';

-- Note: provider_id is nullable to support manually entered transactions
