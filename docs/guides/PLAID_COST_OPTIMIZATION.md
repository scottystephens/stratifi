# Plaid API Cost Optimization Strategy

## Overview

Plaid charges per API call, so minimizing unnecessary requests is critical for production cost control. This document outlines our multi-layered optimization strategy.

## Current Issues (Before Optimization)

### ❌ Problem 1: No Cursor Storage
- Every sync calls `/transactions/sync` **without a cursor**
- This returns **ALL transactions from the beginning** every time
- Extremely expensive for accounts with thousands of transactions

### ❌ Problem 2: Multiple API Calls Per Sync
- Current code calls `/transactions/sync` **once per account** (3 calls for 3 accounts)
- Plaid returns **all transactions for all accounts** in each call
- We're paying 3x for the same data and filtering client-side

### ❌ Problem 3: No Throttling for Plaid
- `determineSyncDateRange` calculates date ranges (good for other providers)
- But Plaid ignores date ranges - cursor is the only mechanism
- We're calculating ranges we don't use, and NOT checking cursor freshness

## Optimization Strategy

### ✅ Solution 1: Cursor-Based Incremental Sync

**New Tables:**

```sql
-- Store cursor per connection
CREATE TABLE plaid_sync_cursors (
    connection_id UUID PRIMARY KEY,
    cursor TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ,
    transactions_added INTEGER,
    has_more BOOLEAN
);
```

**How It Works:**

```typescript
// First sync: no cursor
const response = await plaidClient.transactionsSync({
    access_token: token,
    // cursor: undefined
});
// Returns: ALL transactions + next_cursor
// Store: cursor for next time

// Second sync: with cursor
const response = await plaidClient.transactionsSync({
    access_token: token,
    cursor: stored_cursor // Only returns CHANGES since cursor
});
// Returns: ONLY new/modified/removed transactions
// Store: new cursor

// Result: 1000 txns → 5 txns (99.5% reduction!)
```

**API Cost Savings:**
- Initial sync: 1 API call (unavoidable)
- Subsequent syncs: 1 API call returning only deltas
- Example: If 5 new transactions/day → **5 transactions** instead of **10,000 total**

### ✅ Solution 2: Call /transactions/sync Once Per Connection

**Current (Inefficient):**
```typescript
for (const account of accounts) {
    // Call Plaid 3 times for same data
    const txns = await plaid.transactionsSync({ account_id: account.id });
    // Filter client-side
}
// Cost: 3 API calls
```

**Optimized:**
```typescript
// Call Plaid ONCE for all accounts
const response = await plaid.transactionsSync({ cursor });

// Distribute transactions by account in-memory
for (const account of accounts) {
    const accountTxns = response.data.added.filter(
        tx => tx.account_id === account.plaid_account_id
    );
    // Process each account's transactions
}
// Cost: 1 API call (3x reduction!)
```

### ✅ Solution 3: Store All Raw Plaid Data

**New Tables:**

```sql
-- Preserve ALL Plaid transaction data
CREATE TABLE plaid_transactions (
    id UUID PRIMARY KEY,
    transaction_id TEXT UNIQUE, -- Plaid's ID
    account_id TEXT, -- Plaid's account_id
    
    -- All Plaid fields (30+ columns)
    amount DECIMAL,
    name TEXT,
    merchant_name TEXT,
    category TEXT[],
    personal_finance_category_primary TEXT,
    location_lat DECIMAL,
    location_lon DECIMAL,
    payment_channel TEXT,
    counterparty_name TEXT,
    
    -- Full raw JSON for future-proofing
    raw_data JSONB,
    
    -- Import tracking
    sync_action TEXT, -- 'added', 'modified', 'removed'
    imported_to_transactions BOOLEAN DEFAULT FALSE
);

-- Similar for accounts
CREATE TABLE plaid_accounts (
    account_id TEXT PRIMARY KEY,
    raw_data JSONB,
    stratifi_account_id UUID REFERENCES accounts(id)
);
```

