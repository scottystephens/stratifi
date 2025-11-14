# Transactions vs Statements: Quick Implementation Guide

## Overview

Stratifi supports two distinct types of bank data integrations:

1. **Transactions** - Detailed line-item data of money movements
2. **Statements** - Daily/periodic balance snapshots

---

## When to Use Each Type

### Use Transactions For:
✅ Detailed reconciliation  
✅ Cash flow analysis  
✅ Transaction categorization  
✅ Audit trails  
✅ Expense tracking  
✅ Payment verification  

### Use Statements For:
✅ Daily cash positioning  
✅ Balance forecasting  
✅ Quick account overview  
✅ Intraday liquidity management  
✅ Historical balance trends  
✅ Lightweight API calls  

---

## Key Differences

| Aspect | Transactions | Statements |
|--------|--------------|------------|
| **Granularity** | Individual transactions | Daily summaries |
| **Volume** | High (100s-1000s/day) | Low (1-10/day) |
| **Data Size** | Large datasets | Small, compact |
| **Update Frequency** | Real-time or daily | Daily or intraday |
| **Best For** | Detail analysis | Quick overview |
| **API Performance** | Slower (more data) | Faster (less data) |

---

## Database Tables

### Transactions Table
```sql
-- Core fields
transaction_date, value_date, amount, currency, description

-- Extended fields  
reference_number, check_number, counterparty_name, bank_reference

-- Enhanced fields
category, merchant_name, merchant_category_code, location

-- FX fields
original_amount, original_currency, exchange_rate

-- Fees/Taxes
fee_amount, tax_amount
```

### Statements Table
```sql
-- Core fields
statement_date, opening_balance, closing_balance, currency

-- Balance types
available_balance, current_balance, collected_balance, float_balance

-- Summary fields
total_credits, total_debits, credit_count, debit_count, net_change

-- Intraday fields
snapshot_time, target_balance, one_day_float, two_day_float
```

---

## Connection Types

### CSV Import (Current)
- **Supports:** Transactions ✅
- **Format:** Any CSV format
- **Frequency:** Manual upload
- **Status:** ✅ Implemented

### BAI2 File (Future)
- **Supports:** Both transactions and statements
- **Format:** BAI2 standard
- **Frequency:** Daily (SFTP)
- **Status:** 🔜 Planned

### Bank API (Future)
- **Supports:** Both transactions and statements
- **Format:** REST/SOAP API
- **Frequency:** Real-time or scheduled
- **Status:** 🔜 Planned

### Plaid Integration (Future)
- **Supports:** Transactions ✅, Balances ✅
- **Format:** JSON API
- **Frequency:** Real-time
- **Status:** 🔜 Planned

---

## Implementation Checklist

### Phase 1: Current State ✅
- [x] Transaction imports from CSV
- [x] Basic transaction fields
- [x] Account linking
- [x] Transaction deduplication

### Phase 2: Enhanced Transactions 🚧
- [ ] Run migration `07-enhance-transactions-table.sql`
- [ ] Add extended fields to import UI
- [ ] Transaction categorization
- [ ] Reference number matching
- [ ] Counterparty tracking

### Phase 3: Statements Implementation 🔜
- [ ] Run migration `06-create-statements-table.sql`
- [ ] Build statement import API
- [ ] Balance trending charts
- [ ] Cash position dashboard
- [ ] Daily balance reports

### Phase 4: Connection Management 🔜
- [ ] Run migration `08-enhance-connections-for-data-types.sql`
- [ ] Update connection UI to select data type
- [ ] Implement sync scheduling
- [ ] Error tracking and recovery
- [ ] Automated sync jobs

---

## API Examples

### Import Transactions (Current)
```typescript
POST /api/ingestion/csv/import
{
  "accountId": "uuid",
  "mappings": {
    "date": "Transaction Date",
    "amount": "Amount",
    "description": "Description"
  },
  "data": [...]
}
```

### Import Statement (Future)
```typescript
POST /api/statements/import
{
  "accountId": "uuid",
  "statementDate": "2024-01-15",
  "statementType": "daily",
  "openingBalance": 10000.00,
  "closingBalance": 12500.00,
  "currency": "USD",
  "totalCredits": 5000.00,
  "totalDebits": 2500.00
}
```

