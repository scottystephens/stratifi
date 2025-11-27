# Core Dimension Tables Implementation Summary

**Date:** November 16, 2025  
**Migration:** 24-create-dimension-tables.sql  
**Status:** ✅ Successfully deployed to production

---

## 📊 **Overview**

Created 6 core dimension tables to support multi-currency operations, global financial management, and standardized financial data across the Stratiri platform.

---

## 🗄️ **Dimension Tables Created**

### **1. Currencies** (`public.currencies`)

**Purpose:** Master list of global currencies with formatting rules

**Schema:**
- `currency_code` (VARCHAR(3), PK) - ISO 4217 code (USD, EUR, GBP)
- `currency_name` (TEXT) - Full currency name
- `currency_symbol` (TEXT) - Display symbol ($, €, £)
- `decimal_places` (SMALLINT) - Number of decimal places (usually 2, JPY is 0)
- `is_active` (BOOLEAN) - Active/inactive status
- `display_format` (TEXT) - Format template for display
- `region` (TEXT) - Primary region (Americas, Europe, Asia, etc.)
- `is_crypto` (BOOLEAN) - Cryptocurrency flag
- `notes` (TEXT)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Pre-loaded Data:** 20 major global currencies
- Americas: USD, CAD, BRL, MXN
- Europe: EUR, GBP, CHF, SEK, NOK, DKK
- Asia: JPY, CNY, INR, SGD, HKD, KRW, THB
- Oceania: AUD, NZD
- Africa: ZAR

**Indexes:**
- `idx_currencies_active` (is_active)
- `idx_currencies_region` (region)

---

### **2. Countries** (`public.countries`)

**Purpose:** Country/jurisdiction reference with regulatory metadata

**Schema:**
- `country_code` (VARCHAR(2), PK) - ISO 3166-1 alpha-2
- `country_code_3` (VARCHAR(3)) - ISO 3166-1 alpha-3
- `country_name` (TEXT) - Full country name
- `region` (TEXT) - Europe, Americas, Asia, Africa, Oceania
- `subregion` (TEXT) - Western Europe, North America, etc.
- `currency_code` (VARCHAR(3), FK) - Default currency
- `phone_code` (TEXT) - International dialing code
- `capital` (TEXT)
- `languages` (TEXT[]) - Array of language codes
- `is_eu_member` (BOOLEAN) - EU membership flag
- `is_tax_haven` (BOOLEAN) - Tax haven classification
- `regulatory_framework` (TEXT) - e.g., 'GDPR', 'SOX', 'MiFID II'
- `is_active` (BOOLEAN)
- `notes` (TEXT)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Pre-loaded Data:** 30 major countries including:
- US, Canada, UK, major EU countries
- Switzerland, Singapore, Hong Kong
- APAC, LATAM, and African markets

**Indexes:**
- `idx_countries_region` (region)
- `idx_countries_currency` (currency_code)
- `idx_countries_eu` (is_eu_member)
- `idx_countries_active` (is_active)

---

### **3. Account Types** (`public.account_types`)

**Purpose:** Standardized account type classification

**Schema:**
- `type_code` (VARCHAR(50), PK) - Unique code
- `type_name` (TEXT) - Display name
- `category` (TEXT) - 'Asset', 'Liability', 'Operating', 'Investment'
- `sub_category` (TEXT) - More specific classification
- `description` (TEXT)
- `is_cash_account` (BOOLEAN)
- `is_interest_bearing` (BOOLEAN)
- `typical_currency_types` (TEXT[]) - fiat, crypto, commodity
- `reporting_group` (TEXT) - For financial reporting
- `display_order` (INTEGER) - Sort order in UI
- `is_active` (BOOLEAN)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Pre-loaded Data:** 20 account types including:
- **Assets:** checking, savings, money_market, certificate_deposit, investment_brokerage, retirement accounts, treasury, forex, crypto_wallet
- **Liabilities:** credit_card, line_of_credit, loan, mortgage
- **Specialized:** trust, escrow, merchant, payroll

**Indexes:**
- `idx_account_types_category` (category)
- `idx_account_types_cash` (is_cash_account)
- `idx_account_types_active` (is_active)

---

### **4. Transaction Categories** (`public.transaction_categories`)

**Purpose:** Hierarchical transaction categorization for financial reporting

