# Banking Provider Architecture

## Overview

Stratiri's banking provider architecture has been completely refactored to provide a clean, layered system that:

- **Stores 100% of raw API responses** in JSONB format for auto-detection of new fields
- **Separates raw data ingestion** from normalization into standard schemas
- **Uses a single sync orchestrator** for ALL banking providers
- **Maintains separate provider tables** for easier queries and performance
- **Allows clean rollback** if needed

## Architecture Layers

### 1. Provider Layer (`lib/banking-providers/`)

Each banking provider extends the `BankingProvider` abstract class and implements:

```typescript
abstract class BankingProvider {
  // Legacy methods (kept for compatibility)
  abstract fetchAccounts(credentials): Promise<ProviderAccount[]>
  abstract fetchTransactions(credentials, accountId, options?): Promise<ProviderTransaction[]>

  // NEW: Raw data methods (primary going forward)
  abstract fetchRawAccounts(credentials): Promise<RawAccountsResponse>
  abstract fetchRawTransactions(credentials, accountId, options?): Promise<RawTransactionsResponse>
}
```

**Key Providers:**
- `PlaidProvider` - Plaid Link integration
- `TinkProvider` - Tink Open Banking
- `ProviderTemplate` - Template for new providers

### 2. Raw Storage Layer (`lib/services/raw-storage-service.ts`)

Stores complete API responses in JSONB format:

```typescript
class RawStorageService {
  // Plaid raw storage
  async storePlaidAccounts(response: RawAccountsResponse)
  async storePlaidTransactions(response: RawTransactionsResponse)

  // Tink raw storage
  async storeTinkAccounts(response: RawAccountsResponse)
  async storeTinkTransactions(response: RawTransactionsResponse)

  // Direct bank raw storage (universal for all banks)
  async storeDirectBankAccounts(response: RawAccountsResponse, providerId: string)
  async storeDirectBankTransactions(response: RawTransactionsResponse, providerId: string)
}
```

### 3. Normalization Layer (`lib/services/normalization-service.ts`)

Transforms raw JSONB data into standard Stratiri formats:

```typescript
class NormalizationService {
  // Plaid normalization
  async normalizePlaidAccounts(connectionId, tenantId): Promise<ProviderAccount[]>
  async normalizePlaidTransactions(connectionId): Promise<ProviderTransaction[]>

  // Tink normalization
  async normalizeTinkAccounts(connectionId, tenantId): Promise<ProviderAccount[]>
  async normalizeTinkTransactions(connectionId): Promise<ProviderTransaction[]>

  // Direct bank normalization (universal)
  async normalizeDirectBankAccounts(connectionId, providerId): Promise<ProviderAccount[]>
  async normalizeDirectBankTransactions(connectionId, providerId): Promise<ProviderTransaction[]>
}
```

### 4. Orchestrator Layer (`lib/services/sync-orchestrator.ts`)

Single orchestrator for ALL providers with 7-step sync process:

```typescript
async function orchestrateSync(options: SyncOptions): Promise<SyncResult> {
  // STEP 1: Fetch Raw Accounts from provider API
  // STEP 2: Store complete raw data to JSONB
  // STEP 3: Normalize accounts to standard schema
  // STEP 4: Save to accounts table
  // STEP 5: Fetch Raw Transactions from provider API
  // STEP 6: Store raw transactions to JSONB
  // STEP 7: Normalize and save transactions
}
```

### 5. API Layer (`app/api/banking/[provider]/sync/route.ts`)

Ultra-simple sync endpoint that uses the orchestrator:

```typescript
export async function POST(req, { params }) {
  // Get provider and credentials
  const provider = getProvider(params.provider);
  const credentials = { /* ... */ };

  // SINGLE CALL: Universal sync for ALL providers
  const result = await orchestrateSync({
    provider,
    connectionId,
    tenantId,
    credentials,
    syncAccounts: true,
    syncTransactions: true,
    userId,
  });

  return NextResponse.json(result);
}
```

## Database Schema

### Raw Data Tables (JSONB Storage)

