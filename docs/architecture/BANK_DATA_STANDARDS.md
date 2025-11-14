# Bank Data Standards: Transactions vs Statements

## Overview

This document defines the two primary types of bank data integrations and their industry-standard fields.

---

## 1. Transactions Data

**Purpose:** Detailed line-item transactions showing money movement in/out of accounts.

### Industry Standard Formats

#### BAI2 (Bank Administration Institute)
- Most common format in North America for corporate banking
- Fixed-width or delimited format
- Used for same-day and prior-day transaction reporting

#### MT940 (SWIFT)
- International standard for bank statement messages
- Used globally, especially in Europe
- Structured text format

#### ISO 20022 (camt.053)
- Modern XML-based standard
- Becoming the global standard
- Rich structured data

#### CSV/Excel
- Common for smaller businesses
- Format varies by bank
- Easy to parse but inconsistent

---

### Standard Transaction Fields

#### Core Fields (Essential)
| Field | Description | Example | Notes |
|-------|-------------|---------|-------|
| `transaction_id` | Unique transaction identifier | "TXN-2024-001234" | Bank-assigned or generated |
| `account_id` | Account identifier | "CHK-1001234567" | Links to account |
| `transaction_date` | Date transaction occurred | "2024-01-15" | Posting date |
| `value_date` | Date funds are available | "2024-01-15" | May differ from transaction date |
| `amount` | Transaction amount | -150.00 | Negative = debit, Positive = credit |
| `currency` | Transaction currency | "USD" | ISO 4217 code |
| `description` | Transaction description | "PAYROLL DEPOSIT" | Free-text |
| `transaction_type` | Type of transaction | "ACH", "WIRE", "CHECK" | Standardized codes |

#### Extended Fields (Common)
| Field | Description | Example | Notes |
|-------|-------------|---------|-------|
| `running_balance` | Account balance after transaction | 5,250.00 | Not always provided |
| `reference_number` | Bank reference/trace number | "REF-123456789" | For reconciliation |
| `check_number` | Check number (if applicable) | "1234" | For check transactions |
| `counterparty_name` | Other party in transaction | "ACME Corporation" | Sender/recipient |
| `counterparty_account` | Other party's account | "1234567890" | If available |
| `bank_reference` | Bank's internal reference | "FT24015-001" | For inquiries |
| `transaction_code` | BAI2/SWIFT code | "108" (Credit) | Format-specific |
| `memo` | Additional memo field | "Invoice #12345" | Optional notes |

#### Enhanced Fields (Advanced)
| Field | Description | Example | Notes |
|-------|-------------|---------|-------|
| `category` | Transaction category | "Payroll", "Utilities" | For reporting |
| `sub_category` | Sub-category | "Employee Salaries" | Finer classification |
| `merchant_name` | Merchant name (card transactions) | "Starbucks #1234" | From card networks |
| `merchant_category_code` | MCC code | "5812" (Restaurants) | ISO 18245 |
| `location` | Transaction location | "New York, NY" | Geographic data |
| `original_amount` | Amount in original currency | 100.00 EUR | For FX transactions |
| `exchange_rate` | FX rate applied | 1.0850 | USD per EUR |
| `fee_amount` | Associated fees | 2.50 | Transaction fees |
| `tax_amount` | Tax portion | 15.00 | Sales tax, VAT |

#### Metadata Fields
| Field | Description | Example | Notes |
|-------|-------------|---------|-------|
| `source` | Data source | "BAI2", "CSV", "API" | Where data came from |
| `import_id` | Import batch ID | "IMP-2024-001" | Links to import job |
| `created_at` | Record creation timestamp | "2024-01-15T10:30:00Z" | System timestamp |
| `updated_at` | Last update timestamp | "2024-01-15T10:30:00Z" | For auditing |
| `raw_data` | Original raw data | {...} | JSON blob for debugging |
| `reconciliation_status` | Reconciliation state | "matched", "pending" | For reconciliation |

---

### Transaction Types (Standard Codes)

#### Common Transaction Types
- **ACH** - Automated Clearing House (electronic transfers)
- **WIRE** - Wire transfer (domestic or international)
- **CHECK** - Paper check
- **DEBIT_CARD** - Debit card purchase
- **CREDIT_CARD** - Credit card payment
- **ATM** - ATM withdrawal/deposit
- **TRANSFER** - Internal transfer between accounts
- **FEE** - Bank fee
- **INTEREST** - Interest payment/charge
- **DIVIDEND** - Dividend payment
- **LOAN_PAYMENT** - Loan payment
- **DEPOSIT** - Cash/check deposit
- **WITHDRAWAL** - Cash withdrawal

#### BAI2 Transaction Codes (Examples)
- **108** - Credit (generic)
- **409** - Debit (generic)
- **165** - Wire transfer credit
- **475** - Wire transfer debit
- **195** - ACH credit
- **495** - ACH debit
- **110** - Book transfer credit
- **410** - Book transfer debit

---

## 2. Statements Data (Balance Reporting)