**Schema:**
- `category_code` (VARCHAR(50), PK)
- `category_name` (TEXT)
- `parent_category` (VARCHAR(50), FK) - Hierarchical structure
- `category_type` (TEXT) - 'Income', 'Expense', 'Transfer', 'Investment'
- `description` (TEXT)
- `is_tax_deductible` (BOOLEAN)
- `gl_account_mapping` (TEXT) - For GL integration
- `display_order` (INTEGER)
- `icon_name` (TEXT) - For UI
- `color_code` (TEXT) - Hex color for visualizations
- `is_active` (BOOLEAN)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Pre-loaded Data:** 30+ categories in 4 top-level groups:
1. **Income:** salary, business, investment, rental
2. **Expenses:** payroll, rent, utilities, insurance, marketing, travel, professional services, technology, taxes
3. **Transfers:** internal, external, loan payments
4. **Investments:** purchase, sale, dividends

**Indexes:**
- `idx_transaction_categories_type` (category_type)
- `idx_transaction_categories_parent` (parent_category)
- `idx_transaction_categories_active` (is_active)

---

### **5. Payment Methods** (`public.payment_methods`)

**Purpose:** Payment and transfer method reference

**Schema:**
- `method_code` (VARCHAR(50), PK)
- `method_name` (TEXT)
- `method_type` (TEXT) - 'Electronic', 'Paper', 'Cash', 'Crypto'
- `description` (TEXT)
- `processing_time_days` (INTEGER) - Typical processing time
- `is_reversible` (BOOLEAN)
- `requires_clearing` (BOOLEAN) - ACH, checks require clearing
- `typical_cost_percentage` (DECIMAL(5,2))
- `supported_currencies` (TEXT[])
- `provider_names` (TEXT[])
- `display_order` (INTEGER)
- `is_active` (BOOLEAN)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Pre-loaded Data:** 16 payment methods including:
- **Electronic:** wire, ACH, SEPA, SWIFT, debit card, credit card, direct debit, faster payments, instant payment
- **Digital:** PayPal, Stripe
- **Traditional:** check, cash
- **Crypto:** cryptocurrency

**Indexes:**
- `idx_payment_methods_type` (method_type)
- `idx_payment_methods_active` (is_active)

---

### **6. Financial Institutions** (`public.financial_institutions`)

**Purpose:** Bank and financial institution directory

**Schema:**
- `institution_id` (TEXT, PK) - SWIFT BIC or unique ID
- `institution_name` (TEXT) - Full legal name
- `short_name` (TEXT) - Shortened display name
- `institution_type` (TEXT) - 'Bank', 'Credit Union', 'Investment Firm', 'Fintech'
- `country_code` (VARCHAR(2), FK) - Foreign key to countries
- `swift_code` (TEXT) - SWIFT/BIC code
- `routing_numbers` (TEXT[]) - For US banks (ABA routing)
- `sort_codes` (TEXT[]) - For UK banks
- `website` (TEXT)
- `logo_url` (TEXT)
- `is_active` (BOOLEAN)
- `notes` (TEXT)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Pre-loaded Data:** 14 major institutions including:
- **US Banks:** Chase, Bank of America, Wells Fargo, Citibank
- **European Banks:** HSBC, Barclays, Deutsche Bank, BNP Paribas
- **Dutch Banks:** ING, Rabobank
- **Swiss Banks:** UBS, Credit Suisse
- **Fintechs:** Tink, bunq

**Indexes:**
- `idx_financial_institutions_country` (country_code)
- `idx_financial_institutions_type` (institution_type)
- `idx_financial_institutions_active` (is_active)

---

## 🔧 **Technical Features**

### **Automatic Timestamp Updates**
All tables include `updated_at` triggers that automatically update the timestamp on every modification.

### **Foreign Key Relationships**
- `countries.currency_code` → `currencies.currency_code`
- `financial_institutions.country_code` → `countries.country_code`
- `transaction_categories.parent_category` → `transaction_categories.category_code` (hierarchical)

### **Flexible Data Types**
- **TEXT**: Used for all string fields (no length restrictions per project standards)
- **TEXT[]**: Array types for multi-value fields (routing_numbers, languages, etc.)
- **BOOLEAN**: Clear active/inactive flags
- **TIMESTAMPTZ**: Timezone-aware timestamps

### **Table Comments**
All tables include PostgreSQL comments for documentation:
```sql
COMMENT ON TABLE public.currencies IS 'Dimension table for currency codes and metadata';
```

---

## 📈 **Use Cases**

