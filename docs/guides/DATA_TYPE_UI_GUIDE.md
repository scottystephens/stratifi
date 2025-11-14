# Data Type UI Guide

## Overview

Visual indicators throughout the UI that show whether a connection provides **Transaction Data** or **Statement Data**, helping users understand what type of financial data they're working with.

---

## 📍 Where You'll See Data Type Indicators

### 1. **Connections List Page** (`/connections`)

Each connection card now shows a "Data Type" row with badges:

```
┌─────────────────────────────────────┐
│  📄 CSV Import                      │
│  Main Checking Account              │
├─────────────────────────────────────┤
│  Status:      ● Active              │
│  Data Type:   💰 Transactions       │  ← NEW!
│  Import Mode: Append                │
│  Last sync:   Nov 14, 2024          │
├─────────────────────────────────────┤
│  [View Details]  [History]          │
└─────────────────────────────────────┘
```

**Badge Types:**
- 💰 **Transactions** (Blue) - Individual transaction records
- 📊 **Statements** (Purple) - Daily balance summaries
- Both badges if connection supports both types

---

### 2. **CSV Upload Flow** (`/connections/new`)

After uploading a CSV, the system auto-detects the data type and shows:

```
┌──────────────────────────────────────────────────┐
│  ✓ Detected: Transaction Data                    │
│  🟢 high confidence                              │
│                                                  │
│  Found 3 transaction indicators (posting,        │
│  debit, merchant)                                │
│                                                  │
│  💡 Transaction data will be imported as         │
│     individual transaction records.              │
└──────────────────────────────────────────────────┘
```

**Confidence Levels:**
- 🟢 **High Confidence** (Green) - Found specific indicators
- 🔵 **Medium Confidence** (Blue) - Likely based on structure
- 🟡 **Low Confidence** (Yellow) - Uncertain, manual review needed

---

## 🎨 Visual Design

### Connection Card Badges

```typescript
// Transaction badge
<Badge className="bg-blue-100 text-blue-800 text-xs">
  💰 Transactions
</Badge>

// Statement badge
<Badge className="bg-purple-100 text-purple-800 text-xs">
  📊 Statements
</Badge>
```

### Detection Result Cards

**High Confidence (Green):**
```
bg-green-50 border-green-200
✓ Detected: Transaction Data
Badge: bg-green-100 text-green-800
```

**Medium Confidence (Blue):**
```
bg-blue-50 border-blue-200
~ Detected: Transaction Data
Badge: bg-blue-100 text-blue-800
```

**Low/Unknown (Yellow):**
```
bg-yellow-50 border-yellow-200
? Unknown Data Type
Badge: bg-yellow-100 text-yellow-800
```

---

## 🤖 Auto-Detection Logic

### Transaction Indicators

The system looks for these column names:
- `transaction`, `posting`
- `debit`, `credit`
- `merchant`, `reference`
- `memo`, `counterparty`
- `payee`, `check`

**Example:**
```csv
Date,Description,Debit,Credit,Merchant,Reference
2024-01-15,Coffee Shop,5.50,,Starbucks,REF-12345
```
→ **Detected: Transactions** (high confidence)

### Statement Indicators

The system looks for these column names:
- `opening_balance`, `closing_balance`
- `beginning_balance`, `ending_balance`
- `statement_date`, `daily_balance`
- `available_balance`
- `total_credits`, `total_debits`

**Example:**
```csv
Date,Opening Balance,Closing Balance,Total Credits,Total Debits
2024-01-15,10000.00,12500.00,5000.00,2500.00
```
→ **Detected: Statements** (high confidence)

### Fallback Logic

If no specific indicators found:
- Has `date`, `amount`, `description` → **Transactions** (medium confidence)
- Otherwise → **Unknown** (low confidence)

---

## 📊 User Experience Flow

### Flow 1: CSV Upload (Auto-Detection)

```
1. User uploads CSV file
   ↓
2. System analyzes column names
   ↓
3. Shows detection result card
   ↓
4. User sees confidence level & explanation
   ↓
5. Proceeds with import (can't override yet - future feature)
```

### Flow 2: Viewing Connections