**Purpose:** Periodic summary of account balances (daily, intraday, or period-end).

### Industry Standard Formats

#### BAI2 Balance Reporting
- Daily opening/closing balances
- Intraday positions
- Available funds information

#### MT942 (SWIFT Interim Statement)
- Intraday transaction reporting
- Running balance updates

#### CAMT.052 (ISO 20022 Account Report)
- Intraday account reporting
- Balance snapshots

---

### Standard Statement Fields

#### Core Balance Fields
| Field | Description | Example | Notes |
|-------|-------------|---------|-------|
| `statement_id` | Unique statement identifier | "STMT-2024-01-15-001" | Bank-assigned |
| `account_id` | Account identifier | "CHK-1001234567" | Links to account |
| `statement_date` | Statement date | "2024-01-15" | Date of statement |
| `statement_period_start` | Period start date | "2024-01-01" | For periodic statements |
| `statement_period_end` | Period end date | "2024-01-31" | For periodic statements |
| `opening_balance` | Balance at start of period | 10,000.00 | Beginning balance |
| `closing_balance` | Balance at end of period | 12,500.00 | Ending balance |
| `currency` | Account currency | "USD" | ISO 4217 code |

#### Extended Balance Fields
| Field | Description | Example | Notes |
|-------|-------------|---------|-------|
| `available_balance` | Available funds | 12,000.00 | Excluding holds/pending |
| `current_balance` | Current ledger balance | 12,500.00 | Including pending |
| `collected_balance` | Collected funds | 11,800.00 | Funds available for withdrawal |
| `float_balance` | Uncollected funds | 700.00 | Deposits not yet cleared |
| `pending_deposits` | Deposits pending | 500.00 | Not yet posted |
| `pending_withdrawals` | Withdrawals pending | 300.00 | Not yet posted |
| `holds_amount` | Total holds on account | 500.00 | Funds on hold |
| `overdraft_limit` | Overdraft protection limit | 1,000.00 | If applicable |
| `minimum_balance` | Required minimum balance | 500.00 | To avoid fees |

#### Summary Fields
| Field | Description | Example | Notes |
|-------|-------------|---------|-------|
| `total_credits` | Total credits for period | 5,000.00 | Sum of all credits |
| `total_debits` | Total debits for period | 2,500.00 | Sum of all debits |
| `credit_count` | Number of credit transactions | 15 | Transaction count |
| `debit_count` | Number of debit transactions | 28 | Transaction count |
| `net_change` | Net change for period | 2,500.00 | credits - debits |
| `average_balance` | Average daily balance | 11,250.00 | For interest calculation |
| `interest_earned` | Interest earned | 12.50 | For interest-bearing accounts |
| `fees_charged` | Total fees for period | 15.00 | Service charges |

#### Intraday Balance Fields (Advanced)
| Field | Description | Example | Notes |
|-------|-------------|---------|-------|
| `snapshot_time` | Time of balance snapshot | "14:30:00" | For intraday reporting |
| `opening_ledger_balance` | Morning opening balance | 10,000.00 | Start of day |
| `current_ledger_balance` | Current ledger position | 12,300.00 | Real-time |
| `target_balance` | Target balance (cash mgmt) | 10,000.00 | For sweep accounts |
| `one_day_float` | One-day float amount | 200.00 | Funds clearing tomorrow |
| `two_day_float` | Two-day float amount | 150.00 | Funds clearing in 2 days |

---

## 3. Data Model Comparison

### When to Use Each Type

| Use Case | Transactions | Statements |
|----------|-------------|-----------|
| **Reconciliation** | ✅ Primary use | ⚪ Summary only |
| **Cash Positioning** | ⚪ Too detailed | ✅ Perfect fit |
| **Forecasting** | ✅ Transaction patterns | ✅ Balance trends |
| **Audit Trail** | ✅ Complete history | ⚪ Summary only |
| **Real-time Updates** | ⚪ Slower | ✅ Faster |
| **Historical Analysis** | ✅ Detailed | ⚪ Less granular |
| **API Performance** | ⚪ Large datasets | ✅ Lightweight |

### Integration Frequency

**Transactions:**
- Full history: Once (initial load)
- Incremental: Daily or real-time
- Volume: Hundreds to thousands per day

**Statements:**
- Daily: Once per day (morning)
- Intraday: Multiple times per day
- End-of-day: After all transactions settle
- Volume: 1-10 records per day per account

---

## 4. Recommended Database Schema

