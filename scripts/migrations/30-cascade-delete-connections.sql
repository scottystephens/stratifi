-- Migration 30: Change connection foreign keys to CASCADE delete
-- Purpose: When a connection is deleted, also delete related accounts and transactions
-- This prevents orphaned data and provides cleaner data management

-- =====================================================
-- 1. Update accounts table - CASCADE delete
-- =====================================================

-- Drop existing FK constraint
ALTER TABLE accounts 
DROP CONSTRAINT IF EXISTS accounts_connection_id_fkey;

-- Add new FK constraint with CASCADE
ALTER TABLE accounts
ADD CONSTRAINT accounts_connection_id_fkey 
FOREIGN KEY (connection_id) 
REFERENCES connections(id) 
ON DELETE CASCADE;

COMMENT ON CONSTRAINT accounts_connection_id_fkey ON accounts IS 
'Cascade delete: When connection is deleted, all linked accounts are also deleted';

-- =====================================================
-- 2. Update transactions table - CASCADE delete
-- =====================================================

-- Drop existing FK constraint
ALTER TABLE transactions 
DROP CONSTRAINT IF EXISTS transactions_connection_id_fkey;

-- Add new FK constraint with CASCADE
ALTER TABLE transactions
ADD CONSTRAINT transactions_connection_id_fkey 
FOREIGN KEY (connection_id) 
REFERENCES connections(id) 
ON DELETE CASCADE;

COMMENT ON CONSTRAINT transactions_connection_id_fkey ON transactions IS 
'Cascade delete: When connection is deleted, all linked transactions are also deleted';

-- =====================================================
-- 3. Update statements table - CASCADE delete
-- =====================================================

-- Drop existing FK constraint
ALTER TABLE statements 
DROP CONSTRAINT IF EXISTS statements_connection_id_fkey;

-- Add new FK constraint with CASCADE
ALTER TABLE statements
ADD CONSTRAINT statements_connection_id_fkey 
FOREIGN KEY (connection_id) 
REFERENCES connections(id) 
ON DELETE CASCADE;

COMMENT ON CONSTRAINT statements_connection_id_fkey ON statements IS 
'Cascade delete: When connection is deleted, all linked statements are also deleted';

-- =====================================================
-- 4. Update ingestion_audit_log table - CASCADE delete
-- =====================================================

-- Drop existing FK constraint
ALTER TABLE ingestion_audit_log 
DROP CONSTRAINT IF EXISTS ingestion_audit_log_connection_id_fkey;

-- Add new FK constraint with CASCADE
ALTER TABLE ingestion_audit_log
ADD CONSTRAINT ingestion_audit_log_connection_id_fkey 
FOREIGN KEY (connection_id) 
REFERENCES connections(id) 
ON DELETE CASCADE;

-- =====================================================
-- Verification Query
-- =====================================================

-- Run this to verify CASCADE is set:
-- SELECT 
--     tc.table_name, 
--     kcu.column_name,
--     rc.delete_rule
-- FROM information_schema.table_constraints AS tc 
-- JOIN information_schema.key_column_usage AS kcu
--   ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.referential_constraints AS rc
--   ON rc.constraint_name = tc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY' 
--   AND kcu.column_name = 'connection_id'
--   AND tc.table_name IN ('accounts', 'transactions', 'statements', 'ingestion_audit_log')
-- ORDER BY tc.table_name;

