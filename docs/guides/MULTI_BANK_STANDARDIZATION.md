# Multi-Bank Standardization with Aggregation Services

## The Problem You're Solving

**Without Aggregation Service:**
- Bunq API returns: `{ "id": 12345, "balance": { "value": "1000.50", "currency": "EUR" } }`
- ING API returns: `{ "accountNumber": "NL91ABNA0417164300", "balance": 1000.50, "currencyCode": "EUR" }`
- Different formats, different field names, different structures
- You need custom parsing for EACH bank

**With Aggregation Service (Tink/Nordigen/etc.):**
- Both Bunq and ING return: `{ "accountId": "acc_123", "balance": 1000.50, "currency": "EUR" }`
- **Same format** regardless of bank
- One implementation handles all banks

---

## How It Works

### Example: Client with Bunq + ING Accounts

#### Scenario
Your client has:
- **1 Bunq account** (Business checking)
- **2 ING accounts** (Savings + Checking)

#### With Aggregation Service (Tink/Nordigen)

**Step 1: User Connects Both Banks**
```
User → Tink OAuth → Connects Bunq
User → Tink OAuth → Connects ING
```

**Step 2: Fetch All Accounts (Standardized Format)**
```typescript
// One API call gets ALL accounts from ALL banks
const accounts = await tinkProvider.fetchAccounts(credentials);

// Returns standardized format:
[
  {
    externalAccountId: "acc_bunq_12345",
    accountName: "Business Checking",
    accountNumber: "NL91BUNQ1234567890",
    accountType: "checking",
    currency: "EUR",
    balance: 1000.50,
    iban: "NL91BUNQ1234567890",
    status: "active",
    metadata: { bank: "bunq" }
  },
  {
    externalAccountId: "acc_ing_67890",
    accountName: "Savings Account",
    accountNumber: "NL91INGB0417164300",
    accountType: "savings",
    currency: "EUR",
    balance: 5000.00,
    iban: "NL91INGB0417164300",
    status: "active",
    metadata: { bank: "ing" }
  },
  {
    externalAccountId: "acc_ing_11111",
    accountName: "Personal Checking",
    accountNumber: "NL91INGB0417164301",
    accountType: "checking",
    currency: "EUR",
    balance: 250.75,
    iban: "NL91INGB0417164301",
    status: "active",
    metadata: { bank: "ing" }
  }
]
```

**Step 3: Fetch All Transactions (Standardized Format)**
```typescript
// One API call gets transactions from ALL accounts
const transactions = await tinkProvider.fetchTransactions(credentials, {
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31')
});

// Returns standardized format (same for Bunq and ING):
[
  {
    externalTransactionId: "txn_bunq_001",
    accountId: "acc_bunq_12345",
    date: new Date('2024-01-15'),
    amount: -150.00,
    currency: "EUR",
    description: "Payment to Supplier XYZ",
    type: "debit",
    counterpartyName: "Supplier XYZ",
    counterpartyAccount: "NL91ABNA1234567890",
    reference: "REF-12345",
    category: "expense",
    metadata: { bank: "bunq" }
  },
  {
    externalTransactionId: "txn_ing_001",
    accountId: "acc_ing_67890",
    date: new Date('2024-01-16'),
    amount: 1000.00,
    currency: "EUR",
    description: "Salary Deposit",
    type: "credit",
    counterpartyName: "Employer ABC",
    counterpartyAccount: "NL91RABO9876543210",
    reference: "SAL-2024-01",
    category: "income",
    metadata: { bank: "ing" }
  }
]
```

---

## Your Existing Architecture Already Supports This!

### Your `BankingProvider` Interface

Your existing `base-provider.ts` already defines the standardized format:

```typescript
export interface ProviderAccount {
  externalAccountId: string;  // ✅ Standardized
  accountName: string;         // ✅ Standardized
  accountNumber?: string;       // ✅ Standardized
  accountType: string;          // ✅ Standardized
  currency: string;             // ✅ Standardized
  balance: number;              // ✅ Standardized
  iban?: string;                // ✅ Standardized
  status: 'active' | 'inactive' | 'closed'; // ✅ Standardized
}

export interface ProviderTransaction {
  externalTransactionId: string; // ✅ Standardized
  accountId: string;             // ✅ Standardized
  date: Date;                    // ✅ Standardized
  amount: number;                 // ✅ Standardized
  currency: string;               // ✅ Standardized
  description: string;            // ✅ Standardized
  type: 'credit' | 'debit';      // ✅ Standardized
  counterpartyName?: string;     // ✅ Standardized
  counterpartyAccount?: string;  // ✅ Standardized
}
```

### Implementation Example

