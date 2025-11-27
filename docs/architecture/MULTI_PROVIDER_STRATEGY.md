# Multi-Provider Banking Integration Architecture

## Current State Analysis

### 🎯 You Already Have the Right Architecture!

The system already implements a **hybrid approach** with:

1. **`transactions`** - Normalized, cross-provider data (the "source of truth" for UI)
2. **`provider_transactions`** - Raw provider-specific data (the "data warehouse")
3. **`provider_accounts`** - Provider account mappings
4. **`provider_tokens`** - Provider authentication
5. **`banking_providers`** - Provider registry

**This is actually the industry-standard pattern!** Similar to:
- Stripe (normalized `charges` + raw `events`)
- Plaid (normalized transactions + raw provider data)
- Modern data warehouses (curated + raw layers)

---

## The Problem: Underutilization

### What's Working ✅
- `provider_transactions` table exists
- Transactions ARE being stored there (lines 287-311 in sync route)
- Provider metadata is captured in JSONB

### What's Missing ❌
1. **Incomplete data storage** - Not all Tink fields are stored in `provider_metadata`
2. **No retrieval** - UI only queries `transactions` table, never `provider_transactions`
3. **No linking** - `provider_transactions.transaction_id` not always set (link to main table)
4. **Limited metadata** - Only using a few fields in `provider_metadata`

---

## Recommended Architecture

### Option 1: Enhanced Hybrid (Recommended) ⭐⭐⭐

**Keep current structure, but fully utilize it:**

```
┌─────────────────────────────────────────────────────────┐
│                      UI Layer                            │
│  Shows: transactions + enriched with provider_transactions│
└─────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────┐
│                  transactions table                      │
│  • Normalized cross-provider fields                     │
│  • Fast queries, consistent schema                      │
│  • What users see by default                            │
│                                                          │
│  Fields: date, amount, description, type, category      │
│  JSONB: Basic metadata                                  │
└─────────────────────────────────────────────────────────┘
                            ↕ (linked via transaction_id)
┌─────────────────────────────────────────────────────────┐
│             provider_transactions table                  │
│  • COMPLETE provider-specific data                      │
│  • ALL Tink fields stored                               │
│  • Queryable when needed                                │
│                                                          │
│  Fields: Basic transaction data                         │
│  JSONB: provider_metadata (EVERYTHING)                  │
│                                                          │
│  Tink metadata: {                                       │
│    booking_status, value_date, original_date,           │
│    transaction_type, transaction_code,                  │
│    merchant_details, category_id, notes,                │
│    provider_transaction_id, identifiers,                │
│    ... (COMPLETE Tink response)                         │
│  }                                                       │
└─────────────────────────────────────────────────────────┘
```

**Benefits:**
- ✅ Preserves ALL provider data
- ✅ Fast cross-provider queries on `transactions`
- ✅ Can access provider-specific fields when needed
- ✅ Easy to add new providers (just add to JSONB)
- ✅ No schema changes for new provider fields
- ✅ Audit trail (original provider data preserved)

**When to use which table:**

| Use Case | Query From | Why |
|----------|------------|-----|
| Transaction list | `transactions` | Fast, normalized |
| Dashboard totals | `transactions` | Cross-provider aggregation |
| Export to CSV | `transactions` | Consistent format |
| **Provider-specific detail** | `JOIN` both tables | Full fidelity |
| **Reconciliation** | `provider_transactions` | Bank codes, IDs |
| **Debugging sync issues** | `provider_transactions` | Raw provider data |
| **Compliance/audit** | `provider_transactions` | Complete records |

---

### Option 2: Provider-Specific Tables (NOT Recommended) ❌

```
tink_transactions
├─ ALL Tink-specific columns
├─ Strongly typed (no JSONB)
└─ Links to main transactions

bunq_transactions
├─ ALL Bunq-specific columns
└─ Different schema than Tink

fnb_transactions
├─ ALL FNB-specific columns
└─ Different schema again
```

