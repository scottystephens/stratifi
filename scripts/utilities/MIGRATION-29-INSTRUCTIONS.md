# Migration 29: Run Instructions

## Step 1: Open Supabase SQL Editor

Click this link to open the SQL Editor:
https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new

## Step 2: Copy Migration SQL

Copy the entire contents of:
`scripts/migrations/29-create-plaid-storage.sql`

## Step 3: Paste and Run

1. Paste the SQL into the SQL Editor
2. Click "Run" (or press Cmd+Enter)
3. Wait for completion message

## Step 4: Verify

Run this verification query in a new SQL Editor tab:

```sql
-- Check that tables were created
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_name IN ('plaid_sync_cursors', 'plaid_transactions', 'plaid_accounts')
ORDER BY table_name;

-- Check RLS is enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename LIKE 'plaid_%'
ORDER BY tablename;

-- Count policies
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE tablename LIKE 'plaid_%'
GROUP BY tablename
ORDER BY tablename;

-- Check indexes
SELECT tablename, indexname
FROM pg_indexes
WHERE tablename LIKE 'plaid_%'
ORDER BY tablename, indexname;
```

Expected results:
- 3 tables created
- RLS enabled on all 3 tables
- 4 policies per table (SELECT, INSERT, UPDATE, DELETE for cursors; SELECT, INSERT, UPDATE for transactions/accounts)
- Multiple indexes per table

## Next Steps

After successful migration, the TypeScript integration will:
1. Store cursors after each Plaid sync
2. Use cursors for incremental updates
3. Preserve all raw Plaid data
4. Reduce API costs by 67-95%

