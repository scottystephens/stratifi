# Account Management

## Overview

Stratiri's account management system handles the creation, syncing, and lifecycle management of financial accounts from multiple sources (manual entry, CSV import, banking providers).

## Features

✅ **Multi-Source Accounts** - Manual, CSV, or provider-synced  
✅ **Automatic Deduplication** - IBAN-based matching  
✅ **Provider Metadata** - Track which accounts come from which provider  
✅ **Account Closure Detection** - Automatically detect closed accounts  
✅ **Batch Operations** - Efficient bulk account creation  
✅ **Health Scoring** - Connection reliability metrics  

## Account Sources

### 1. Manual Entry
Users can manually create accounts with custom fields.

### 2. CSV Import
Upload bank statements via CSV with flexible column mapping.

### 3. Banking Providers
Automatic sync from connected banks (Tink, Bunq, etc.).

**UI Indicators:**
- Provider badge (Tink, Bunq, CSV, Manual)
- Sync status
- Last synced timestamp

## Deduplication Strategy

### Matching Criteria (in order of preference):

1. **IBAN Match** - Most reliable for European accounts
2. **External Account ID** - Provider-specific identifier
3. **Bank Name + Account Number** - Fallback for non-IBAN accounts

### Behavior:

- **Match Found**: Update existing account (balance, metadata, last_synced_at)
- **No Match**: Create new account
- **Multiple Matches**: Use first match (IBAN takes precedence)

**Implementation**: `lib/services/account-service.ts`

## Account Schema

### Database Fields

| Field | Type | Description |
|-------|------|-------------|
| account_id | TEXT | Primary key (can be UUID or custom) |
| id | UUID | Secondary unique identifier (added in Migration 11) |
| tenant_id | UUID | Tenant ownership |
| connection_id | UUID | Source connection (null for manual) |
| provider_id | TEXT | Provider name (tink, bunq, csv, manual) |
| account_name | TEXT | Display name |
| account_number | TEXT | Account number or identifier |
| account_type | TEXT | checking, savings, credit, investment |
| account_status | TEXT | active, inactive, closed |
| currency | TEXT | ISO currency code (USD, EUR, GBP) |
| current_balance | DECIMAL | Current balance |
| external_account_id | TEXT | Provider-specific ID |
| iban | TEXT | International Bank Account Number |
| bic | TEXT | Bank Identifier Code |
| bank_name | TEXT | Bank/institution name |
| sync_enabled | BOOLEAN | Whether to sync this account |
| last_synced_at | TIMESTAMP | Last successful sync |
| entity_id | TEXT | Linked entity (nullable, Migration 12) |
| custom_fields | JSONB | Additional metadata |

### Key Changes

**Migration 11**: Added UUID `id` field for provider compatibility  
**Migration 12**: Made `entity_id` nullable for provider accounts  
**Migration 13**: Extended `account_id` to TEXT (unlimited)  
**Migration 14**: Removed all VARCHAR length restrictions  

## Account Creation Flow

### From Banking Provider

```typescript
1. Provider fetches accounts via API
2. TinkProvider/BunqProvider formats to ProviderAccount
3. account-service.batchCreateOrUpdateAccounts()
4. For each account:
   a. Check for existing account (IBAN, external_id, bank+number)
   b. If exists: Update balance and metadata
   c. If new: Create account with generated UUID account_id
5. Create provider_accounts mapping
6. Return summary (created, updated, failed)
```

### From CSV Import

```typescript
1. User uploads CSV with account info
2. CSVParser maps columns to account fields
3. Account created with custom account_id
4. Connection type: 'csv'
5. No provider_id set
```

### Manual Creation

```typescript
1. User fills out account form
2. Account created with custom or generated account_id
3. Connection type: 'manual'
4. entity_id required for manual accounts
```

## Provider Account Linking

### Database Structure

```
accounts (main Stratiri accounts)
    ↕
provider_accounts (links to external accounts)
    ↕
provider_transactions (raw provider data)
```

### Mapping Flow

```typescript
Provider Account → provider_accounts.account_id → accounts.id (UUID)
                                                → accounts.account_id (TEXT)
```

**Note**: Transactions reference `accounts.account_id` (TEXT), not `id` (UUID)

## UI Components

### Account Source Indicator

**File**: `components/ui/account-source-indicator.tsx`