**Benefits:**
1. **Future-proof**: Plaid adds new fields → we already have them in `raw_data`
2. **Audit trail**: See exactly what Plaid sent vs what we imported
3. **Data mining**: Rich categorization, location data, merchant info
4. **Troubleshooting**: Can replay imports without calling Plaid API
5. **Modified/removed transactions**: Track transaction lifecycle

### ✅ Solution 4: Smart Sync Throttling

**Sync Frequency Matrix:**

| User Action | Throttle | Cursor Used | API Calls | Cost |
|-------------|----------|-------------|-----------|------|
| Initial connection | None | No (first sync) | 1-N (pagination) | $$ |
| Auto-sync (hourly) | 1 hour | Yes | 1 (likely 0 results) | $ |
| Manual "Sync Now" | None | Yes | 1 | $ |
| Webhook trigger | None | Yes | 1 | $ |
| Cron (4 hours) | 4 hours | Yes | 1 | $ |

**Implementation:**

```typescript
export async function shouldSyncPlaidConnection(
  connectionId: string,
  minHoursSinceLastSync: number = 1
): Promise<{ shouldSync: boolean; reason: string }> {
  
  const cursorData = await getCursor(connectionId);

  // Never synced
  if (!cursorData) {
    return { shouldSync: true, reason: 'initial_sync' };
  }

  // Has more pages to fetch
  if (cursorData.has_more) {
    return { shouldSync: true, reason: 'pagination_incomplete' };
  }

  // Check throttle
  const hoursSince = (now - cursorData.last_sync_at) / 3600000;
  
  if (hoursSince >= minHoursSinceLastSync) {
    return { shouldSync: true, reason: `${hoursSince}h since last` };
  }

  return { 
    shouldSync: false, 
    reason: `Synced ${hoursSince}h ago` 
  };
}
```

## Implementation Plan

### Phase 1: Database Setup ✅
- [x] Create migration 29: `plaid_sync_cursors`, `plaid_transactions`, `plaid_accounts`
- [ ] Run migration in Supabase SQL Editor
- [ ] Verify tables created with correct RLS policies

### Phase 2: Plaid Sync Service ✅
- [x] Create `lib/services/plaid-sync-service.ts`
- [ ] Implement `syncPlaidTransactions()` with cursor storage
- [ ] Implement pagination loop (handle `has_more`)
- [ ] Implement `storePlaidTransaction()` with all fields
- [ ] Implement `importPlaidTransactionsToMain()` for business logic layer

### Phase 3: Update PlaidProvider
- [ ] Modify `fetchTransactions()` to use cursor-based service
- [ ] Remove accountId filtering (fetch once per connection)
- [ ] Return all transactions, let caller distribute by account

### Phase 4: Integration
- [ ] Update `sync-service.ts` to use Plaid-specific service for `providerId === 'plaid'`
- [ ] Add throttle check before syncing
- [ ] Update sync summary to include cursor info

### Phase 5: Webhook Support (Future)
- [ ] Add webhook endpoint `/api/webhooks/plaid`
- [ ] Handle `SYNC_UPDATES_AVAILABLE` webhook
- [ ] Trigger sync only when Plaid notifies us (zero-cost polling!)

## API Call Reduction Examples

### Example 1: Daily Auto-Sync

**Before Optimization:**
- 3 accounts × 24 syncs/day = 72 API calls/day
- Each call returns 10,000 historical transactions
- Monthly cost: ~$220/month (assuming $0.10/call)

**After Optimization:**
- 1 call × 24 syncs/day = 24 API calls/day
- Each call returns ~5 new transactions (cursor-based)
- Monthly cost: ~$72/month (67% reduction!)

**With Webhooks:**
- ~4 syncs/day (only when Plaid detects changes)
- Monthly cost: ~$12/month (95% reduction!)

### Example 2: Manual Sync

**Before Optimization:**
```
User clicks "Sync Now"
→ 3 API calls (one per account)
→ Returns 10,000 + 10,000 + 10,000 = 30,000 transactions
→ Filters to 5 new ones
Cost: $0.30
```