### Get Balance History (Future)
```typescript
GET /api/statements?accountId=uuid&startDate=2024-01-01&endDate=2024-01-31

Response:
{
  "statements": [
    {
      "date": "2024-01-01",
      "openingBalance": 10000.00,
      "closingBalance": 10500.00,
      "totalCredits": 800.00,
      "totalDebits": 300.00
    },
    ...
  ]
}
```

---

## Data Flow Diagrams

### Transaction Flow
```
Bank Statement CSV
    ↓
Upload to Stratifi
    ↓
Parse & Map Columns
    ↓
Validate Data
    ↓
Deduplicate
    ↓
Store in Transactions Table
    ↓
Display in Dashboard
```

### Statement Flow
```
Bank Balance Report
    ↓
API/File Import
    ↓
Validate Balance Data
    ↓
Check for Duplicates
    ↓
Store in Statements Table
    ↓
Calculate Trends
    ↓
Display in Cash Dashboard
```

---

## Reconciliation Strategy

### Match Transactions to Statements
```sql
-- Verify transaction totals match statement summary
SELECT 
  DATE(t.transaction_date) as date,
  SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as credits,
  SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END) as debits,
  SUM(t.amount) as net_change
FROM transactions t
WHERE t.account_id = 'uuid'
  AND t.transaction_date = '2024-01-15'
GROUP BY DATE(t.transaction_date);

-- Compare to statement
SELECT 
  s.statement_date,
  s.total_credits,
  s.total_debits,
  s.net_change
FROM statements s
WHERE s.account_id = 'uuid'
  AND s.statement_date = '2024-01-15';
```

---

## Best Practices

### For Transactions:
1. **Always store original raw data** in `raw_data` JSONB field
2. **Use reference numbers** for matching and reconciliation
3. **Categorize transactions** for better reporting
4. **Track reconciliation status** to identify mismatches
5. **Preserve original FX amounts** for multi-currency

### For Statements:
1. **Import daily statements** for continuous balance tracking
2. **Store multiple balance types** (current, available, collected)
3. **Track float** for cash management
4. **Validate totals** against transaction sums
5. **Use intraday statements** for real-time cash positioning

### For Both:
1. **Tenant isolation** - Always filter by tenant_id
2. **Audit trail** - Track source, import_id, timestamps
3. **Idempotency** - Prevent duplicate imports
4. **Error handling** - Log and track import errors
5. **Performance** - Use appropriate indexes

---

## Migration Steps

### 1. Enhance Transactions Table
```bash
# Connect to Supabase SQL Editor
# Run: scripts/migrations/07-enhance-transactions-table.sql
```

### 2. Create Statements Table
```bash
# Run: scripts/migrations/06-create-statements-table.sql
```

### 3. Update Connections
```bash
# Run: scripts/migrations/08-enhance-connections-for-data-types.sql
```

### 4. Verify Installation
```sql
-- Check new columns exist
\d transactions
\d statements

-- Verify indexes
\di transactions*
\di statements*

-- Test views
SELECT * FROM unreconciled_transactions LIMIT 5;
SELECT * FROM connection_sync_status;
```

---

## Future Enhancements

### Short Term
- [ ] Statement import UI
- [ ] Balance trending charts
- [ ] Transaction categorization rules
- [ ] Automated reconciliation

### Medium Term
- [ ] BAI2 file parser
- [ ] SWIFT MT940 parser
- [ ] Scheduled SFTP imports
- [ ] Webhook notifications

### Long Term
- [ ] Machine learning categorization
- [ ] Anomaly detection
- [ ] Cash flow forecasting
- [ ] Multi-bank aggregation

---

## References

- [Bank Data Standards](../architecture/BANK_DATA_STANDARDS.md)
- [Data Ingestion Architecture](../architecture/DATA_INGESTION_ARCHITECTURE.md)
- [CSV Ingestion Guide](./CSV_INGESTION_COMPLETE.md)

---

**Last Updated:** 2024-11-14  
**Version:** 1.0

