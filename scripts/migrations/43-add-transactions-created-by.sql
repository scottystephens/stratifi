-- Add created_by column to transactions table
-- This fixes the sync error where transaction batch processing fails

DO $$
BEGIN
  -- Add created_by column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE transactions ADD COLUMN created_by UUID REFERENCES auth.users(id);
    RAISE NOTICE 'Added created_by column to transactions table';
  ELSE
    RAISE NOTICE 'created_by column already exists on transactions table';
  END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions(created_by);

-- Add comment
COMMENT ON COLUMN transactions.created_by IS 'User who created/imported this transaction';

-- Update existing transactions to have a default created_by if needed
-- (This will be handled by the sync service going forward)