**After Optimization:**
```
User clicks "Sync Now"
→ 1 API call with cursor
→ Returns 5 new transactions
→ No filtering needed
Cost: $0.10 (67% reduction)
```

### Example 3: Large Account (10,000 transactions)

**Before Optimization:**
- Every sync: Fetch all 10,000 transactions
- Filter to find ~10 new ones
- Bandwidth: ~5 MB per sync
- Latency: ~3-5 seconds

**After Optimization:**
- First sync: Fetch all 10,000 (one-time)
- Subsequent syncs: Fetch ~10 new ones
- Bandwidth: ~5 KB per sync (99.9% reduction!)
- Latency: ~300ms (10x faster!)

## Monitoring & Metrics

Add to admin dashboard:

```typescript
interface PlaidSyncMetrics {
  totalConnections: number;
  totalCursorStored: number; // Connections using incremental sync
  avgTransactionsPerSync: number; // Should be low if cursor works
  apiCallsToday: number;
  apiCallsSavedToday: number; // Estimated based on cursor usage
  costSavingsPercent: number;
}
```

## Migration Checklist

### Database Setup
1. Run migration 29 in Supabase SQL Editor
2. Verify tables:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_name IN ('plaid_sync_cursors', 'plaid_transactions', 'plaid_accounts');
   ```
3. Check RLS policies:
   ```sql
   SELECT * FROM pg_policies WHERE tablename LIKE 'plaid_%';
   ```

### Code Integration
1. Import `plaid-sync-service` in `plaid-provider.ts`
2. Update `fetchTransactions()` to delegate to cursor-based service
3. Update `sync-service.ts` to call Plaid service once per connection
4. Add cursor info to sync summary/logs
5. Test with sandbox account

### Testing
1. Delete existing Plaid connection
2. Create new connection (should do initial sync, store cursor)
3. Check `plaid_sync_cursors` table for cursor
4. Click "Sync Now" immediately (should skip or return 0 results)
5. Wait 1 hour, sync again (should use cursor, return only new txns)
6. Verify logs show "Using stored cursor for incremental sync"

## Expected Results

After full implementation:

✅ **First sync:** 1 API call → stores cursor  
✅ **Second sync (< 1 hour):** Skipped (throttled)  
✅ **Third sync (> 1 hour):** 1 API call with cursor → returns only deltas  
✅ **Cost reduction:** 67-95% depending on sync frequency  
✅ **Speed improvement:** 10-100x faster for incremental syncs  
✅ **Data preservation:** ALL Plaid metadata stored for future use  

## Production Rollout Plan

1. **Week 1:** Deploy new tables + service (shadow mode)
   - New tables collect data
   - Old sync path still works
   - Monitor cursor storage

2. **Week 2:** Switch to cursor-based sync
   - Update `plaid-provider.ts` to use new service
   - Monitor API call counts in Vercel
   - Compare costs before/after

3. **Week 3:** Add webhooks
   - Implement `/api/webhooks/plaid`
   - Register webhook URL with Plaid
   - Reduce polling to webhook-only

4. **Week 4:** Cleanup
   - Remove old sync code path
   - Add admin dashboard metrics
   - Document cost savings

## Files to Update

- ✅ `scripts/migrations/29-create-plaid-storage.sql` - Database schema
- ✅ `lib/services/plaid-sync-service.ts` - Cursor-based sync logic
- ⏳ `lib/banking-providers/plaid-provider.ts` - Delegate to plaid-sync-service
- ⏳ `lib/services/sync-service.ts` - Use Plaid service for providerId==='plaid'
- ⏳ `app/api/webhooks/plaid/route.ts` - Webhook handler (future)
- ⏳ `app/admin/page.tsx` - Add Plaid metrics dashboard (future)

## Next Steps

1. Run migration 29 in Supabase SQL Editor
2. Update `plaid-provider.ts` to use `plaid-sync-service`
3. Test initial sync + incremental sync
4. Monitor API call reduction in production

