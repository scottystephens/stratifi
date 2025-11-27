# Transaction Sync Strategy for Banking Providers

## Overview

This document outlines the strategy for syncing transactions from banking providers (like Tink) to Stratiri. The goals are:

1. **Completeness**: Always have up-to-date transaction data
2. **Efficiency**: Minimize API calls to reduce costs
3. **Reliability**: Handle failures gracefully and recover

---

## Current Implementation

### Sync Triggers

1. **Initial OAuth Sync** (automatic)
   - Triggered: When user first connects bank account
   - Duration: Last 30 days
   - Per-account limit: 100 transactions

2. **Manual Sync** (user-triggered)
   - Triggered: User clicks "Sync" button
   - Duration: Last 90 days (configurable)
   - Per-account limit: 500 transactions (configurable)

3. **Scheduled Sync** (NOT YET IMPLEMENTED)
   - Frequency: TBD (daily, hourly, etc.)

### Current Date Ranges

```typescript
// Initial sync (OAuth callback)
startDate = today - 30 days
endDate = today
limit = 100 per account

// Manual sync
startDate = today - 90 days (default)
endDate = today
limit = 500 per account
```

---

## Recommended Strategy

### 1. Intelligent Incremental Sync

Instead of always fetching 90 days of data, fetch only **new transactions** since the last sync.

#### Implementation

```typescript
// Determine start date based on last transaction
const lastTransaction = await getLastTransactionDate(accountId, connectionId);

if (lastTransaction) {
  // Incremental: Get transactions since last sync (with 1-day overlap for safety)
  startDate = new Date(lastTransaction.getTime() - (1 * 24 * 60 * 60 * 1000));
} else {
  // Initial backfill: Get transactions for desired historical period
  startDate = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000)); // 90 days
}

endDate = new Date(); // Always fetch up to today
```

#### Benefits
- ✅ Dramatically reduces API calls (only fetch new transactions)
- ✅ Faster sync times (less data to process)
- ✅ Lower cost (fewer API requests)
- ✅ 1-day overlap catches any missed/updated transactions

---

### 2. Sync Scheduling Strategy

#### Option A: Time-Based Scheduling (Recommended)

**Daily Sync (Low Cost, Most Common)**
- Frequency: Once per day (e.g., 2 AM)
- Window: Last 2 days (with 1-day overlap)
- Best for: Most users, non-time-critical data

**Hourly Sync (Medium Cost)**
- Frequency: Every hour
- Window: Last 2 hours (with overlap)
- Best for: Businesses needing near-real-time data

**Real-Time Sync (High Cost)**
- Frequency: Every 15-30 minutes
- Window: Last 1 hour
- Best for: High-value accounts, critical monitoring

#### Option B: Event-Based Scheduling

**User-Triggered**
- When: User views account/transactions page
- Condition: Only if last sync > X hours ago
- Throttle: Max 1 sync per hour per account

**Connection Health Monitoring**
- When: Connection health score drops
- Action: Attempt sync to refresh data

---

### 3. Historical Backfill Strategy

When a connection is first established or reconnected after a long period:

#### Recommended Backfill Periods

| Account Type | Backfill Period | Reasoning |
|--------------|----------------|-----------|
| Operating accounts | 90 days | 3 months for reconciliation |
| Savings accounts | 180 days | 6 months for interest tracking |
| Credit cards | 365 days | 1 year for expense analysis |
| Loan accounts | 365 days | Full year for payment history |

#### Implementation

```typescript
const backfillPeriods: Record<string, number> = {
  'checking': 90,
  'savings': 180,
  'credit_card': 365,
  'loan': 365,
  'default': 90,
};

const daysToBackfill = backfillPeriods[accountType] || backfillPeriods.default;
const startDate = new Date(Date.now() - (daysToBackfill * 24 * 60 * 60 * 1000));
```

---

### 4. Cost-Optimized Sync Logic

#### Decision Tree

```
┌─ Is this the first sync? ─┐
│                             │
│  YES                        │  NO
│  ↓                          │  ↓
│  Backfill period           │  Check last sync time
│  (90-365 days)             │  ↓
│                             │  < 24 hours ago? → Skip (unless forced)
│                             │  > 24 hours ago? → Incremental sync
│                             │  > 7 days ago? → Larger window (7 days)
│                             │  > 30 days ago? → Full backfill
└─────────────────────────────┘
```

#### Pseudocode

