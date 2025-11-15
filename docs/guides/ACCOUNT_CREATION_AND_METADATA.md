# Account Creation and Connection Metadata Guide

## Overview

This guide documents the production-level implementation of account creation, deduplication, and connection metadata tracking in Stratifi. This implementation follows industry best practices for data integrity, performance, and user experience.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Database Schema](#database-schema)
3. [Account Deduplication](#account-deduplication)
4. [Connection Health Tracking](#connection-health-tracking)
5. [Sync Process](#sync-process)
6. [API Usage](#api-usage)
7. [UI Components](#ui-components)
8. [Best Practices](#best-practices)

---

## Architecture

### Three-Layer Account System

```
┌─────────────────────────────────────────────────────┐
│  PROVIDER LAYER (Tink, Bunq, etc.)                 │
│  - External banking APIs                            │
│  - OAuth authentication                             │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  PROVIDER_ACCOUNTS TABLE                            │
│  - Raw data from banking providers                  │
│  - External account IDs                             │
│  - Provider-specific metadata                       │
│  - Links to Stratifi accounts via foreign key      │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  ACCOUNTS TABLE (Stratifi)                          │
│  - Normalized account records                       │
│  - User-editable information                        │
│  - Multi-provider support (one account, many links)│
│  - IBAN-based deduplication                        │
└─────────────────────────────────────────────────────┘
```

### Service Layer Architecture

```typescript
┌────────────────────────────────────────────┐
│  API Routes (OAuth, Sync)                  │
└─────────────────┬──────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│  Account Service                            │
│  - createOrUpdateAccount()                 │
│  - batchCreateOrUpdateAccounts()           │
│  - findExistingAccount() (deduplication)   │
│  - syncAccountClosures()                   │
└─────────────────┬──────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│  Connection Metadata Service                │
│  - calculateHealthScore()                  │
│  - refreshConnectionMetadata()             │
│  - recordSyncSuccess/Failure()             │
│  - getConnectionStats()                    │
└────────────────────────────────────────────┘
```

---

## Database Schema

### Key Tables

#### `accounts` (Enhanced)

```sql
CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  -- Basic account information
  account_name VARCHAR(255) NOT NULL,
  account_number VARCHAR(100),
  account_type VARCHAR(50) NOT NULL,
  account_status VARCHAR(50) DEFAULT 'active',
  
  -- Banking details
  bank_name VARCHAR(255),
  iban VARCHAR(34),
  bic VARCHAR(11),
  currency VARCHAR(3) DEFAULT 'USD',
  
  -- Balances
  current_balance DECIMAL(15,2) DEFAULT 0,
  available_balance DECIMAL(15,2),
  
  -- Provider linkage (NEW)
  provider_id TEXT,
  connection_id UUID REFERENCES connections(id),
  external_account_id VARCHAR(255),
  
  -- Sync settings
  sync_enabled BOOLEAN DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ,
  
  -- Metadata
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

-- Indexes for deduplication
CREATE INDEX idx_accounts_iban ON accounts(iban) WHERE iban IS NOT NULL;
CREATE INDEX idx_accounts_external_id ON accounts(external_account_id) WHERE external_account_id IS NOT NULL;
CREATE INDEX idx_accounts_bank_number ON accounts(bank_name, account_number);
```

#### `connections` (Enhanced)

```sql
CREATE TABLE connections (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  -- Connection info
  name VARCHAR(255) NOT NULL,
  provider VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active',
  
  -- Account statistics (NEW)
  total_accounts INTEGER DEFAULT 0,
  active_accounts INTEGER DEFAULT 0,
  
  -- Transaction statistics (NEW)
  total_transactions INTEGER DEFAULT 0,
  last_transaction_date TIMESTAMPTZ,
  
  -- Health tracking (NEW)
  sync_health_score DECIMAL(3,2) DEFAULT 1.00 CHECK (sync_health_score >= 0 AND sync_health_score <= 1),
  last_successful_sync_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  
  -- Rich metadata (NEW)
  sync_summary JSONB DEFAULT '{}',
  
  -- Timestamps
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `provider_accounts`

```sql
CREATE TABLE provider_accounts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  connection_id UUID NOT NULL REFERENCES connections(id),
  provider_id TEXT NOT NULL,
  
  -- Link to Stratifi account (FIXED: now UUID type)
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  
  -- Provider data
  external_account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT,
  account_type TEXT,
  currency TEXT NOT NULL,
  balance DECIMAL(19, 4),
  iban TEXT,
  bic TEXT,
  status TEXT DEFAULT 'active',
  
  -- Provider metadata
  provider_metadata JSONB DEFAULT '{}',
  last_synced_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicates
  UNIQUE (connection_id, provider_id, external_account_id)
);
```

---

## Account Deduplication

### Strategy

The system uses a **three-tier matching strategy** to prevent duplicate accounts:

#### 1. IBAN Matching (Highest Priority)

```typescript
// Most reliable for international accounts
if (criteria.iban) {
  const { data } = await supabase
    .from('accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('iban', criteria.iban)
    .maybeSingle();
}
```

**Use case:** Same bank account connected via multiple providers (e.g., Tink + Bunq)

#### 2. External Account ID Matching

```typescript
// Provider-specific ID
if (criteria.externalAccountId) {
  const { data } = await supabase
    .from('accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('external_account_id', criteria.externalAccountId)
    .maybeSingle();
}
```

**Use case:** Reconnecting same provider, detecting existing accounts

#### 3. Bank Name + Account Number

```typescript
// Fallback for accounts without IBAN
if (criteria.bankName && criteria.accountNumber) {
  const { data } = await supabase
    .from('accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('bank_name', criteria.bankName)
    .eq('account_number', criteria.accountNumber)
    .maybeSingle();
}
```

**Use case:** Domestic accounts, CSV imports

### Deduplication Flow

```
New Account from Provider
    ↓
Check by IBAN → Found? → Update existing account
    ↓ Not found
Check by External ID → Found? → Update existing account
    ↓ Not found
Check by Bank+Number → Found? → Update existing account
    ↓ Not found
Create new account
```

---

## Connection Health Tracking

### Health Score Calculation

The health score (0.00 to 1.00) is calculated using a **weighted average** of sync success rates:

```typescript
healthScore = 0.70 × (recent 7-day success rate) + 0.30 × (historical 30-day success rate)
```

**Additional penalties:**
- 5% penalty per recent consecutive failure (max 5 failures)

### Health Status Levels

| Score | Status | Meaning | Action |
|-------|--------|---------|--------|
| ≥ 0.90 | Excellent | All syncs successful | None |
| 0.75-0.89 | Good | Minor issues | Monitor |
| 0.50-0.74 | Fair | Regular failures | Check connection settings |
| 0.25-0.49 | Poor | Frequent failures | Verify credentials |
| < 0.25 | Critical | Failing consistently | Reconnect or contact support |

### Failure Tracking

```typescript
// On sync failure
await recordSyncFailure(connectionId, errorMessage);
// Increments consecutive_failures
// Updates health score
// Sets status to 'error' if consecutive_failures >= 3

// On sync success
await recordSyncSuccess(connectionId);
// Resets consecutive_failures to 0
// Updates last_successful_sync_at
// Recalculates health score
```

---

## Sync Process

### OAuth Callback Flow

```typescript
1. User completes OAuth at provider
2. Stratifi receives callback with authorization code
3. Exchange code for access token
4. Store token in provider_tokens table
5. Update connection status to 'active'
6. [AUTOMATIC SYNC STARTS]
   a. Fetch accounts from provider
   b. Batch create/update accounts (with deduplication)
   c. Link provider_accounts to accounts
   d. Optional: Sync last 30 days of transactions
   e. Update connection metadata
   f. Calculate and record health score
7. Redirect user to connection details page
```

### Manual Sync Flow

```typescript
1. User clicks "Sync Now" button
2. API validates connection and token
3. Refresh token if expired
4. Sync accounts:
   - Fetch from provider API
   - Batch process with deduplication
   - Update balances and status
   - Mark closed accounts
5. Sync transactions (if enabled):
   - Use configurable date range (default: last 90 days)
   - Fetch per account
   - Deduplicate by external_transaction_id
6. Update connection stats and health
7. Return detailed sync summary
```

### Transaction Sync Configuration

```typescript
// Default: Last 90 days
{
  transactionDaysBack: 90
}

// Custom date range
{
  transactionStartDate: '2025-01-01',
  transactionEndDate: '2025-11-15'
}

// Limit per account
{
  transactionLimit: 500
}
```

---

## API Usage

### Sync Endpoint

```typescript
POST /api/banking/{provider}/sync

Body:
{
  connectionId: string,
  tenantId: string,
  syncAccounts: boolean = true,
  syncTransactions: boolean = true,
  transactionDaysBack: number = 90,
  transactionStartDate?: string,
  transactionEndDate?: string,
  transactionLimit: number = 500
}

Response:
{
  success: true,
  message: "Synced 5 accounts (2 new, 3 updated) and 1,234 transactions",
  summary: {
    accountsSynced: 5,
    accountsCreated: 2,
    accountsUpdated: 3,
    transactionsSynced: 1234,
    errors: [],
    warnings: ["1 account marked as closed"],
    syncDurationMs: 2341
  },
  jobId: "uuid"
}
```

### Account Service Functions

```typescript
import { 
  createOrUpdateAccount,
  batchCreateOrUpdateAccounts,
  findExistingAccount,
  syncAccountClosures 
} from '@/lib/services/account-service';

// Single account
const result = await createOrUpdateAccount(
  tenantId,
  connectionId,
  providerId,
  providerAccount,
  userId
);

// Batch (recommended for better performance)
const batchResult = await batchCreateOrUpdateAccounts(
  tenantId,
  connectionId,
  providerId,
  providerAccounts,
  userId
);

console.log(`Created: ${batchResult.summary.created}`);
console.log(`Updated: ${batchResult.summary.updated}`);
console.log(`Failed: ${batchResult.summary.failed}`);
```

### Connection Metadata Functions

```typescript
import {
  getConnectionHealth,
  refreshConnectionMetadata,
  recordSyncSuccess,
  recordSyncFailure
} from '@/lib/services/connection-metadata-service';

// Get health info
const health = await getConnectionHealth(connectionId);
console.log(`Health: ${health.status} (${health.score})`);

// After successful sync
await recordSyncSuccess(connectionId);
await refreshConnectionMetadata(connectionId);

// After failed sync
await recordSyncFailure(connectionId, errorMessage);
```

---

## UI Components

### Connection Detail Page Features

#### Health Score Card

```tsx
<Card>
  <h3>Health</h3>
  <p className="text-2xl">{(score * 100).toFixed(0)}%</p>
  <Badge>Excellent</Badge>
  {consecutiveFailures > 0 && (
    <p className="text-red-600">
      {consecutiveFailures} consecutive failures
    </p>
  )}
</Card>
```

#### Sync Summary Display

```tsx
<Card>
  <h2>Last Sync Summary</h2>
  <div>
    <p>Accounts Synced: {summary.accounts_synced}</p>
    <p className="text-green-600">+{summary.accounts_created} new</p>
  </div>
  <div>
    <p>Duration: {formatDuration(summary.sync_duration_ms)}</p>
  </div>
  
  {/* Errors */}
  {summary.errors?.map(error => (
    <div className="bg-red-50">
      <AlertCircle /> {error}
    </div>
  ))}
  
  {/* Warnings */}
  {summary.warnings?.map(warning => (
    <div className="bg-yellow-50">
      <AlertTriangle /> {warning}
    </div>
  ))}
</Card>
```

---

## Best Practices

### 1. Account Creation

✅ **Always use batch operations** for multiple accounts:
```typescript
await batchCreateOrUpdateAccounts(...) // Good
// vs
for (const account of accounts) {
  await createOrUpdateAccount(...) // Bad (slower)
}
```

✅ **Let deduplication handle existing accounts**:
```typescript
// Don't check manually - the service handles it
const result = await createOrUpdateAccount(...)
if (result.isNew) {
  // Account was created
} else {
  // Account was updated (matched by IBAN/external ID/etc)
}
```

### 2. Error Handling

✅ **Handle partial failures gracefully**:
```typescript
const batchResult = await batchCreateOrUpdateAccounts(...)

if (batchResult.failed.length > 0) {
  // Log failures but continue
  console.error(`${batchResult.failed.length} accounts failed`)
  // Show user-friendly message
}

// Don't throw if some accounts succeed
```

✅ **Always update connection health**:
```typescript
try {
  await syncAccounts(...)
  await recordSyncSuccess(connectionId)
} catch (error) {
  await recordSyncFailure(connectionId, error.message)
  throw error
}
```

### 3. Performance

✅ **Use database functions for stats**:
```typescript
// Automatic via triggers
// Don't manually calculate in application code
await updateConnectionStats(connectionId) // ❌ Slow
// Instead, let database triggers handle it ✅
```

✅ **Refresh metadata after sync**:
```typescript
await refreshConnectionMetadata(connectionId)
// This runs in parallel:
// - getConnectionStats()
// - calculateHealthScore()
```

### 4. Data Integrity

✅ **Use transactions for critical operations**:
```typescript
// Provider account and Stratifi account should be created atomically
// Current implementation handles this via upserts
```

✅ **Sync account closures**:
```typescript
// After fetching accounts, mark deleted ones as closed
await syncAccountClosures(tenantId, connectionId, providerId, activeIds)
// This preserves data but marks accounts as closed
```

### 5. User Experience

✅ **Show comprehensive sync results**:
```typescript
// Don't just say "sync complete"
alert(`Synced ${accountsCreated} new and ${accountsUpdated} updated accounts`)
```

✅ **Display health status prominently**:
```tsx
{healthScore < 0.5 && (
  <Banner variant="warning">
    Connection health is poor. Check credentials.
  </Banner>
)}
```

---

## Troubleshooting

### Issue: Duplicate accounts created

**Cause:** IBAN not provided by provider, fallback matching failed

**Solution:** Check provider metadata, ensure account numbers are consistent

### Issue: Health score always 100%

**Cause:** No ingestion jobs in database

**Solution:** Run at least one sync, check ingestion_jobs table

### Issue: Connection metadata not updating

**Cause:** Triggers not enabled or function not created

**Solution:** Run migration 11, verify triggers exist:
```sql
SELECT * FROM pg_trigger WHERE tgname = 'update_connection_stats_on_account_change';
```

### Issue: Transaction sync failing

**Cause:** Date range too large, provider rate limiting

**Solution:** Reduce `transactionDaysBack` or use pagination

---

## Related Documentation

- [Banking Provider Integration Guide](./ADDING_NEW_BANKING_PROVIDERS.md)
- [Data Ingestion Architecture](../architecture/DATA_INGESTION_ARCHITECTURE.md)
- [Multi-Tenant System](../architecture/MULTI_TENANT_SYSTEM.md)

---

## Changelog

### Version 1.0 (2025-11-15)

- ✅ Implemented account deduplication with IBAN/external ID matching
- ✅ Added connection health scoring
- ✅ Created account and metadata services
- ✅ Enhanced UI with health status and sync summaries
- ✅ Added configurable transaction sync
- ✅ Implemented batch operations for performance
- ✅ Added automatic triggers for stats updates

