# CSV Import Templates

This directory contains CSV templates for bulk importing data into Stratiri.

## Available Templates

### 1. Entities Template (`entities-template.csv`)

Import legal entities, subsidiaries, and organizational structures.

**Required Fields:**
- `entity_name` - Name of the entity
- `type` - Entity type: `Corporation`, `LLC`, `Partnership`, `Sole Proprietorship`, `Trust`, `Non-Profit`, `Other`
- `jurisdiction` - Legal jurisdiction (e.g., Delaware, UK, Singapore)
- `status` - Entity status: `Active`, `Inactive`, `Dissolved`

**Optional Fields:**
- `tax_id` - Tax ID / EIN
- `contact_email` - Contact email address
- `phone` - Phone number
- `address` - Physical address
- `website` - Company website URL
- `description` - Brief description

---

### 2. Accounts Template (`accounts-template.csv`)

Import bank accounts, credit lines, and financial accounts.

**Required Fields:**
- `account_name` - Name of the account
- `account_type` - Account type code (see list below)
- `currency` - ISO currency code (USD, EUR, GBP, etc.)
- `status` - Account status: `active`, `inactive`, `closed`

**Optional Fields:**
- `bank_name` - Name of the financial institution
- `account_number` - Account number
- `entity_name` - Name of the entity this account belongs to (must match existing entity)
- `balance` - Current balance (number only, no currency symbols)
- `iban` - International Bank Account Number
- `bic` - Bank Identifier Code (SWIFT)
- `description` - Account description

**Valid Account Types:**
- `checking` - Checking Account
- `savings` - Savings Account
- `money_market` - Money Market Account
- `certificate_deposit` - Certificate of Deposit
- `credit_card` - Credit Card
- `line_of_credit` - Line of Credit
- `loan` - Loan Account
- `mortgage` - Mortgage
- `investment_brokerage` - Investment Brokerage
- `retirement_401k` - 401(k) Retirement
- `retirement_ira` - IRA Retirement
- `pension` - Pension Account
- `trust` - Trust Account
- `escrow` - Escrow Account
- `merchant` - Merchant Account
- `payroll` - Payroll Account
- `treasury` - Treasury Account
- `foreign_exchange` - Foreign Exchange Account
- `crypto_wallet` - Cryptocurrency Wallet
- `other` - Other

---

## How to Use

1. **Download the template** for the data type you want to import
2. **Open in Excel or Google Sheets**
3. **Replace example data** with your actual data
4. **Keep the header row** exactly as shown
5. **Save as CSV** (UTF-8 encoding recommended)
6. **Upload** through the Stratiri import interface

---

## CSV Format Requirements

- **Encoding:** UTF-8
- **Delimiter:** Comma (,)
- **Text Qualifier:** Double quotes (") for fields containing commas
- **Date Format:** YYYY-MM-DD (if applicable)
- **Numbers:** No currency symbols or thousand separators
- **Line Breaks:** Use quotes around fields with line breaks

---

## Tips for Success

✅ **DO:**
- Keep the header row exactly as shown
- Use consistent formatting
- Test with a small file first
- Check for duplicate entity names
- Ensure entity names match exactly when linking accounts

❌ **DON'T:**
- Add or remove columns
- Use special characters in entity names (except hyphens and underscores)
- Include currency symbols in balance fields
- Mix currencies within the same account

---

## Example Workflow

### Importing Entities and Accounts Together:

1. **Import Entities First**
   - Upload `entities-template.csv` with your entities
   - Verify all entities are created successfully

2. **Then Import Accounts**
   - Upload `accounts-template.csv` with accounts
   - Use exact entity names from step 1 in the `entity_name` column
   - Accounts will be automatically linked to entities

---

## Support

For issues or questions about CSV imports, contact your administrator or refer to the Stratiri documentation.

