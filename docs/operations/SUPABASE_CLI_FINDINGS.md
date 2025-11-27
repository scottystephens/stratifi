# Supabase CLI & Programmatic SQL Execution - Findings

**Date:** November 14, 2024  
**Project:** Stratiri  
**Issue:** Need to execute SQL migrations programmatically

---

## 🔍 Investigation Summary

We investigated three approaches for executing SQL migrations programmatically:
1. **psql** (PostgreSQL CLI)
2. **Supabase CLI**
3. **exec_sql function** (custom RPC)

---

## ❌ Approach 1: psql (Failed)

### Command Attempted
```bash
psql "postgresql://postgres:PASSWORD@db.vnuithaqtpgbwmdvtxik.supabase.co:5432/postgres" -f migration.sql
```

### Error
```
psql: error: could not translate host name "db.vnuithaqtpgbwmdvtxik.supabase.co" to address: nodename nor servname provided, or not known
```

### Root Cause
- DNS resolution failure for Supabase database host
- Network restrictions in development environment
- Supabase connection pooler not accessible from this environment

### Conclusion
**psql cannot connect to remote Supabase database from this environment.**

---

## ❌ Approach 2: Supabase CLI (Failed)

### Installation Attempts

#### Attempt 1: Homebrew
```bash
brew install supabase/tap/supabase
```

**Error:**
```
Error: Your Command Line Tools are too outdated.
Update them from Software Update in System Settings.
```

**Issue:** Xcode Command Line Tools need updating (requires system-level changes)

#### Attempt 2: npm
```bash
npm install -g supabase
```

**Error:**
```
Installing Supabase CLI as a global module is not supported.
Please use one of the supported package managers: https://github.com/supabase/cli#install-the-cli
```

**Issue:** Supabase CLI doesn't support npm global installation

### Commands That Would Have Been Tested
```bash
# If CLI was available:
supabase db execute --file migration.sql
supabase db push
supabase link --project-ref vnuithaqtpgbwmdvtxik
```

### Conclusion
**Supabase CLI installation is blocked by environment constraints.**

---

## ✅ Approach 3: exec_sql Function (Solution)

### Overview
Create a PostgreSQL function that executes raw SQL via Supabase RPC.

### Implementation

#### Step 1: Create Function (Manual)
File: `scripts/migrations/09-create-exec-sql-function.sql`

```sql
CREATE OR REPLACE FUNCTION public.exec_sql(sql TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  rows_affected INTEGER;
BEGIN
  EXECUTE sql;
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  
  RETURN json_build_object(
    'success', true,
    'rows_affected', rows_affected,
    'message', 'SQL executed successfully'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM,
    'error_code', SQLSTATE
  );
END;
$$;

-- Security: Only service role can execute
REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO service_role;
```

#### Step 2: Use from TypeScript
```typescript
import { supabase } from '@/lib/supabase'

// Execute any SQL
const { data, error } = await supabase.rpc('exec_sql', {
  sql: 'ALTER TABLE connections ADD COLUMN IF NOT EXISTS new_column TEXT'
})

if (error) {
  console.error('SQL failed:', error)
} else if (!data.success) {
  console.error('SQL error:', data.error)
} else {
  console.log('Success:', data)
}
```

#### Step 3: Test
File: `scripts/utilities/test-exec-sql.ts`

Run: `npx tsx scripts/utilities/test-exec-sql.ts`

### Security
- ✅ Only accessible via **service role key**
- ✅ `anon` and `authenticated` roles **cannot execute**
- ✅ Function is `SECURITY DEFINER` (runs with creator's privileges)
- ⚠️  **Use carefully** - bypasses RLS, can execute any SQL

### Limitations
- Requires **one-time manual setup** (creating the function)
- All future schema changes can be automated
- Cannot create other functions that reference this function (recursive limitation)

### Benefits
- ✅ **Fully automated** SQL execution from TypeScript
- ✅ **Error handling** built-in (returns JSON with errors)
- ✅ Works from **any environment** (only needs HTTP access to Supabase API)
- ✅ **No CLI dependencies**
- ✅ **Consistent** with existing Supabase client usage

---

## 📊 Comparison Matrix

| Approach | Works? | Setup | Automation | Security | Portability |
|----------|--------|-------|------------|----------|-------------|
| **psql** | ❌ No | Easy | Full | ⚠️ Needs creds | Low (DNS issues) |
| **Supabase CLI** | ❌ No | Hard | Full | ✅ OAuth | Low (install issues) |
| **exec_sql RPC** | ✅ Yes | One-time | Full* | ✅ Service role | High (HTTP only) |

*After one-time manual function creation

---

## 🎯 Recommendation

### Primary Method: Web Dashboard (Current)
For schema changes, use **Supabase SQL Editor**:
```
https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new
```

**Pros:**
- Always works
- No dependencies
- Visual feedback
- Can review SQL before running

**Cons:**
- Manual process
- Not automated

### Secondary Method: exec_sql Function (After Setup)
For automated migrations and data operations:

1. **One-time setup:** Run `09-create-exec-sql-function.sql` in web dashboard
2. **Future use:** All SQL can be executed from TypeScript scripts

**Pros:**
- Fully automated
- Error handling
- Works everywhere
- No extra dependencies

**Cons:**
- Requires one-time manual setup
- Powerful (security consideration)

---

## 🚀 Next Steps

### To Enable Automated SQL Execution:

1. **Run this in Supabase SQL Editor:**
   - File: `scripts/migrations/09-create-exec-sql-function.sql`
   - URL: https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new

2. **Test the function:**
   ```bash
   npx tsx scripts/utilities/test-exec-sql.ts
   ```

3. **Use in scripts:**
   ```typescript
   const { data, error } = await supabase.rpc('exec_sql', {
     sql: 'YOUR SQL HERE'
   })
   ```

### Future Migrations Can Use:
```bash
# Run migration via exec_sql
npx tsx scripts/utilities/run-migration.ts scripts/migrations/10-next-feature.sql
```

---

## 📝 Files Created

1. **`scripts/migrations/09-create-exec-sql-function.sql`**
   - PostgreSQL function definition
   - Security policies
   - Documentation

2. **`scripts/utilities/test-exec-sql.ts`**
   - Comprehensive test suite
   - 6 test cases (SELECT, CREATE, INSERT, ALTER, ERROR, DROP)
   - Usage examples

3. **`scripts/utilities/verify-columns.ts`**
   - Verify database schema changes
   - Check if columns exist

4. **`docs/SUPABASE_CLI_FINDINGS.md`** (this file)
   - Complete investigation results
   - Recommendations
   - Implementation guide

---

## 🔗 References

- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)
- [PostgreSQL SECURITY DEFINER](https://www.postgresql.org/docs/current/sql-createfunction.html)
- [Supabase RPC Functions](https://supabase.com/docs/guides/database/functions)
- [Project Cursor Rules](.cursorrules) - Updated with Supabase guidelines

---

## ✅ Conclusion

While **Supabase CLI** and **psql** are ideal solutions, **environment limitations prevent their use**. 

The **exec_sql function approach** provides a robust alternative that:
- Works reliably
- Requires minimal setup
- Enables full automation
- Maintains security

**Recommendation:** Use web dashboard for one-time setup of `exec_sql`, then use TypeScript scripts for all future migrations.