### **1. Multi-Currency Operations**
```sql
-- Get currency formatting for account balances
SELECT c.currency_symbol, c.decimal_places 
FROM currencies c 
WHERE c.currency_code = 'EUR';

-- List all active currencies by region
SELECT * FROM currencies 
WHERE is_active = true 
ORDER BY region, currency_code;
```

### **2. Entity Jurisdiction Validation**
```sql
-- Validate entity jurisdiction against countries
SELECT e.*, c.regulatory_framework, c.is_eu_member
FROM entities e
JOIN countries c ON e.jurisdiction = c.country_code
WHERE c.is_active = true;
```

### **3. Account Type Classification**
```sql
-- Get all cash accounts for cash flow analysis
SELECT * FROM accounts a
JOIN account_types at ON a.account_type = at.type_code
WHERE at.is_cash_account = true;
```

### **4. Transaction Categorization**
```sql
-- Get category hierarchy for expense reporting
SELECT 
  parent.category_name as parent_category,
  child.category_name as sub_category,
  child.is_tax_deductible
FROM transaction_categories child
LEFT JOIN transaction_categories parent ON child.parent_category = parent.category_code
WHERE child.category_type = 'Expense'
ORDER BY parent.display_order, child.display_order;
```

### **5. Bank Information Lookup**
```sql
-- Find banks by country with SWIFT codes
SELECT fi.*, c.country_name
FROM financial_institutions fi
JOIN countries c ON fi.country_code = c.country_code
WHERE c.country_code = 'US' AND fi.swift_code IS NOT NULL;
```

---

## 🚀 **Future Enhancements**

### **Potential Additions:**
1. **Time Dimension:** Date hierarchies, fiscal periods, business day calendar
2. **Industry Codes:** NAICS/SIC codes for entity classification
3. **Currency Pairs:** For FX rate lookups
4. **Bank Branches:** Individual branch locations
5. **Regulatory Compliance:** Detailed compliance requirements by jurisdiction
6. **Tax Rates:** VAT/GST rates by country/region
7. **Holiday Calendar:** Bank holidays by country

### **Integration Opportunities:**
- Link `accounts.bank_name` to `financial_institutions.institution_name`
- Link `accounts.account_type` to `account_types.type_code`
- Link `transactions.category` to `transaction_categories.category_code`
- Link `entities.jurisdiction` to `countries.country_code`
- Link exchange_rates to `currencies` table

---

## ✅ **Deployment Status**

- **Migration File:** `scripts/migrations/24-create-dimension-tables.sql`
- **Executed:** ✅ November 16, 2025
- **Statements:** 28 successful (33 total, 5 comments skipped)
- **Deployed to Production:** ✅ https://stratiri-pi.vercel.app

---

## 📚 **Data Maintenance**

### **Adding New Records**
```sql
-- Add a new currency
INSERT INTO currencies (currency_code, currency_name, currency_symbol, decimal_places, region)
VALUES ('PLN', 'Polish Zloty', 'zł', 2, 'Europe')
ON CONFLICT (currency_code) DO NOTHING;

-- Add a new bank
INSERT INTO financial_institutions (institution_id, institution_name, institution_type, country_code, swift_code)
VALUES ('fnb_za', 'First National Bank', 'Bank', 'ZA', 'FIRNZAJJ')
ON CONFLICT (institution_id) DO NOTHING;
```

### **Updating Records**
```sql
-- Deactivate an institution
UPDATE financial_institutions 
SET is_active = false, notes = 'Merged with XYZ Bank'
WHERE institution_id = 'credit_suisse';

-- Add routing numbers
UPDATE financial_institutions
SET routing_numbers = ARRAY['021000021', '026009593']
WHERE institution_id = 'chase';
```

---

## 🎯 **Benefits**

1. **Data Standardization:** Consistent reference data across the platform
2. **Referential Integrity:** Foreign keys ensure data quality
3. **UI Enhancement:** Dropdown lists, autocomplete, validation
4. **Reporting:** Standardized categories for financial reports
5. **Compliance:** Regulatory framework tracking by jurisdiction
6. **Scalability:** Easy to add new currencies, countries, institutions
7. **Multi-tenancy:** Shared dimension tables reduce data duplication

---

**Next Steps:**
- ✅ Integrate dimension tables into existing forms (account creation, entity creation)
- ✅ Add foreign key constraints to existing tables where applicable
- ✅ Build UI components for dimension table management
- ✅ Create analytics views leveraging these dimensions