```typescript
async function determineSync DateRange(account, connection) {
  const now = new Date();
  const lastSync = account.last_synced_at ? new Date(account.last_synced_at) : null;
  
  // First-time sync
  if (!lastSync) {
    const backfillDays = getBackfillPeriod(account.account_type);
    return {
      startDate: new Date(now.getTime() - (backfillDays * 24 * 60 * 60 * 1000)),
      endDate: now,
      reason: 'initial_backfill'
    };
  }
  
  // Calculate days since last sync
  const daysSinceSync = (now.getTime() - lastSync.getTime()) / (24 * 60 * 60 * 1000);
  
  // Very recent sync - skip unless forced
  if (daysSinceSync < 1) {
    return {
      skip: true,
      reason: 'recently_synced'
    };
  }
  
  // Recent sync - incremental (1-day overlap)
  if (daysSinceSync <= 7) {
    return {
      startDate: new Date(lastSync.getTime() - (1 * 24 * 60 * 60 * 1000)),
      endDate: now,
      reason: 'incremental'
    };
  }
  
  // Moderate gap - larger window (1-week overlap)
  if (daysSinceSync <= 30) {
    return {
      startDate: new Date(lastSync.getTime() - (7 * 24 * 60 * 60 * 1000)),
      endDate: now,
      reason: 'moderate_gap'
    };
  }
  
  // Large gap - full backfill
  const backfillDays = getBackfillPeriod(account.account_type);
  return {
    startDate: new Date(now.getTime() - (backfillDays * 24 * 60 * 60 * 1000)),
    endDate: now,
    reason: 'long_gap_backfill'
  };
}
```

---

### 5. Transaction Deduplication

Tink and other providers use unique transaction IDs. Our current schema enforces uniqueness:

```sql
UNIQUE (connection_id, provider_id, external_transaction_id)
```

#### Upsert Strategy

```typescript
await supabase.from('provider_transactions').upsert(
  transaction,
  {
    onConflict: 'connection_id,provider_id,external_transaction_id',
    // This prevents duplicates and updates existing records
  }
);
```

#### Edge Cases

1. **Pending → Booked**: Transaction ID may stay the same but amount/date changes
   - Solution: Upsert updates the existing record

2. **Bank Corrections**: Transaction may be reversed/adjusted
   - Solution: Track `booking_status` in metadata

3. **Duplicate Detection Window**: 
   - Always include 1-day overlap in sync window
   - Catches late-arriving transactions

---

### 6. Pagination Strategy

Tink supports pagination, but we need to handle large result sets efficiently.

#### Current Approach

```typescript
// Single page fetch
const transactions = await provider.fetchTransactions(
  credentials,
  accountId,
  { 
    startDate,
    endDate,
    limit: 500 // Max per request
  }
);
```

#### Recommended: Paginated Fetching

```typescript
async function fetchAllTransactions(
  provider,
  credentials,
  accountId,
  startDate,
  endDate,
  pageSize = 500
) {
  let allTransactions = [];
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const transactions = await provider.fetchTransactions(
      credentials,
      accountId,
      { 
        startDate,
        endDate,
        limit: pageSize,
        offset
      }
    );
    
    allTransactions.push(...transactions);
    
    // Check if there are more results
    hasMore = transactions.length === pageSize;
    offset += pageSize;
    
    // Safety limit: max 10 pages (5000 transactions)
    if (offset >= 5000) {
      console.warn(`Reached pagination limit for account ${accountId}`);
      break;
    }
  }
  
  return allTransactions;
}
```

---

### 7. Error Handling & Retry Strategy

#### Transient Errors (Retry)

- Network timeouts
- Rate limiting (429)
- Temporary server errors (500, 502, 503)

**Strategy**: Exponential backoff