```sql
-- Plaid raw storage
CREATE TABLE plaid_accounts (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    connection_id UUID REFERENCES connections(id),
    account_id TEXT NOT NULL,  -- Plaid's identifier
    raw_account_data JSONB NOT NULL,  -- COMPLETE account object
    raw_institution_data JSONB,  -- Complete institution data
    UNIQUE(connection_id, account_id)
);

-- Direct bank raw storage (universal for all banks)
CREATE TABLE direct_bank_accounts (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    connection_id UUID REFERENCES connections(id),
    provider_id TEXT NOT NULL,  -- 'standard_bank_sa', 'absa_sa', etc.
    external_account_id TEXT NOT NULL,
    raw_account_data JSONB NOT NULL,  -- COMPLETE bank account object
    UNIQUE(connection_id, external_account_id)
);
```

### Normalized Tables (Standard Schema)

```sql
-- Standard accounts table (normalized from raw data)
CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    connection_id UUID REFERENCES connections(id),
    external_account_id TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    currency TEXT NOT NULL,
    balance NUMERIC NOT NULL,
    -- ... standard fields
);

-- Standard transactions table
CREATE TABLE transactions (
    transaction_id TEXT PRIMARY KEY,  -- Provider transaction ID
    tenant_id UUID REFERENCES tenants(id),
    account_id TEXT REFERENCES accounts(account_id),
    connection_id UUID REFERENCES connections(id),
    date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL,  -- 'Credit', 'Debit'
    -- ... standard fields
);
```

## Data Flow

```
Provider API → Raw Storage (JSONB) → Normalization → Standard Tables
     ↓              ↓                       ↓            ↓
  fetchRaw() → storeRaw() → normalize() → batchCreateOrUpdate()
```

### Step-by-Step Process

1. **Raw Data Ingestion**: Provider API responses stored 100% in JSONB
2. **Normalization**: JSONB data transformed to standard `ProviderAccount`/`ProviderTransaction` format
3. **Standard Storage**: Normalized data saved to `accounts`/`transactions` tables
4. **Querying**: Applications query standard tables for consistent data access

## Benefits

### 1. Auto-Detection of New Fields

```sql
-- Query any field that Plaid adds in future updates
SELECT
  account_id,
  raw_account_data->>'name' as account_name,
  raw_account_data->'balances'->>'current' as balance,
  raw_account_data->>'new_field_from_plaid_2026' as future_field
FROM plaid_accounts;
```

### 2. Single Sync Path

```typescript
// Same orchestrator works for ALL providers
const result = await orchestrateSync({
  provider: plaidProvider,    // or tinkProvider, or any future provider
  connectionId: 'conn_123',
  credentials: { /* ... */ },
  syncAccounts: true,
  syncTransactions: true,
});
```

### 3. Clean Rollback Capability

```sql
-- Drop new tables and restore old ones if needed
DROP TABLE plaid_accounts_v2, plaid_transactions_v2;
ALTER TABLE plaid_accounts_old RENAME TO plaid_accounts;
```

### 4. Easy Provider Addition

```typescript
// 1. Extend BankingProvider
class NewBankProvider extends BankingProvider {
  async fetchRawAccounts(credentials) { /* API call */ }
  async fetchRawTransactions(credentials, accountId) { /* API call */ }
}

// 2. Add to provider registry
registerProvider(new NewBankProvider());

// 3. That's it! Orchestrator handles everything else
```

## Migration Path

### Phase 1-2: Design & Types ✅
- Created `raw-types.ts` with JSONB interfaces
- Updated `base-provider.ts` with raw data methods

### Phase 3: Database Schema ✅
- Created migration `42-refactor-provider-storage.sql`
- New JSONB tables: `plaid_accounts`, `tink_accounts`, `direct_bank_accounts`
- RLS policies and indexes

### Phase 4: Raw Storage Service ✅
- `RawStorageService` stores complete API responses in JSONB
- Separate methods for Plaid, Tink, Direct Banks

### Phase 5: Normalization Service ✅
- `NormalizationService` transforms JSONB to standard formats
- Provider-specific mapping logic

### Phase 6: Sync Orchestrator ✅
- Universal `orchestrateSync()` function for all providers
- 7-step process: Raw → Store → Normalize → Save

