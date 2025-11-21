-- Check the Plaid connection state for troubleshooting
-- Connection ID: 30fa784d-31e1-42b5-ad8a-6801d163de67

-- 1. Check provider_accounts
SELECT 
  'provider_accounts' as table_name,
  id,
  account_id, -- FK to accounts.id  
  account_name,
  external_account_id,
  sync_enabled
FROM provider_accounts
WHERE connection_id = '30fa784d-31e1-42b5-ad8a-6801d163de67';

-- 2. Check accounts  
SELECT 
  'accounts' as table_name,
  id, -- PK (UUID)
  account_id, -- Business key (TEXT)
  account_name,
  connection_id
FROM accounts
WHERE connection_id = '30fa784d-31e1-42b5-ad8a-6801d163de67';

-- 3. Check if the JOIN would work (what sync-service.ts uses)
SELECT 
  'joined_query' as table_name,
  pa.id as provider_account_id,
  pa.account_id as pa_account_id_fk,
  pa.account_name,
  pa.sync_enabled,
  a.id as account_id,
  a.account_id as account_account_id
FROM provider_accounts pa
INNER JOIN accounts a ON pa.account_id = a.id
WHERE pa.connection_id = '30fa784d-31e1-42b5-ad8a-6801d163de67'
  AND pa.provider_id = 'plaid'
  AND pa.sync_enabled = true;

-- 4. Check transactions (should be 27 if working)
SELECT 
  COUNT(*) as transaction_count
FROM transactions
WHERE connection_id = '30fa784d-31e1-42b5-ad8a-6801d163de67';