### Transactions Table
```sql
CREATE TABLE transactions (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign Keys
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  connection_id UUID REFERENCES connections(id),
  
  -- Core Transaction Fields
  transaction_date DATE NOT NULL,
  value_date DATE,
  amount DECIMAL(19, 4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  description TEXT,
  transaction_type VARCHAR(50),
  
  -- Extended Fields
  running_balance DECIMAL(19, 4),
  reference_number VARCHAR(100),
  check_number VARCHAR(20),
  counterparty_name VARCHAR(255),
  counterparty_account VARCHAR(100),
  bank_reference VARCHAR(100),
  transaction_code VARCHAR(10),
  memo TEXT,
  
  -- Enhanced Fields
  category VARCHAR(100),
  sub_category VARCHAR(100),
  merchant_name VARCHAR(255),
  merchant_category_code VARCHAR(4),
  location VARCHAR(255),
  original_amount DECIMAL(19, 4),
  original_currency VARCHAR(3),
  exchange_rate DECIMAL(19, 8),
  fee_amount DECIMAL(19, 4),
  tax_amount DECIMAL(19, 4),
  
  -- Metadata
  source VARCHAR(50),
  import_id UUID,
  raw_data JSONB,
  reconciliation_status VARCHAR(20) DEFAULT 'pending',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT transactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- Indexes for performance
CREATE INDEX idx_transactions_tenant_account ON transactions(tenant_id, account_id);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_reference ON transactions(reference_number);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
```

### Statements Table
```sql
CREATE TABLE statements (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign Keys
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  connection_id UUID REFERENCES connections(id),
  
  -- Core Statement Fields
  statement_id VARCHAR(100),
  statement_date DATE NOT NULL,
  statement_period_start DATE,
  statement_period_end DATE,
  statement_type VARCHAR(20) NOT NULL, -- 'daily', 'intraday', 'monthly', 'closing'
  
  -- Balance Fields
  opening_balance DECIMAL(19, 4) NOT NULL,
  closing_balance DECIMAL(19, 4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  
  -- Extended Balance Fields
  available_balance DECIMAL(19, 4),
  current_balance DECIMAL(19, 4),
  collected_balance DECIMAL(19, 4),
  float_balance DECIMAL(19, 4),
  pending_deposits DECIMAL(19, 4),
  pending_withdrawals DECIMAL(19, 4),
  holds_amount DECIMAL(19, 4),
  overdraft_limit DECIMAL(19, 4),
  minimum_balance DECIMAL(19, 4),
  
  -- Summary Fields
  total_credits DECIMAL(19, 4),
  total_debits DECIMAL(19, 4),
  credit_count INTEGER,
  debit_count INTEGER,
  net_change DECIMAL(19, 4),
  average_balance DECIMAL(19, 4),
  interest_earned DECIMAL(19, 4),
  fees_charged DECIMAL(19, 4),
  
  -- Intraday Fields
  snapshot_time TIME,
  target_balance DECIMAL(19, 4),
  one_day_float DECIMAL(19, 4),
  two_day_float DECIMAL(19, 4),
  
  -- Metadata
  source VARCHAR(50),
  import_id UUID,
  raw_data JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT statements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT statements_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT statements_unique_date UNIQUE (tenant_id, account_id, statement_date, statement_type, snapshot_time)
);

-- Indexes for performance
CREATE INDEX idx_statements_tenant_account ON statements(tenant_id, account_id);
CREATE INDEX idx_statements_date ON statements(statement_date);
CREATE INDEX idx_statements_type ON statements(statement_type);
```

---

## 5. Implementation Recommendations

### Phase 1: MVP (Current)
- ✅ Transactions from CSV
- ⚪ Statements (not yet implemented)
- ✅ Basic reconciliation

### Phase 2: Enhanced Transactions
- ⬜ Add extended fields (counterparty, reference numbers)
- ⬜ Transaction categorization
- ⬜ Multiple transaction types (ACH, WIRE, etc.)
- ⬜ BAI2 format parser

### Phase 3: Statements Implementation
- ⬜ Daily balance statements
- ⬜ Intraday balance updates
- ⬜ Balance trending and analytics
- ⬜ Cash position dashboard

### Phase 4: Advanced Features
- ⬜ Real-time balance webhooks
- ⬜ Automated reconciliation
- ⬜ Forecasting based on balance trends
- ⬜ Multi-day float tracking

---

## 6. API Integration Examples

### Plaid
**Transactions:** `/transactions/get` endpoint
- Returns detailed transaction history
- Includes merchant data, categories
- Real-time updates available

**Statements:** `/accounts/balance/get` endpoint
- Current and available balances
- Does not provide historical daily balances

### Bank APIs (Direct)
**Transactions:** Varies by bank
- BAI2 file delivery (SFTP)
- REST API endpoints
- Webhook notifications

**Statements:** Varies by bank
- Morning balance reports
- Intraday position updates
- End-of-day closing balances

---

## 7. Key Takeaways

### Transactions
- **Detail-oriented:** Every money movement
- **High volume:** Thousands of records
- **Use for:** Reconciliation, detailed analysis, audit
- **Frequency:** Daily or real-time

### Statements
- **Summary-oriented:** Daily snapshots
- **Low volume:** One record per day per account
- **Use for:** Cash positioning, forecasting, dashboards
- **Frequency:** Daily or intraday

### Both Together
- Transactions provide the "why"
- Statements provide the "what"
- Complementary data sources
- Validate against each other for accuracy

---

**Last Updated:** 2024-11-14
**Version:** 1.0