```typescript
async function fetchWithRetry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      // Exponential backoff: 2^attempt seconds
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

#### Permanent Errors (Don't Retry)

- Invalid credentials (401)
- Account closed/blocked (403)
- Malformed request (400)

**Strategy**: Record error, mark connection as needing attention

---

### 8. Monitoring & Alerting

#### Key Metrics to Track

1. **Sync Success Rate**
   - Target: > 95%
   - Alert if: < 90% for 24 hours

2. **API Call Volume**
   - Track calls per day per connection
   - Alert if: Unusual spike (2x normal)

3. **Transaction Completeness**
   - Compare expected vs actual transaction count
   - Alert if: Large gaps detected

4. **Sync Latency**
   - Time from sync trigger to completion
   - Target: < 30 seconds for incremental, < 2 minutes for backfill

#### Dashboard Metrics

```typescript
interface SyncMetrics {
  total_syncs_24h: number;
  successful_syncs_24h: number;
  failed_syncs_24h: number;
  avg_sync_duration_ms: number;
  total_transactions_synced_24h: number;
  api_calls_24h: number;
  estimated_cost_24h: number;
}
```

---

## Recommended Implementation Plan

### Phase 1: Optimize Existing Sync (Immediate)

1. ✅ **Already Done**: Basic transaction sync with configurable date ranges
2. **Add**: Intelligent date range calculation (incremental vs backfill)
3. **Add**: Pagination support for large transaction sets
4. **Add**: Per-account-type backfill periods

### Phase 2: Scheduled Background Sync (Next)

1. **Add**: Scheduled job system (cron, Vercel Cron, or external service)
2. **Add**: Daily sync for all active connections
3. **Add**: Sync throttling (prevent too-frequent syncs)
4. **Add**: Connection health monitoring

### Phase 3: Advanced Features (Future)

1. **Add**: Real-time webhooks (if Tink supports)
2. **Add**: Smart sync frequency (based on account activity)
3. **Add**: Cost optimization dashboard
4. **Add**: Transaction categorization & enrichment

---

## Cost Analysis Example

### Scenario: 100 Users, 2 Accounts Each

#### Current (Manual Only)
- Syncs per day: ~10 (user-triggered)
- Date range: 90 days
- API calls: 10 syncs × 2 accounts = 20 calls/day
- **Monthly cost**: ~600 calls

#### With Daily Scheduled Sync (Naive)
- Syncs per day: 100 users × 2 accounts = 200
- Date range: 90 days
- API calls: 200 calls/day
- **Monthly cost**: ~6,000 calls ❌ EXPENSIVE

#### With Intelligent Incremental Sync ✅
- Syncs per day: 100 users × 2 accounts = 200
- Date range: 1-2 days (incremental)
- API calls: 200 calls/day
- **Monthly cost**: ~6,000 calls
- But: **Much faster**, less data transfer, better UX

#### Cost Optimization
- Skip accounts with no activity (check last transaction)
- Vary sync frequency based on account type
- Allow users to configure sync frequency
- **Optimized monthly cost**: ~3,000-4,000 calls (50% reduction)

---

## Configuration Options for Users

### Per-Connection Settings

```typescript
interface ConnectionSyncSettings {
  sync_enabled: boolean; // Master on/off switch
  sync_frequency: 'hourly' | 'daily' | 'weekly' | 'manual';
  backfill_days: number; // Initial backfill period
  incremental_enabled: boolean; // Use smart incremental sync
  auto_sync_enabled: boolean; // Automatic scheduled sync
  last_manual_sync_at: Date;
  next_scheduled_sync_at: Date;
}
```

### Per-Account Settings

```typescript
interface AccountSyncSettings {
  sync_enabled: boolean; // Allow disabling specific accounts
  priority: 'high' | 'normal' | 'low'; // Affects sync frequency
  backfill_days_override?: number; // Override default
}
```

---

## Summary & Recommendations

### ✅ Current State
- Basic transaction sync working
- Manual trigger available
- Configurable date ranges

### 🚀 Next Steps (Priority Order)

1. **Implement Intelligent Incremental Sync** (HIGH)
   - Reduces API calls by 80-90%
   - Faster sync times
   - Better user experience

2. **Add Pagination Support** (MEDIUM)
   - Handle accounts with > 500 transactions
   - Prevent data loss

3. **Implement Daily Scheduled Sync** (MEDIUM)
   - Keep data fresh automatically
   - Reduce user friction

4. **Add Sync Monitoring Dashboard** (LOW)
   - Track API usage
   - Monitor costs
   - Identify issues

5. **Optimize Backfill Periods** (LOW)
   - Per-account-type configuration
   - User-configurable options

---

## Questions to Consider

1. **What's our target data freshness?**
   - Real-time (minutes): High cost
   - Daily (24 hours): Low cost ✅ RECOMMENDED
   - Weekly: Very low cost, but may miss timely data

2. **Do we bill users for API usage?**
   - Yes: Let users control sync frequency
   - No: Optimize aggressively to reduce our costs ✅

3. **What's our transaction volume expectation?**
   - Small (<100/day): Simple pagination OK
   - Large (>500/day): Need robust pagination ✅

4. **Do we need real-time alerts?**
   - Yes: Requires frequent syncs or webhooks
   - No: Daily sync sufficient ✅

---

## Implementation Checklist

- [ ] Create `lib/services/transaction-sync-service.ts`
- [ ] Add `determineSyncDateRange()` function
- [ ] Add `fetchAllTransactionsPaginated()` function
- [ ] Update `app/api/banking/[provider]/sync/route.ts` to use new logic
- [ ] Add `connections.sync_settings` JSONB column
- [ ] Create scheduled job (Vercel Cron or external)
- [ ] Add sync metrics tracking
- [ ] Create sync history UI
- [ ] Add user-configurable sync settings

---

**Last Updated**: November 2024  
**Status**: Draft - Ready for Implementation