### Phase 7: Update Sync Route ✅
- Simplified `/api/banking/[provider]/sync/route.ts`
- Single orchestrator call replaces 700+ lines of provider-specific code

### Phase 8: Cleanup ✅
- Removed deprecated `plaid-sync-service.ts` and `tink-sync-service.ts`
- Updated all imports to use orchestrator

### Phase 9: Testing ✅
- Application builds successfully
- TypeScript compilation passes
- No runtime errors

### Phase 10: Documentation ✅
- Complete architecture documentation
- Updated provider template with raw methods

## Usage Examples

### Query Raw Data

```sql
-- Get all Plaid accounts with complete raw data
SELECT
  connection_id,
  account_id,
  raw_account_data->>'name' as account_name,
  raw_account_data->'balances'->>'current' as current_balance,
  raw_account_data->'balances'->>'available' as available_balance,
  last_updated_at
FROM plaid_accounts
WHERE tenant_id = 'tenant-123'
ORDER BY last_updated_at DESC;
```

### Add New Provider

```typescript
// lib/banking-providers/new-bank-provider.ts
export class NewBankProvider extends BankingProvider {
  config = { providerId: 'new_bank', /* ... */ };

  async fetchRawAccounts(credentials: ConnectionCredentials): Promise<RawAccountsResponse> {
    const response = await fetch('https://api.newbank.com/accounts', {
      headers: { Authorization: `Bearer ${credentials.tokens.accessToken}` }
    });
    const data = await response.json();

    return {
      provider: 'new_bank',
      connectionId: credentials.connectionId,
      tenantId: credentials.tenantId,
      responseType: 'accounts',
      rawData: data,  // Store 100% of API response
      accountCount: data.accounts?.length || 0,
      fetchedAt: new Date(),
      apiEndpoint: '/accounts',
      responseMetadata: { statusCode: response.status, headers: {}, duration: 0 }
    };
  }

  async fetchRawTransactions(credentials, accountId, options?): Promise<RawTransactionsResponse> {
    // Similar pattern for transactions
  }
}
```

### Sync Any Provider

```typescript
// Sync works identically for all providers
const result = await orchestrateSync({
  provider: getProvider('plaid'), // or 'tink', 'new_bank', etc.
  connectionId: 'conn-123',
  tenantId: 'tenant-456',
  credentials: plaidCredentials,
  syncAccounts: true,
  syncTransactions: true,
  userId: 'user-789'
});

console.log(`Synced ${result.accountsSynced} accounts, ${result.transactionsSynced} transactions`);
```

## Future Enhancements

### ML/Analytics Access
Raw JSONB data enables future ML features:
```sql
-- Analyze transaction patterns using raw provider data
SELECT
  transaction_id,
  raw_transaction_data->'category' as plaid_category,
  raw_transaction_data->'merchant_name' as merchant,
  raw_transaction_data->'location'->'city' as city
FROM plaid_transactions
WHERE raw_transaction_data ? 'location';  -- JSONB existence check
```

### Provider-Specific Features
Easy access to provider-specific data:
```sql
-- Plaid-specific fields
SELECT
  account_id,
  raw_account_data->'verification_status' as verification_status,
  raw_account_data->'routing_numbers' as routing_numbers
FROM plaid_accounts;

-- Tink-specific fields
SELECT
  account_id,
  raw_account_data->'holderName' as holder_name,
  raw_account_data->'flags'->'psuAccepts' as psu_accepts
FROM tink_accounts;
```

### Automated Schema Evolution
When providers add new fields, they're automatically captured in JSONB without schema changes.

## Conclusion

The refactored banking provider architecture provides:

1. **Future-Proof Data Storage**: JSONB captures all provider API fields automatically
2. **Unified Sync Process**: Single orchestrator works for all providers
3. **Clean Separation of Concerns**: Raw storage → Normalization → Standard schema
4. **Easy Provider Addition**: Template-based approach for new integrations
5. **Robust Error Handling**: Comprehensive logging and rollback capabilities
6. **Performance Optimized**: Separate tables with proper indexing
7. **Security Maintained**: RLS policies on all tenant-scoped tables

This architecture scales to any number of banking providers while maintaining data integrity and query performance.