Displays account origin:
- Provider logo (Tink, Bunq)
- CSV icon for imports
- Manual icon for user-created

### Provider Badge

**File**: `components/ui/provider-badge.tsx`

Shows provider name with appropriate styling.

### Account List

**File**: `app/accounts/page.tsx`

Features:
- Filter by provider
- Sort by name, balance, last synced
- Sync status indicators
- Quick actions (view, edit, sync)

## Account Metadata

### Custom Fields (JSONB)

```typescript
{
  provider_metadata: {
    // Provider-specific data
    tink_account_id: "abc123",
    tink_account_type: "CHECKING",
    // ...
  },
  created_via_provider: "tink",
  first_sync_at: "2025-11-16T00:31:57Z",
  last_provider_sync: "2025-11-16T12:00:00Z"
}
```

### Connection Metadata

**Tracked at connection level**:
- Total accounts synced
- Active accounts
- Last sync timestamp
- Consecutive failures
- Health score

## Account Closure Detection

### Strategy

```typescript
1. Fetch current accounts from provider
2. Compare with existing provider_accounts
3. Mark missing accounts as "closed"
4. Update account_status in accounts table
5. Disable sync_enabled
```

**Implementation**: `lib/services/account-service.ts` → `syncAccountClosures()`

## Batch Operations

### Why Batch?

- Improved performance (single database round-trip per batch)
- Transaction consistency
- Better error handling

### Implementation

```typescript
export async function batchCreateOrUpdateAccounts(
  accounts: ProviderAccount[],
  connectionId: string,
  tenantId: string,
  providerId: string,
  userId: string
): Promise<BatchResult>
```

**Returns**:
```typescript
{
  successful: AccountCreationResult[],
  failed: AccountCreationResult[],
  summary: {
    total: number,
    created: number,
    updated: number,
    failed: number
  }
}
```

## Error Handling

### Common Errors

**"Entity ID required"**
- Manual accounts need entity_id
- Fixed in Migration 12 (made nullable for provider accounts)

**"Value too long for type"**
- Field length restrictions
- Fixed in Migration 13-14 (all TEXT fields unlimited)

**"Duplicate account"**
- Deduplication detected existing account
- System updates existing instead of creating new

### Error Recovery

- Individual account failures don't stop batch
- Failed accounts logged with error message
- Successful accounts processed normally
- Summary includes both success and failure counts

## Monitoring

### Metrics to Track

- Accounts created per day
- Accounts updated per day
- Failed account creations
- Deduplication match rate
- Account closure detection accuracy
- Sync success rate by provider

### Health Scoring

```typescript
health_score = (0.7 * recent_success_rate) + (0.3 * historical_success_rate)
```

**Factors**:
- Consecutive failures (reduces score)
- Last successful sync (time-based decay)
- Total successful syncs (historical reliability)

## API Endpoints

### Get Accounts

**GET** `/api/accounts`

Query params:
- `tenantId` (required)
- `id` (optional) - Specific account
- `connectionId` (optional) - Filter by connection
- `provider` (optional) - Filter by provider

**Response**:
```typescript
{
  success: true,
  accounts: Account[],
  count: number
}
```

### Create Account

**POST** `/api/accounts`

**Body**:
```typescript
{
  tenantId: string,
  accountName: string,
  entityId: string,  // Optional for provider accounts
  bankName: string,
  accountNumber?: string,
  accountType: string,
  currency: string,
  currentBalance: number,
  // ... other fields
}
```

## Key Files

| File | Purpose |
|------|---------|
| `lib/services/account-service.ts` | Core account logic |
| `lib/supabase.ts` | Database queries |
| `app/accounts/page.tsx` | Account list UI |
| `app/accounts/[id]/page.tsx` | Account details |
| `app/accounts/[id]/transactions/page.tsx` | Account transactions |
| `components/ui/account-source-indicator.tsx` | UI component |
| `components/ui/provider-badge.tsx` | UI component |

## Future Enhancements

- [ ] Account grouping (by entity, type, provider)
- [ ] Account tagging system
- [ ] Custom account categories
- [ ] Account archiving (soft delete)
- [ ] Bulk account operations
- [ ] Account import/export
- [ ] Account reconciliation tools

---

**Last Updated**: November 16, 2025  
**Status**: ✅ Production Ready

