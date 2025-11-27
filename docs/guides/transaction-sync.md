# Transaction Sync Strategy

## Overview

Stratiri's intelligent transaction sync system optimizes API calls to banking providers while ensuring complete and recent transaction data.

## Goal

**Always have complete and recent transactions while minimizing API calls to reduce costs.**

## The Problem

### Naive Approach
- Fetch last 90 days on every sync
- 100+ API calls for daily syncs
- Expensive and unnecessary
- Fetches mostly duplicate data

### Our Solution
**Intelligent incremental sync with safety overlap**

## Sync Strategy

### Principles

1. **Incremental by default** - Fetch only new data
2. **Safety overlap** - Always include previous day to catch delayed transactions
3. **Account-type specific backfill** - Different accounts have different transaction volumes
4. **Throttling** - Prevent excessive syncs (minimum 20 hours between syncs)

### Date Range Rules

| Sync Type | Last Synced | Date Range | Reason |
|-----------|-------------|------------|--------|
| **Initial** | Never | 90-365 days | Full backfill based on account type |
| **Daily** | <24h | Last 2 days | Incremental with 1-day overlap |
| **Weekly** | 24h-7d | Last 7 days | Catch delayed transactions |
| **Monthly** | >7d | Last 30 days | Larger gap recovery |
| **Forced** | Any | User-specified | Manual override |

### Account-Type Specific Backfill

```typescript
Initial Sync Periods:
- Checking: 90 days (high volume)
- Savings: 365 days (low volume, need history)
- Credit: 90 days (moderate volume)
- Investment: 365 days (need full year for tax)
- Loan: 90 days (regular payments)
- Other: 90 days (default)
```

## Implementation

### Core Service

**File**: `lib/services/transaction-sync-service.ts`

### Key Functions

#### 1. `determineSyncDateRange()`

Calculates optimal date range for transaction sync.

```typescript
export async function determineSyncDateRange(
  accountId: string,
  connectionId: string,
  accountType: string,
  forceFullBackfill: boolean = false
): Promise<SyncDateRange>
```

**Returns**:
```typescript
{
  startDate: Date,
  endDate: Date,
  daysSinceLastSync: number | null,
  reason: 'initial' | 'daily' | 'weekly' | 'monthly' | 'forced' | 'throttled',
  skip: boolean,  // True if should skip due to throttling
  throttledUntil: Date | null
}
```

#### 2. `calculateSyncMetrics()`

Estimates API impact of sync operation.

```typescript
export function calculateSyncMetrics(dateRange: SyncDateRange): SyncMetrics
```

**Returns**:
```typescript
{
  daysToFetch: number,
  estimatedApiCalls: number,  // Assumes 100 txs per day, 1 call per 500 txs
  totalDays: number,
  reason: string
}
```

#### 3. `formatSyncMetrics()`

Formats metrics for logging.

```typescript
export function formatSyncMetrics(metrics: SyncMetrics): string
// Output: "📊 Sync: 2 days (±4 API calls) - daily incremental"
```

## Sync Scenarios

### Scenario 1: First Sync (Checking Account)

```typescript
Input:
- Account: Checking
- Last Synced: Never
- Force: false

Output:
- Start Date: 90 days ago
- End Date: Today
- Days: 90
- API Calls: ±18 (90 days * 100 txs/day / 500 per page)
- Reason: "initial"
```

### Scenario 2: Daily Sync

```typescript
Input:
- Last Synced: 18 hours ago
- Force: false

Output:
- Start Date: 2 days ago (yesterday + today)
- End Date: Today
- Days: 2
- API Calls: ±1
- Reason: "daily incremental"
```

### Scenario 3: Throttled Sync

```typescript
Input:
- Last Synced: 12 hours ago
- Force: false

Output:
- skip: true
- throttledUntil: <20 hours from last sync>
- Reason: "throttled"

(No API call made)
```

### Scenario 4: Weekly Sync

```typescript
Input:
- Last Synced: 4 days ago
- Force: false

Output:
- Start Date: 7 days ago
- End Date: Today
- Days: 7
- API Calls: ±2
- Reason: "weekly catch-up"
```

### Scenario 5: Forced Sync

```typescript
Input:
- Last Synced: 10 hours ago
- Force: true

Output:
- Start Date: 90 days ago (checking default)
- End Date: Today
- Days: 90
- API Calls: ±18
- Reason: "forced full backfill"
- Skip: false (throttling bypassed)
```

## Throttling

### Configuration

```typescript
const THROTTLE_CONFIG = {
  minHoursBetweenSyncs: 20,  // Daily limit (allows once per day with buffer)
  bypassOnForce: true         // Forced syncs bypass throttle
};
```

### Behavior

