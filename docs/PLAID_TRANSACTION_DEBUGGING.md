# Plaid Transaction Sync Debugging

## Issue Summary

Plaid API was returning 27-42 transactions successfully, but **zero transactions were being saved to the database**.

## Root Cause Analysis

### Problem 1: Account ID Filtering Mismatch

**File:** `lib/banking-providers/plaid-provider.ts` (lines 192-196)

The `fetchTransactions` method was filtering transactions by `accountId`:

```typescript
// Filter by accountId if specified
let transactions = response.data.added;
if (accountId) {
    transactions = transactions.filter(tx => tx.account_id === accountId);
}
```

**Issue:** The `accountId` parameter passed is `providerAccount.external_account_id` (the Plaid-specific account ID like `Rd1vGpE93GHXAdMl9lDJHPw3bbvBvptaka5mV`), but it was comparing against `tx.account_id` which might not match due to case sensitivity, encoding, or timing issues.

**Result:** Filter returned **0 transactions** for each account despite Plaid returning 42 total.

### Diagnostic Logging Added

1. **In `sync-service.ts` (lines 219-248):**
   - Log raw provider_accounts count (without JOIN)
   - Log JOIN query result count  
   - Show provider_accounts details with `account_id` FK values
   - Implemented fallback query when JOIN returns 0 rows
   - Log per-account transaction counts

2. **In `plaid-provider.ts` (lines 195-204):**
   - Log total transactions from Plaid
   - Log accountId being filtered
   - Log sample transaction account_ids
   - Log count after filtering

### Problem 2: Onboarding Redirect

**File:** `app/connections/page.tsx` (line 43)

```typescript
// Old code - too aggressive
if (userTenants.length === 0 && !loading) {
  router.push('/onboarding');
}
```

**Issue:** This would redirect to `/onboarding` whenever `userTenants` array was temporarily empty during loading, even if the user had an active tenant selected.

**Fix:** Only redirect if user genuinely has no organization:

```typescript
if (userTenants.length === 0 && !loading && !currentTenant) {
  router.push('/onboarding');
}
```

## Evidence from Logs

### logs_result (2).json (Before Fix)
- `✅ Plaid sync returned: { added: 27, ... }` - API returns data
- `💳 Syncing transactions for 3 account(s)...` - Loop executes
- **NO** messages about transaction database writes
- `transactionsSynced: 0` in final summary

### logs_result (3).json (After Initial Fix)
- `🔍 Raw provider_accounts query returned 3 rows` ✅
- `🔍 JOIN query returned 3 rows` ✅
- `📊 Fetched 0 transactions for account Plaid Current Account` ❌
- `📊 Fetched 0 transactions for account Plaid Saving` ❌
- `📊 Fetched 0 transactions for account Plaid Credit Card` ❌

This confirms the JOIN is working but the **per-account filtering is returning zero**.

## Next Steps

1. **Re-test Plaid connection** after latest deployment
2. **Check new logs** - should show:
   ```
   🔍 Plaid returned 42 total transactions
   🔍 Filtering for accountId: Rd1vGpE93GHXAdMl9lDJHPw3bbvBvptaka5mV
   🔍 Sample transaction account_ids: [...]
   🔍 After filter: X transactions match accountId ...
   ```

3. **Likely Solution:** 
   - If filter still returns 0, the accountId doesn't match
   - May need to **NOT filter** by accountId for Plaid since `/transactions/sync` returns all accounts anyway
   - Or cache the full transaction list and filter in memory correctly

## Alternative Approach

If the accountId filtering continues to fail, we can optimize by:

1. **Call Plaid `/transactions/sync` once per connection** (not per account)
2. **Cache the full transaction list**
3. **Distribute transactions to accounts** by matching `tx.account_id` to `providerAccount.external_account_id`
4. **Avoid redundant API calls** (currently calling 3x for same data)

This would be more efficient and avoid the filtering issue entirely.

## Files Modified

- `lib/services/sync-service.ts` - Added diagnostic logging and fallback JOIN query
- `lib/banking-providers/plaid-provider.ts` - Added transaction filter logging
- `app/connections/page.tsx` - Fixed onboarding redirect condition
- `scripts/utilities/check-plaid-connection.sql` - Created SQL diagnostic script

## Deployment Status

- Commit: `9e46b90` - "fix: transaction filtering and onboarding redirect issues"
- Deployed: https://stratifi-3jnrxbjs8-scottystephens-projects.vercel.app
- Production: https://stratifi-pi.vercel.app (auto-promotes)

## How to Verify

1. Go to https://stratifi-pi.vercel.app/connections/new
2. Connect Plaid with test credentials:
   - Username: `user_transactions_dynamic`
   - Password: any non-blank value
3. Wait for sync to complete
4. Check Vercel logs for the new diagnostic messages
5. Navigate to an account detail page
6. Verify transactions appear in the transactions tab

If transactions still don't appear, the diagnostic logs will now show exactly where the accountId mismatch is occurring.