```typescript
// lib/banking-providers/tink-provider.ts
export class TinkProvider extends BankingProvider {
  
  async fetchAccounts(credentials: ConnectionCredentials): Promise<ProviderAccount[]> {
    // Tink API call - returns standardized format
    const tinkAccounts = await this.tinkApi.getAccounts(credentials.tokens.accessToken);
    
    // Map Tink's standardized format to your standardized format
    return tinkAccounts.map(account => ({
      externalAccountId: account.id,
      accountName: account.name,
      accountNumber: account.accountNumber,
      accountType: this.mapAccountType(account.type),
      currency: account.currency,
      balance: account.balance.amount,
      iban: account.iban,
      status: account.status,
      metadata: {
        bank: account.institution.name, // "Bunq" or "ING"
        bankId: account.institution.id
      }
    }));
  }
  
  async fetchTransactions(
    credentials: ConnectionCredentials,
    accountId: string,
    options?: { startDate?: Date; endDate?: Date }
  ): Promise<ProviderTransaction[]> {
    // Tink API call - returns standardized format
    const tinkTransactions = await this.tinkApi.getTransactions(
      credentials.tokens.accessToken,
      accountId,
      options
    );
    
    // Map Tink's standardized format to your standardized format
    return tinkTransactions.map(txn => ({
      externalTransactionId: txn.id,
      accountId: accountId,
      date: new Date(txn.date),
      amount: txn.amount.value,
      currency: txn.amount.currency,
      description: txn.description,
      type: txn.amount.value >= 0 ? 'credit' : 'debit',
      counterpartyName: txn.counterparty?.name,
      counterpartyAccount: txn.counterparty?.accountNumber,
      reference: txn.reference,
      category: txn.category,
      metadata: {
        bank: txn.account.institution.name // "Bunq" or "ING"
      }
    }));
  }
}
```

---

## Real-World Example: Multi-Bank Client

### Client Setup
- **Company:** Acme Corp
- **Banks:** Bunq (Business), ING (Savings), Rabobank (Payroll)

### With Aggregation Service

**1. User Connects All Banks (One Provider)**
```
User → Tink → Connect Bunq ✅
User → Tink → Connect ING ✅
User → Tink → Connect Rabobank ✅
```

**2. Your Code (Same for All Banks)**
```typescript
// One provider handles all banks
const provider = getProvider('tink');
const accounts = await provider.fetchAccounts(credentials);
const transactions = await provider.fetchTransactions(credentials, accountId);

// All accounts/transactions in same format, regardless of bank
```

**3. Database (Standardized)**
```sql
-- All accounts stored the same way
SELECT * FROM accounts WHERE tenant_id = 'acme-corp';
-- Returns: Bunq account, ING account, Rabobank account
-- All with same structure!

-- All transactions stored the same way
SELECT * FROM transactions WHERE tenant_id = 'acme-corp';
-- Returns: Transactions from Bunq, ING, Rabobank
-- All with same structure!
```

---

## Benefits

### ✅ Standardized Data Format
- Same structure for Bunq, ING, Rabobank, etc.
- No custom parsing per bank
- Consistent field names and types

### ✅ Single Implementation
- One `TinkProvider` class handles ALL banks
- No need to build BunqProvider, INGProvider, RabobankProvider separately
- Much less code to maintain

### ✅ Unified User Experience
- Users see all accounts in one place
- Same UI for all banks
- Consistent transaction format

### ✅ Easier Analytics
- Aggregate balances across all banks
- Cross-bank transaction analysis
- Unified reporting

---

## Comparison: Direct Integration vs Aggregation Service

### Direct Integration (Current Approach)
```typescript
// Need separate implementations
class BunqProvider {
  // Custom Bunq API parsing
  // Bunq-specific error handling
  // Bunq-specific data format
}

class INGProvider {
  // Custom ING API parsing
  // ING-specific error handling
  // ING-specific data format
}

class RabobankProvider {
  // Custom Rabobank API parsing
  // Rabobank-specific error handling
  // Rabobank-specific data format
}
```

**Problems:**
- 3 different implementations
- 3 different data formats
- 3x maintenance burden
- Hard to aggregate data

### Aggregation Service (Recommended)
```typescript
// One implementation handles all banks
class TinkProvider {
  // Standardized API
  // Standardized error handling
  // Standardized data format
  // Works for Bunq, ING, Rabobank, and 3,000+ other banks!
}
```

**Benefits:**
- 1 implementation
- 1 standardized format
- 1x maintenance burden
- Easy to aggregate data

---

## Answer: YES, It Works Perfectly!

**Question:** Can I handle a client with Bunq and ING accounts?

**Answer:** ✅ **YES!** With an aggregation service:

1. **User connects both banks** through the same provider (Tink/Nordigen)
2. **You get standardized data** from both banks in the same format
3. **One implementation** handles both (and thousands more banks)
4. **Unified storage** - all accounts/transactions stored the same way
5. **Easy aggregation** - sum balances, analyze transactions across banks

**Your existing `BankingProvider` interface already supports this!** You just need to implement one provider (Tink/Nordigen) instead of building separate integrations for each bank.

---

## Next Steps

1. **Choose Provider:** Tink (best for Europe) or Nordigen (free tier)
2. **Implement Provider:** Create `TinkProvider` class (1-2 days)
3. **Test:** Connect Bunq + ING accounts
4. **Deploy:** Users can now connect any supported bank!

**Result:** One implementation → Support for 2,000-3,500+ banks! 🎉