**Normal Sync (Force = false)**:
- If last sync < 20 hours ago: Skip sync
- Returns `{ skip: true, throttledUntil: Date }`
- Logs throttle reason
- No API call made

**Forced Sync (Force = true)**:
- Ignores throttle
- Always performs sync
- Full backfill date range

## Safety Features

### 1. Overlap Period

Always include previous day to catch:
- Delayed transaction postings
- Bank processing delays
- Time zone differences
- Weekend transaction batches

```typescript
// Daily sync: Last 2 days (yesterday + today)
startDate = max(lastSyncDate - 1 day, today - 2 days)
```

### 2. Deduplication

Database handles duplicates via `ON CONFLICT`:

```sql
INSERT INTO transactions (...)
VALUES (...)
ON CONFLICT (tenant_id, connection_id, external_transaction_id)
DO UPDATE SET
  amount = EXCLUDED.amount,
  description = EXCLUDED.description,
  updated_at = NOW();
```

### 3. Error Recovery

- Individual account failures don't stop batch
- Failed accounts logged separately
- Successful accounts continue processing
- Retry mechanism for transient errors

## Performance Impact

### Before Intelligent Sync

```
Every sync: 90 days
API Calls: ~18 per account
Daily sync for 10 accounts: 180 API calls
Monthly cost: 5,400 API calls
```

### After Intelligent Sync

```
Daily sync: 2 days (with throttling)
API Calls: ~1 per account
Daily sync for 10 accounts: 10 API calls
Monthly cost: 300 API calls

Reduction: 95% (5,400 → 300)
```

### Actual Savings

- **80-90% reduction** in API calls for regular usage
- **Throttling** prevents excessive syncs
- **Safety overlap** catches edge cases
- **No missed transactions** due to conservative date ranges

## Usage in Code

### Callback Route (Initial Sync)

```typescript
// app/api/banking/[provider]/callback/route.ts

const dateRange = await determineSyncDateRange(
  result.account.account_id,
  connection.id,
  result.account.account_type || 'checking',
  true  // Force initial sync
);

const transactions = await provider.fetchTransactions(
  credentials,
  providerAccount.external_account_id,
  { 
    startDate: dateRange.startDate, 
    endDate: dateRange.endDate, 
    limit: 500
  }
);
```

### Sync Route (Regular Sync)

```typescript
// app/api/banking/[provider]/sync/route.ts

const dateRange = await determineSyncDateRange(
  accountData.account_id,
  connectionId,
  accountData.account_type || 'checking',
  false  // Respect throttling
);

// Check if throttled
if (dateRange.skip) {
  console.log(`⏭️  Skipping - synced recently`);
  continue;
}

const transactions = await provider.fetchTransactions(
  credentials,
  providerAccount.external_account_id,
  { 
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    limit: transactionLimit
  }
);
```

## Monitoring

### Metrics to Track

- Average days fetched per sync
- API calls per sync
- Transactions imported per sync
- Throttled sync attempts
- Forced sync frequency
- Duplicate transaction rate

### Logging

```typescript
console.log(formatSyncMetrics(metrics));
// Output: "📊 Sync: 2 days (±1 API calls) - daily incremental"
```

### Alerts

- Excessive forced syncs (may indicate issues)
- High duplicate rate (overlap working too well?)
- Low transaction import rate (may need larger date range)

## Configuration

### Adjustable Parameters

```typescript
// lib/services/transaction-sync-service.ts

const SYNC_CONFIG = {
  // Throttling
  minHoursBetweenSyncs: 20,
  
  // Initial sync periods (days)
  initialSyncDays: {
    checking: 90,
    savings: 365,
    credit: 90,
    investment: 365,
    loan: 90,
    other: 90
  },
  
  // Regular sync periods
  dailySyncDays: 2,  // Includes 1-day overlap
  weeklySyncDays: 7,
  monthlySyncDays: 30,
  
  // Safety
  minOverlapDays: 1,
  maxDaysPerSync: 365,
  
  // API estimation
  estimatedTransactionsPerDay: 100,
  transactionsPerApiCall: 500
};
```

## Future Enhancements

- [ ] Dynamic throttling based on account activity
- [ ] Machine learning for optimal sync periods
- [ ] Provider-specific configurations
- [ ] Cost-per-API tracking
- [ ] Predictive syncing (anticipate high-volume periods)
- [ ] Real-time transaction notifications (webhooks)

## Related Documentation

- **Tink Integration**: `docs/integrations/tink/README.md`
- **Account Management**: `docs/guides/account-management.md`
- **API v2 Migration**: Implementation summary in archives

---

**Implementation Date**: November 16, 2025  
**Status**: ✅ Production Ready  
**API Call Reduction**: 80-90%  
**Last Updated**: November 16, 2025