**Problems:**
- ❌ Hard to query across providers
- ❌ Schema changes for every provider
- ❌ Complex migrations
- ❌ Lots of similar tables
- ❌ Can't handle new providers without migrations

---

### Option 3: Wide Table with All Possible Fields (NOT Recommended) ❌

```sql
CREATE TABLE transactions (
  -- Common fields
  date, amount, description,
  
  -- Tink-specific
  tink_booking_status,
  tink_value_date,
  tink_transaction_type,
  tink_category_id,
  
  -- Bunq-specific
  bunq_payment_id,
  bunq_sub_type,
  
  -- FNB-specific
  fnb_reference_number,
  fnb_branch_code,
  
  -- 100+ columns...
)
```

**Problems:**
- ❌ Sparse table (80%+ NULLs)
- ❌ Huge schema
- ❌ Schema changes for every provider
- ❌ Confusing: which fields for which provider?

---

## Implementation Plan

### Phase 1: Store Complete Provider Data (2-3 hours)

**Update Tink provider to store EVERYTHING:**

```typescript
// lib/banking-providers/tink-provider.ts

async fetchTransactions(...): Promise<ProviderTransaction[]> {
  const transactions = await TinkClient.getTransactions(...);

  return transactions.map((txn): ProviderTransaction => {
    const amount = TinkClient.formatTinkAmount(txn.amount.value);
    const bookedDate = txn.dates?.booked ? new Date(txn.dates.booked) : new Date();
    
    return {
      externalTransactionId: txn.id,
      accountId: accountId,
      date: bookedDate,
      amount: Math.abs(amount),
      currency: txn.amount.currencyCode,
      description: txn.descriptions?.display || txn.descriptions?.original || txn.merchantName || 'Transaction',
      type: amount >= 0 ? 'credit' : 'debit',
      counterpartyName: txn.merchantName,
      counterpartyAccount: undefined,
      reference: txn.reference,
      category: txn.categories?.pfm?.name,
      
      // ✨ ENHANCED METADATA - Store COMPLETE Tink response
      metadata: {
        // Store the ENTIRE transaction object for full fidelity
        raw_transaction: txn,  // ✨ NEW: Complete raw data
        
        // Plus extracted commonly-used fields for easier querying
        booking_status: txn.bookingStatus,
        value_date: txn.dates?.value,
        original_date: txn.originalDate,
        transaction_type: txn.types?.type,
        transaction_code: txn.types?.code,
        category_id: txn.categories?.pfm?.id,        // ✨ NEW
        notes: txn.notes,
        status: txn.status,                          // ✨ NEW
        provider_transaction_id: txn.identifiers?.providerTransactionId,  // ✨ NEW
        
        // Merchant details
        merchant_category_code: txn.merchantCategoryCode,  // ✨ NEW
        merchant_location: txn.location,                   // ✨ NEW
        
        // Additional identifiers
        identifiers: txn.identifiers,                // ✨ NEW: All IDs
      },
    };
  });
}
```

**Result:** `provider_transactions.provider_metadata` contains COMPLETE Tink data.

---

### Phase 2: Link Tables Properly (1 hour)

**Ensure `provider_transactions.transaction_id` is always set:**

```typescript
// app/api/banking/[provider]/sync/route.ts

// After storing in provider_transactions
const { data: providerTx } = await supabase.from('provider_transactions').upsert({
  // ... existing fields ...
  provider_metadata: transaction.metadata || {},
}, {
  onConflict: 'connection_id,provider_id,external_transaction_id',
}).select().single();

// Import to main transactions table
const mainTxId = `${providerId}-${transaction.externalTransactionId}`;
const { data: mainTx } = await supabase.from('transactions').upsert({
  transaction_id: mainTxId,
  account_id: stratiriAccountId,
  date: transaction.date.toISOString().split('T')[0],
  // ... other fields ...
}).select().single();

// ✨ LINK THEM: Update provider_transactions with the main transaction_id
if (mainTx && providerTx) {
  await supabase
    .from('provider_transactions')
    .update({ transaction_id: mainTx.transaction_id })
    .eq('id', providerTx.id);
}
```

