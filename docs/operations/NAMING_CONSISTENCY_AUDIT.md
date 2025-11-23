# Naming Consistency Audit & Standardization Plan

## Current State: Naming Inconsistencies

### 🔴 Problem: Multiple Names for Same Concept

We have **inconsistent naming** for the same fields across database, TypeScript, and UI:

### 1. **Provider Identifier**
- Database (accounts table): `provider_id` ✅ snake_case
- Database (connections table): `provider` ❌ different name
- TypeScript code: `providerId` ❌ camelCase
- API responses: Mix of both

### 2. **Account Identifier**
- Database: `account_id` (primary key)
- Database: `external_account_id` (provider's ID)
- TypeScript: `accountId` / `externalAccountId`
- Raw data: `account_id` (Plaid's format)

### 3. **Connection Identifier**
- Database: `id` (UUID primary key)
- Database: `connection_id` (foreign key reference)
- TypeScript: `connectionId`

### 4. **Transaction Status**
- Database CHECK constraint: `'Pending', 'Completed', 'Failed', 'Cancelled'` (Capitalized)
- Code sometimes uses: `'pending', 'completed'` (lowercase)

### 5. **Transaction Type**
- Database CHECK constraint: Now accepts both via `LOWER(type) IN ('credit', 'debit')`
- Code uses: `'credit', 'debit'` (lowercase)
- Seed data uses: `'Credit', 'Debit'` (capitalized)

## 🎯 Standardization Goals

1. **Database**: Use `snake_case` consistently
2. **TypeScript**: Use `camelCase` consistently  
3. **API**: Transform at boundaries (snake_case ↔ camelCase)
4. **Enums**: Standardize on one casing (prefer lowercase for new code)

## 📋 Proposed Standardization

### Phase 1: Critical Fixes (Immediate)

#### Fix 1: Standardize Provider Field Name
**Decision**: Use `provider_id` everywhere in database, `providerId` in TypeScript

**Changes Needed:**
1. Add `provider_id` column to connections table (if not exists)
2. Migrate data from `provider` → `provider_id`
3. Update all queries to use `provider_id`
4. Deprecate `provider` column

**SQL:**
```sql
-- Add provider_id if not exists
ALTER TABLE connections ADD COLUMN IF NOT EXISTS provider_id TEXT;

-- Migrate data
UPDATE connections SET provider_id = provider WHERE provider_id IS NULL;

-- Eventually: DROP COLUMN provider (after full migration)
```

#### Fix 2: Update Reconnection Service
Use correct column names:
- `accounts.external_account_id` ✅
- `connections.provider_id` (once added)
- Avoid `accounts.provider` (doesn't exist)

#### Fix 3: Add provider Field to Accounts
The reconnection service needs to filter by provider. Add it:
```sql
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS provider TEXT;
UPDATE accounts SET provider = provider_id WHERE provider IS NOT NULL;
```

### Phase 2: Comprehensive Standardization (Follow-up)

#### Database Schema Standardization

**connections table:**
- `id` → primary key ✅
- `provider` → `provider_id` (rename/migrate)
- `connection_type` → keep as is ✅
- `tenant_id` → keep as is ✅

**accounts table:**
- `account_id` → primary key ✅ (or migrate to just `id`?)
- `external_account_id` → keep as is ✅
- `provider_id` → already exists ✅
- `connection_id` → keep as is ✅
- Add: `provider` for quick filtering

**transactions table:**
- Keep all `snake_case` ✅
- `type` → accepts both cases via LOWER() ✅
- `provider_id` → already added ✅

#### TypeScript Standardization

All TypeScript interfaces should use camelCase:
```typescript
interface Connection {
  id: string;
  providerId: string;  // Not provider
  connectionType: string;
  tenantId: string;
}

interface Account {
  accountId: string;
  externalAccountId: string;
  providerId: string;  // Consistent!
  connectionId: string;
}
```

#### API Transformation Layer

Create utility functions:
```typescript
// Convert database snake_case to TypeScript camelCase
function dbToApi(dbRecord: any): any {
  return {
    id: dbRecord.id,
    providerId: dbRecord.provider_id || dbRecord.provider,
    connectionType: dbRecord.connection_type,
    // ... transform all fields
  };
}

// Convert TypeScript camelCase to database snake_case
function apiToDb(apiRecord: any): any {
  return {
    id: apiRecord.id,
    provider_id: apiRecord.providerId,
    connection_type: apiRecord.connectionType,
    // ... transform all fields
  };
}
```

### Phase 3: Testing & Validation

1. Update all API routes to use consistent transformations
2. Update all React hooks to expect consistent naming
3. Update all TypeScript interfaces
4. Run full regression tests
5. Update documentation

## 🚨 Immediate Action Needed

For the reconnection service to work properly, we need to:

### Option A: Quick Fix (Add `provider` to accounts)
```sql
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS provider TEXT;
UPDATE accounts 
  SET provider = provider_id 
  WHERE provider IS NULL AND provider_id IS NOT NULL;
```

### Option B: Update Reconnection Service (Use existing columns)
Remove provider from detection, use:
- `external_account_id` (always unique)
- `institution_id` (if available)
- `iban` (if available)

## Recommendation

Let's go with **Option A + B combined**:
1. Add `provider` column to accounts for quick filtering
2. Update reconnection service to use available columns
3. Phase 2: Comprehensive rename `connections.provider` → `connections.provider_id`
4. Phase 3: Add API transformation layer for consistency

Would you like me to implement the immediate fix first?