```
1. User navigates to /connections
   ↓
2. Each card shows data type badges
   ↓
3. User can filter by type (future feature)
   ↓
4. Quick visual reference for what each connection provides
```

---

## 💡 Educational Tooltips

### For Users

**Transaction Data:**
- Individual line items
- Shows every debit and credit
- Used for reconciliation and detailed analysis
- High volume (100s-1000s of records)

**Statement Data:**
- Daily balance snapshots
- Opening/closing balances
- Summary of credits/debits
- Low volume (1-10 records per day)

---

## 🔧 Technical Implementation

### Database Fields

```sql
-- connections table
data_type VARCHAR(20) DEFAULT 'transactions'
supports_transactions BOOLEAN DEFAULT true
supports_statements BOOLEAN DEFAULT false
```

### API Response

```json
{
  "id": "uuid",
  "name": "Main Checking",
  "connection_type": "csv",
  "data_type": "transactions",
  "supports_transactions": true,
  "supports_statements": false,
  "detectedDataType": {
    "dataType": "transactions",
    "confidence": "high",
    "reason": "Found 3 transaction indicators (posting, debit, merchant)"
  }
}
```

### Detection Function

```typescript
function detectDataType(columns: string[]): {
  dataType: 'transactions' | 'statements' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}
```

Located in: `/app/api/ingestion/csv/upload/route.ts`

---

## 🎯 Future Enhancements

### Phase 1 (Current) ✅
- [x] Show data type badges on connection cards
- [x] Auto-detect type during CSV upload
- [x] Display confidence levels
- [x] Educational tooltips

### Phase 2 (Next)
- [ ] Allow manual override of detected type
- [ ] Filter connections by data type
- [ ] Search by data type
- [ ] Show data type in breadcrumb/page title

### Phase 3 (Advanced)
- [ ] Machine learning for better detection
- [ ] Support for hybrid files (both types in one CSV)
- [ ] Historical accuracy tracking
- [ ] User feedback loop on detection accuracy

---

## 📸 Screenshots Reference

### Connection Card - Transaction Type
```
┌──────────────────────────────┐
│ 📄 Chase Checking            │
│ ─────────────────────────── │
│ Status: ● Active             │
│ Data Type: 💰 Transactions  │
│ ─────────────────────────── │
└──────────────────────────────┘
```

### Connection Card - Statement Type
```
┌──────────────────────────────┐
│ 📊 Daily Balance Report      │
│ ─────────────────────────── │
│ Status: ● Active             │
│ Data Type: 📊 Statements    │
│ ─────────────────────────── │
└──────────────────────────────┘
```

### Connection Card - Both Types
```
┌──────────────────────────────┐
│ 🏦 Bunq Account             │
│ ─────────────────────────── │
│ Status: ● Active             │
│ Data Type: 💰 📊            │
│   Transactions • Statements  │
│ ─────────────────────────── │
└──────────────────────────────┘
```

---

## 🎓 User Education

### In-App Messages

When showing **Transaction** badge:
> 💡 Transaction data will be imported as individual transaction records.

When showing **Statement** badge:
> 💡 Statement data will be imported to track daily balances and summaries.

When **Unknown**:
> ℹ️ We couldn't determine the data type. The system will try to import it as transactions.

---

## ✅ Testing Checklist

- [ ] Upload CSV with transaction data (debit/credit columns)
- [ ] Upload CSV with statement data (opening/closing balance columns)
- [ ] Upload CSV with basic date/amount/description only
- [ ] View connections list and verify badges appear
- [ ] Verify confidence levels display correctly
- [ ] Check that explanatory text is helpful
- [ ] Test responsive design on mobile
- [ ] Verify colors meet accessibility standards

---

## 🔗 Related Documentation

- [Bank Data Standards](../architecture/BANK_DATA_STANDARDS.md)
- [Transactions vs Statements Guide](./TRANSACTIONS_VS_STATEMENTS.md)
- [CSV Ingestion Guide](./CSV_INGESTION_COMPLETE.md)

---

**Last Updated:** 2024-11-14  
**Version:** 1.0  
**Status:** ✅ Implemented & Deployed