**Result:** Easy to join tables and retrieve provider-specific data.

---

### Phase 3: Create Enriched View (30 mins)

**Create a view that joins normalized + provider data:**

```sql
CREATE OR REPLACE VIEW transactions_enriched AS
SELECT 
  t.*,
  pt.provider_id,
  pt.external_transaction_id,
  pt.provider_metadata,
  -- Extract common provider fields for easy access
  pt.provider_metadata->>'booking_status' as booking_status,
  pt.provider_metadata->>'value_date' as value_date,
  pt.provider_metadata->>'transaction_type' as transaction_type,
  pt.provider_metadata->>'transaction_code' as transaction_code,
  pt.provider_metadata->>'notes' as notes
FROM transactions t
LEFT JOIN provider_transactions pt ON pt.transaction_id = t.transaction_id;
```

**Result:** Single query to get normalized + provider data.

---

### Phase 4: Update UI to Use Enriched Data (2-3 hours)

**Query enriched view instead of plain transactions:**

```typescript
// lib/hooks/use-transactions.ts

export function useAccountTransactions(accountId?: string) {
  return useQuery({
    queryKey: ['transactions', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions_enriched')  // ✨ Use enriched view
        .select('*')
        .eq('account_id', accountId)
        .order('date', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!accountId,
  });
}
```

**Display provider-specific fields:**

```typescript
// app/accounts/[id]/transactions/page.tsx

<TransactionRow transaction={transaction}>
  {/* Normalized fields */}
  <Date>{formatDate(transaction.date)}</Date>
  <Description>{transaction.description}</Description>
  
  {/* ✨ Provider-specific fields */}
  {transaction.booking_status && (
    <StatusBadge status={transaction.booking_status} />
  )}
  
  {transaction.transaction_type && (
    <TypeBadge type={transaction.transaction_type} />
  )}
  
  {transaction.value_date && transaction.value_date !== transaction.date && (
    <ValueDate>{formatDate(transaction.value_date)}</ValueDate>
  )}
</TransactionRow>
```

---

## Migration Strategy for Existing Data

### Backfill Script

```typescript
// scripts/utilities/backfill-provider-metadata.ts

async function backfillProviderMetadata() {
  console.log('🔄 Backfilling provider transaction metadata...');
  
  // Get all provider transactions without complete metadata
  const { data: providerTxs } = await supabase
    .from('provider_transactions')
    .select('*')
    .eq('provider_id', 'tink')
    .is('provider_metadata->raw_transaction', null);
  
  console.log(`Found ${providerTxs?.length || 0} transactions to backfill`);
  
  for (const ptx of providerTxs || []) {
    // Re-fetch from Tink API using external_transaction_id
    // Or mark for re-sync
    console.log(`Backfilling ${ptx.external_transaction_id}`);
    
    // Option 1: Re-fetch (if API supports it)
    // const freshData = await tinkClient.getTransaction(ptx.external_transaction_id);
    
    // Option 2: Mark for re-sync
    await supabase
      .from('provider_transactions')
      .update({ import_status: 'pending' })
      .eq('id', ptx.id);
  }
  
  console.log('✅ Backfill complete. Trigger a sync to fetch fresh data.');
}
```

---

## Schema Changes Needed

### 1. Add Index for Joins (Performance)

```sql
-- Speed up joins between tables
CREATE INDEX IF NOT EXISTS idx_provider_transactions_transaction_id 
  ON provider_transactions(transaction_id) 
  WHERE transaction_id IS NOT NULL;

-- Speed up provider-specific queries
CREATE INDEX IF NOT EXISTS idx_provider_transactions_provider_metadata 
  ON provider_transactions USING GIN (provider_metadata);
```

### 2. Add Constraints

```sql
-- Ensure referential integrity
ALTER TABLE provider_transactions 
  DROP CONSTRAINT IF EXISTS provider_transactions_transaction_id_fkey,
  ADD CONSTRAINT provider_transactions_transaction_id_fkey 
    FOREIGN KEY (transaction_id) 
    REFERENCES transactions(transaction_id) 
    ON DELETE SET NULL;
```

---

## Provider Comparison Matrix

### How Different Providers Map

| Feature | Tink | Bunq | FNB (Future) | Plaid (Future) |
|---------|------|------|--------------|----------------|
| **Transaction ID** | `id` | `id` | `reference_number` | `transaction_id` |
| **Booking Status** | `bookingStatus` | `status` | `status` | `pending` |
| **Value Date** | `dates.value` | `value_date` | `value_date` | N/A |
| **Merchant** | `merchantName` | `counterparty_alias.display_name` | `beneficiary_name` | `merchant_name` |
| **Category** | `categories.pfm.name` | `category` | `transaction_type` | `category[0]` |
| **Transaction Type** | `types.type` | `type` | `transaction_code` | `payment_channel` |

**With JSONB metadata:**
- Each provider stores its complete response
- No need to map everything to common schema
- Provider-specific fields accessible when needed

---

## Benefits of Current Architecture

### 1. **Fast Cross-Provider Queries**
```sql
-- Get total balance across ALL providers (fast!)
SELECT SUM(amount) FROM transactions WHERE type = 'Credit';

-- Works whether data came from Tink, Bunq, CSV, or FNB
```

### 2. **Provider-Specific Detail When Needed**
```sql
-- Get Tink-specific booking status for reconciliation
SELECT 
  t.description,
  t.amount,
  pt.provider_metadata->>'booking_status' as tink_booking_status,
  pt.provider_metadata->>'transaction_code' as tink_code
FROM transactions t
JOIN provider_transactions pt ON pt.transaction_id = t.transaction_id
WHERE pt.provider_id = 'tink';
```

### 3. **Easy to Add New Providers**
```typescript
// Add FNB - NO schema changes needed!
class FNBProvider extends BankingProvider {
  async fetchTransactions(...) {
    return fnbTransactions.map(tx => ({
      // Standard fields
      date, amount, description,
      
      // FNB-specific goes into metadata
      metadata: {
        fnb_reference_number: tx.ref,
        fnb_branch_code: tx.branch,
        fnb_unique_field: tx.something_specific,
        raw_transaction: tx, // Complete FNB response
      }
    }));
  }
}
```

### 4. **Audit Trail & Compliance**
```sql
-- For audits: retrieve EXACT data from bank
SELECT provider_metadata->'raw_transaction' 
FROM provider_transactions 
WHERE external_transaction_id = 'xyz';

-- Result: Complete, unmodified bank response
```

---

## Recommendation

### ✅ Keep Current Architecture, Enhance It

**DO:**
1. ✅ Store COMPLETE provider response in `provider_metadata`
2. ✅ Create `transactions_enriched` view
3. ✅ Update UI to use enriched data
4. ✅ Add indexes for performance
5. ✅ Create utility functions to access provider data

**DON'T:**
- ❌ Create provider-specific tables (too rigid)
- ❌ Add provider-specific columns to transactions (too wide)
- ❌ Lose provider-specific data (audit issues)

---

## Implementation Estimate

| Phase | Time | Effort |
|-------|------|--------|
| **Phase 1:** Store complete metadata | 2-3 hours | Medium |
| **Phase 2:** Link tables properly | 1 hour | Easy |
| **Phase 3:** Create enriched view | 30 mins | Easy |
| **Phase 4:** Update UI | 2-3 hours | Medium |
| **Testing & refinement** | 2 hours | Medium |
| **TOTAL** | **8-10 hours** | **Medium** |

---

## Conclusion

**Your architecture is already correct!** You just need to:

1. **Use it fully** - Store ALL provider data in `provider_metadata`
2. **Link properly** - Ensure `transaction_id` FK is always set
3. **Query smartly** - Create views that join normalized + provider data
4. **Display richly** - Show provider-specific fields when valuable

This gives you:
- ✅ Best of both worlds (fast queries + complete data)
- ✅ Easy to add new providers
- ✅ No schema changes for new provider fields
- ✅ Audit trail preserved
- ✅ Scalable architecture

**Ready to implement?**

