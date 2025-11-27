# Stratiri Testing Audit & Prioritized Roadmap

**Date:** November 23, 2025  
**Purpose:** Comprehensive audit of what needs testing before client onboarding  
**Approach:** Categorized by priority with specific test cases

---

## 🎯 Testing Philosophy

**Goal:** 80%+ coverage on critical paths before onboarding paying clients  
**Approach:** Test-Driven Development (TDD) - Write tests first, then implement  
**Strategy:** Focus on categories in priority order

---

## Priority Legend
- 🔴 **CRITICAL** - Blocking issues for production (security, data integrity)
- 🟠 **HIGH** - Core product value (banking, transactions)
- 🟡 **MEDIUM** - Important but not blocking (UI, analytics)
- 🟢 **LOW** - Nice to have (edge cases, optimizations)

---

# CATEGORY 1: 🔴 CRITICAL SECURITY & DATA ISOLATION

**Priority:** HIGHEST - MUST PASS before any client onboarding  
**Risk:** Data leaks, security breaches, legal liability  
**Current Coverage:** 10 tests ✅ PASSING (multi-tenant isolation)

## 1.1 Multi-Tenant Isolation (RLS)

### Status: ✅ 10/10 tests passing
**File:** `tests/integration/multi-tenant.test.ts`

### Tests Needed: ✅ COMPLETE
- [x] Account access by tenant_id only
- [x] Transaction access by tenant_id only
- [x] Connection access by tenant_id only
- [x] Entity access by tenant_id only
- [x] User-tenant membership validation
- [x] Data insertion with correct tenant_id
- [x] Prevent cross-tenant access by ID
- [x] Prevent cross-tenant data in queries
- [x] Bulk operations respect tenant boundaries
- [x] Joins maintain tenant isolation

**Estimated:** 0 hours (DONE)

---

## 1.2 Row-Level Security (RLS) Policies

### Status: ⚠️ 0/30 tests written
**File:** `tests/integration/rls-policies.test.ts` (NEW)

### Tests Needed:
#### Core Tables:
- [ ] `accounts` - SELECT/INSERT/UPDATE/DELETE policies
- [ ] `transactions` - SELECT/INSERT/UPDATE/DELETE policies
- [ ] `connections` - SELECT/INSERT/UPDATE/DELETE policies
- [ ] `entities` - SELECT/INSERT/UPDATE/DELETE policies
- [ ] `ingestion_jobs` - SELECT/INSERT/UPDATE policies
- [ ] `user_tenants` - SELECT/INSERT/UPDATE policies

#### Banking Provider Tables:
- [ ] `provider_tokens` - SELECT/INSERT/UPDATE policies
- [ ] `provider_accounts` - SELECT/INSERT policies
- [ ] `provider_transactions` - SELECT/INSERT policies
- [ ] `plaid_accounts` - SELECT/INSERT policies
- [ ] `plaid_transactions` - SELECT/INSERT policies
- [ ] `tink_accounts` - SELECT/INSERT policies
- [ ] `tink_transactions` - SELECT/INSERT policies
- [ ] `banking_provider_credentials` - SELECT/INSERT/UPDATE policies

#### Shared Tables (No RLS):
- [ ] `exchange_rates` - accessible to all (verified no RLS)
- [ ] `direct_bank_provider_docs` - accessible to all

### Test Pattern:
```typescript
describe('RLS Policy: accounts', () => {
  it('should allow SELECT for tenant member', async () => {
    // User in tenant_id=1 queries accounts with tenant_id=1
    // Should return results
  });

  it('should block SELECT for non-member', async () => {
    // User in tenant_id=1 queries accounts with tenant_id=2
    // Should return empty
  });

  it('should allow INSERT with correct tenant_id', async () => {
    // User in tenant_id=1 inserts account with tenant_id=1
    // Should succeed
  });

  it('should block INSERT with wrong tenant_id', async () => {
    // User in tenant_id=1 tries to insert account with tenant_id=2
    // Should fail
  });
});
```

**Estimated:** 8-10 hours (30 tests × 20 min avg)

---

## 1.3 Authentication & Session Management

### Status: ⚠️ 0/20 tests written
**File:** `tests/integration/authentication.test.ts` (NEW)

### Tests Needed:
#### Sign In:
- [ ] Sign in with valid credentials
- [ ] Sign in with invalid email
- [ ] Sign in with invalid password
- [ ] Sign in with non-existent user
- [ ] Session created after successful sign in
- [ ] User redirected to dashboard after sign in

#### Sign Up:
- [ ] Sign up with valid email/password
- [ ] Sign up with duplicate email (should fail)
- [ ] Sign up with weak password (should fail)
- [ ] Sign up creates user record
- [ ] Sign up sends verification email
- [ ] Email verification flow completes

#### Sign Out:
- [ ] Sign out clears session
- [ ] Sign out redirects to login
- [ ] Sign out invalidates tokens

#### Session Persistence:
- [ ] Session persists across page reloads
- [ ] Session expires after timeout
- [ ] Expired session redirects to login
- [ ] Token refresh works automatically
- [ ] Session stored securely (httpOnly cookies)

**Estimated:** 6-8 hours (20 tests × 20-25 min avg)

---

## 1.4 Authorization & Role-Based Access Control

### Status: ⚠️ 0/25 tests written
**File:** `tests/integration/authorization.test.ts` (NEW)

### Tests Needed:
#### Role Hierarchy:
- [ ] Owner has full access
- [ ] Admin can manage but not delete org
- [ ] Editor can modify data
- [ ] Viewer can only read
- [ ] Role hierarchy respected (owner > admin > editor > viewer)

#### Account Operations by Role:
- [ ] Owner can create/edit/delete accounts
- [ ] Admin can create/edit accounts
- [ ] Editor can create/edit accounts
- [ ] Viewer cannot create/edit accounts

#### Connection Operations by Role:
- [ ] Owner/Admin/Editor can create connections
- [ ] Viewer cannot create connections
- [ ] Owner/Admin can delete connections
- [ ] Editor/Viewer cannot delete connections

#### Team Management by Role:
- [ ] Owner can invite/remove members
- [ ] Admin can invite members
- [ ] Editor/Viewer cannot manage team

#### Banking Operations by Role:
- [ ] Owner/Admin/Editor can connect banks
- [ ] Viewer cannot connect banks
- [ ] Owner/Admin/Editor can sync transactions
- [ ] Viewer cannot sync transactions

#### Settings by Role:
- [ ] Owner can change org settings
- [ ] Admin can change some settings
- [ ] Editor/Viewer cannot change settings

**Estimated:** 8-10 hours (25 tests × 20-25 min avg)

---

## 1.5 Credential Encryption & Storage

### Status: ⚠️ 0/15 tests written
**File:** `tests/unit/lib/credential-vault.test.ts` (NEW)

### Tests Needed:
#### Encryption:
- [ ] Encrypt credentials with AES-256-GCM
- [ ] Encrypted data is not plaintext
- [ ] Encrypted data includes IV and tag
- [ ] Same plaintext produces different ciphertext (random IV)
- [ ] Encryption key from environment variable

#### Decryption:
- [ ] Decrypt returns original plaintext
- [ ] Invalid ciphertext throws error
- [ ] Wrong key throws error
- [ ] Corrupted IV/tag throws error

#### Standard Bank Credentials:
- [ ] All 3 subscription keys encrypted
- [ ] Client secret encrypted
- [ ] App ID stored correctly
- [ ] businessUnitId handled (optional)

#### Security:
- [ ] Credentials never logged
- [ ] Credentials never exposed in API responses
- [ ] Only service role can decrypt

**Estimated:** 5-6 hours (15 tests × 20-25 min avg)

---

## CATEGORY 1 SUMMARY

| Sub-Category | Tests | Status | Priority | Est. Hours |
|--------------|-------|--------|----------|------------|
| Multi-tenant isolation | 10 | ✅ COMPLETE | 🔴 | 0 |
| RLS policies | 30 | ⚠️ TODO | 🔴 | 8-10 |
| Authentication | 20 | ⚠️ TODO | 🔴 | 6-8 |
| Authorization | 25 | ⚠️ TODO | 🔴 | 8-10 |
| Credential encryption | 15 | ⚠️ TODO | 🔴 | 5-6 |
| **TOTAL** | **100** | **10% done** | 🔴 | **27-34 hrs** |

**Target:** 100% coverage on all CRITICAL security tests  
**Timeline:** Week 1-2

---

# CATEGORY 2: 🟠 HIGH - BANKING INTEGRATIONS

**Priority:** HIGH - Core product value  
**Risk:** Customers can't connect banks = no value  
**Current Coverage:** 11 tests ✅ PASSING (Standard Bank credentials)

## 2.1 Standard Bank - Credential Collection

### Status: ✅ 11/11 tests passing
**File:** `tests/unit/lib/standard-bank-credentials.test.ts`

### Tests Covered: ✅ COMPLETE
- [x] Multiple subscription keys stored
- [x] Required keys validation
- [x] Optional keys handled
- [x] Correct key selection per endpoint
- [x] Environment selection (sandbox/production)

**Estimated:** 0 hours (DONE)

---

## 2.2 Plaid Integration

### Status: ⚠️ 0/35 tests written
**Files:** 
- `tests/integration/plaid-oauth.test.ts` (NEW)
- `tests/integration/plaid-sync.test.ts` (NEW)

### Tests Needed:
#### OAuth Flow:
- [ ] Create Link token with user ID
- [ ] Link token includes correct configuration
- [ ] Link token valid for 30 minutes
- [ ] Exchange public token for access token
- [ ] Access token stored encrypted
- [ ] Item ID stored with connection

#### Token Management:
- [ ] Access token doesn't expire (Plaid)
- [ ] Token refresh not needed for Plaid
- [ ] Invalid token detected and handled
- [ ] Webhook verification for item updates

#### Account Sync:
- [ ] Fetch accounts from Plaid
- [ ] Store raw Plaid accounts in `plaid_accounts`
- [ ] Create normalized accounts in `accounts`
- [ ] Map Plaid account types correctly
- [ ] Handle account closure (set inactive)
- [ ] Deduplicate accounts by external_account_id
- [ ] Balance updates correctly

#### Transaction Sync (Incremental):
- [ ] Initial sync fetches all transactions
- [ ] Cursor stored after sync
- [ ] Subsequent sync uses cursor (incremental)
- [ ] Handle added transactions
- [ ] Handle modified transactions
- [ ] Handle removed transactions
- [ ] Store raw Plaid transactions in `plaid_transactions`
- [ ] Import to main `transactions` table
- [ ] Deduplicate transactions by external_transaction_id
- [ ] Pagination handles large datasets
- [ ] has_more flag respected

#### Error Handling:
- [ ] Invalid credentials error
- [ ] Item login required error
- [ ] Institution down error
- [ ] Rate limit error (retry with backoff)
- [ ] Network timeout error

**Estimated:** 12-15 hours (35 tests × 20-25 min avg)

---

## 2.3 Tink Integration

### Status: ⚠️ 0/35 tests written
**Files:**
- `tests/integration/tink-oauth.test.ts` (NEW)
- `tests/integration/tink-sync.test.ts` (NEW)

### Tests Needed:
#### OAuth Flow:
- [ ] Generate authorization URL
- [ ] State parameter included for security
- [ ] Exchange code for access token
- [ ] Refresh token stored
- [ ] Access token expires (handle refresh)
- [ ] Token refresh before expiry

#### Token Management:
- [ ] Detect token expiry
- [ ] Refresh token automatically
- [ ] Handle refresh token expiry (re-auth needed)
- [ ] Store tokens encrypted

#### Account Sync:
- [ ] Fetch accounts from Tink
- [ ] Store raw Tink accounts in `tink_accounts`
- [ ] Create normalized accounts in `accounts`
- [ ] Handle IBAN/BIC for European accounts
- [ ] Map Tink account types correctly
- [ ] Balance updates correctly

#### Transaction Sync (Pagination):
- [ ] Initial sync fetches all transactions
- [ ] pageToken stored after sync
- [ ] Subsequent sync uses pageToken
- [ ] Store raw Tink transactions in `tink_transactions`
- [ ] Import to main `transactions` table
- [ ] Deduplicate transactions
- [ ] Handle pending transactions
- [ ] Handle booked transactions
- [ ] Pagination handles large datasets

#### Error Handling:
- [ ] Invalid credentials error
- [ ] Consent expired error (re-auth needed)
- [ ] Institution unavailable error
- [ ] Rate limit error
- [ ] Network timeout error
- [ ] Token expiry during sync (refresh and retry)

**Estimated:** 12-15 hours (35 tests × 20-25 min avg)

---

## 2.4 Standard Bank API Client (Future)

### Status: ⚠️ 0/30 tests written
**File:** `tests/integration/standard-bank-api.test.ts` (NEW)

### Tests Needed:
#### OAuth 2.0 Client Credentials:
- [ ] Exchange App ID + Secret for access token
- [ ] Access token stored with expiry
- [ ] Token refresh before expiry
- [ ] Handle invalid credentials error

#### Balance API:
- [ ] Fetch balances with subscriptionKeyBalances
- [ ] Parse Standard Bank balance response
- [ ] Handle multi-currency accounts
- [ ] Store balances in accounts table

#### Statements/Transactions API:
- [ ] Fetch transactions with subscriptionKeyTransactions
- [ ] Parse Standard Bank transaction response
- [ ] Store in transactions table
- [ ] Deduplicate transactions
- [ ] Handle pagination (if any)

#### Payment API (Optional):
- [ ] Initiate payment with subscriptionKeyPayments
- [ ] Verify payment requires payment key
- [ ] Handle missing payment key gracefully
- [ ] Payment confirmation flow

#### Error Handling:
- [ ] Wrong subscription key for endpoint
- [ ] Invalid credentials error
- [ ] API rate limit error
- [ ] Network timeout
- [ ] Malformed response handling

#### Environment Selection:
- [ ] Sandbox uses sandbox endpoints
- [ ] Production uses production endpoints
- [ ] Environment selection from connection config

**Estimated:** 10-12 hours (30 tests × 20-25 min avg)

---

## 2.5 Provider Registry & Base Provider

### Status: ⚠️ 0/15 tests written
**File:** `tests/unit/lib/banking-providers.test.ts` (NEW)

### Tests Needed:
#### Provider Registration:
- [ ] Register provider in registry
- [ ] Get provider by ID
- [ ] List all registered providers
- [ ] Provider config validation

#### Provider Configuration:
- [ ] Validate required environment variables
- [ ] Provider disabled if env vars missing
- [ ] Provider enabled if env vars present

#### Base Provider Methods:
- [ ] isTokenExpired() logic correct
- [ ] Authorization URL generation
- [ ] Token exchange abstract method
- [ ] Refresh token abstract method
- [ ] Fetch accounts abstract method
- [ ] Fetch transactions abstract method

**Estimated:** 5-6 hours (15 tests × 20-25 min avg)

---

## CATEGORY 2 SUMMARY

| Sub-Category | Tests | Status | Priority | Est. Hours |
|--------------|-------|--------|----------|------------|
| Standard Bank creds | 11 | ✅ COMPLETE | 🟠 | 0 |
| Plaid integration | 35 | ⚠️ TODO | 🟠 | 12-15 |
| Tink integration | 35 | ⚠️ TODO | 🟠 | 12-15 |
| Standard Bank API | 30 | ⚠️ TODO | 🟠 | 10-12 |
| Provider registry | 15 | ⚠️ TODO | 🟠 | 5-6 |
| **TOTAL** | **126** | **9% done** | 🟠 | **39-48 hrs** |

**Target:** 90%+ coverage on banking integrations  
**Timeline:** Week 2-3

---

# CATEGORY 3: 🟡 MEDIUM - DATA INTEGRITY & BUSINESS LOGIC

**Priority:** MEDIUM - Financial accuracy matters  
**Risk:** Wrong balances, duplicate transactions, data corruption  
**Current Coverage:** 2 tests passing (CSV validation)

## 3.1 Transaction Deduplication

### Status: ⚠️ 0/20 tests written
**File:** `tests/integration/transaction-deduplication.test.ts` (NEW)

### Tests Needed:
#### Duplicate Detection:
- [ ] Same transaction imported twice → only 1 record
- [ ] Detect by external_transaction_id
- [ ] Detect by amount + date + account (fuzzy match)
- [ ] Different transactions with same amount → both stored

#### Provider Transactions:
- [ ] Plaid transaction not duplicated
- [ ] Tink transaction not duplicated
- [ ] CSV import checks for duplicates
- [ ] Manual entry checks for duplicates

#### Edge Cases:
- [ ] Pending → booked transition (same transaction)
- [ ] Transaction amount modified (update, not duplicate)
- [ ] Transaction date changed (update, not duplicate)
- [ ] Same transaction across multiple syncs

#### Performance:
- [ ] Duplicate check efficient for large datasets
- [ ] Batch import deduplicates correctly
- [ ] Concurrent imports don't create duplicates

**Estimated:** 7-8 hours (20 tests × 20-25 min avg)

---

## 3.2 CSV Import & Data Ingestion

### Status: ⚠️ 1/25 tests passing
**File:** `tests/unit/lib/csv-parser.test.ts`

### Tests Needed: (15 already written, need implementation)
#### CSV Parsing:
- [ ] Parse valid CSV data ⚠️ failing - needs implementation
- [ ] Handle quoted fields ⚠️ failing
- [ ] Handle empty lines ⚠️ failing
- [ ] Handle different line endings (CRLF) ⚠️ failing
- [ ] Reject empty CSV ⚠️ failing
- [ ] Reject CSV with only headers ⚠️ failing

#### Column Detection:
- [ ] Detect standard column names ⚠️ failing
- [ ] Detect common variations ⚠️ failing
- [ ] Case-insensitive matching ⚠️ failing
- [ ] Detect Balance column ⚠️ failing
- [ ] Detect Reference/Transaction ID ⚠️ failing

#### Validation:
- [ ] Validate required columns ✅ passing (partial)
- [ ] Reject missing date column ✅ passing
- [ ] Reject missing amount column ⚠️ failing
- [ ] Allow optional columns ⚠️ failing

#### Additional Tests Needed:
- [ ] Import transactions from CSV
- [ ] Import accounts from CSV
- [ ] Date parsing (multiple formats)
- [ ] Amount parsing (handle negatives, decimals)
- [ ] Currency column handling
- [ ] Custom field mapping
- [ ] Preview before import
- [ ] Error reporting (which rows failed)
- [ ] Batch size handling (large files)
- [ ] Progress tracking for large imports

**Estimated:** 8-10 hours (implement 14 failing + 10 new tests)

---

## 3.3 Currency & Exchange Rates

### Status: ⚠️ 1/20 tests passing
**File:** `tests/unit/lib/currency.test.ts`

### Tests Needed: (16 already written, need implementation)
#### Currency Formatting:
- [ ] Format USD correctly ⚠️ failing - needs implementation
- [ ] Format EUR correctly ⚠️ failing
- [ ] Format GBP correctly ⚠️ failing
- [ ] Handle negative amounts ⚠️ failing
- [ ] Handle zero ⚠️ failing
- [ ] Default to USD for unknown ✅ passing

#### Currency Symbols:
- [ ] Return correct symbol for USD ⚠️ failing
- [ ] Return correct symbol for EUR ⚠️ failing
- [ ] Return correct symbol for GBP ⚠️ failing
- [ ] Return correct symbol for ZAR ⚠️ failing
- [ ] Return code for unknown currency ⚠️ failing

#### Currency Conversion:
- [ ] Convert USD to EUR ⚠️ failing
- [ ] Convert EUR to USD ⚠️ failing
- [ ] Same currency returns same amount ⚠️ failing
- [ ] Handle decimal exchange rates ⚠️ failing
- [ ] Handle fractional results ⚠️ failing

#### Additional Tests Needed:
- [ ] Fetch exchange rates from API
- [ ] Store exchange rates in database
- [ ] Historical rate lookups
- [ ] Fallback for missing rates

**Estimated:** 6-8 hours (implement 15 failing + 4 new tests)

---

## 3.4 Balance Calculations

### Status: ⚠️ 0/15 tests written
**File:** `tests/integration/balance-calculations.test.ts` (NEW)

### Tests Needed:
#### Account Balances:
- [ ] Calculate balance from transactions
- [ ] Opening balance + transactions = current balance
- [ ] Debit transactions decrease balance
- [ ] Credit transactions increase balance
- [ ] Handle negative balances

#### Multi-Currency:
- [ ] Convert to base currency (USD)
- [ ] Sum balances across currencies
- [ ] Handle missing exchange rates
- [ ] Historical balance at specific date

#### Entity-Level Balances:
- [ ] Sum account balances by entity
- [ ] Entity balance includes all accounts
- [ ] Entity balance in multiple currencies

#### Dashboard Totals:
- [ ] Total balance across all accounts
- [ ] Total balance by currency
- [ ] Cash flow (income vs expenses)

**Estimated:** 5-6 hours (15 tests × 20-25 min avg)

---

## 3.5 Account & Transaction CRUD

### Status: ⚠️ 0/30 tests written
**Files:**
- `tests/integration/account-crud.test.ts` (NEW)
- `tests/integration/transaction-crud.test.ts` (NEW)

### Tests Needed:
#### Accounts:
- [ ] Create account with required fields
- [ ] Create account with custom fields
- [ ] Read account by ID
- [ ] Read all accounts for tenant
- [ ] Update account details
- [ ] Update account balance
- [ ] Delete account (soft delete?)
- [ ] Account deletion cascades to transactions
- [ ] Prevent duplicate accounts (by account_number + bank)

#### Transactions:
- [ ] Create manual transaction
- [ ] Read transaction by ID
- [ ] Read transactions for account
- [ ] Read transactions for date range
- [ ] Update transaction
- [ ] Delete transaction
- [ ] Filter transactions (date, amount, type)
- [ ] Sort transactions (date, amount)
- [ ] Paginate large transaction sets
- [ ] Transaction search (by description)

#### Entity Management:
- [ ] Create entity
- [ ] Read entity by ID
- [ ] Update entity
- [ ] Delete entity
- [ ] Link accounts to entities
- [ ] Entity-level reporting

**Estimated:** 10-12 hours (30 tests × 20-25 min avg)

---

## CATEGORY 3 SUMMARY

| Sub-Category | Tests | Status | Priority | Est. Hours |
|--------------|-------|--------|----------|------------|
| Transaction dedup | 20 | ⚠️ TODO | 🟡 | 7-8 |
| CSV import | 25 | ⚠️ 4% done | 🟡 | 8-10 |
| Currency utils | 20 | ⚠️ 5% done | 🟡 | 6-8 |
| Balance calculations | 15 | ⚠️ TODO | 🟡 | 5-6 |
| Account/Tx CRUD | 30 | ⚠️ TODO | 🟡 | 10-12 |
| **TOTAL** | **110** | **2% done** | 🟡 | **36-44 hrs** |

**Target:** 85%+ coverage on data integrity  
**Timeline:** Week 3-4

---

# CATEGORY 4: 🟡 MEDIUM - API ROUTES

**Priority:** MEDIUM - Validate all endpoints  
**Risk:** API errors, security vulnerabilities  
**Current Coverage:** 0%

## 4.1 Account APIs

### Status: ⚠️ 0/15 tests written
**File:** `tests/integration/api/accounts.test.ts` (NEW)

### Endpoints to Test:
- `GET /api/accounts?tenantId=xxx` - List accounts
- `GET /api/accounts?id=xxx&tenantId=xxx` - Get single account
- `POST /api/accounts` - Create account
- `PATCH /api/accounts` - Update account
- `DELETE /api/accounts?id=xxx&tenantId=xxx` - Delete account

### Tests Needed:
- [ ] GET returns accounts for tenant
- [ ] GET with ID returns single account
- [ ] GET without tenantId returns 400
- [ ] POST creates account successfully
- [ ] POST validates required fields
- [ ] POST returns 400 for invalid data
- [ ] PATCH updates account
- [ ] PATCH validates data
- [ ] DELETE removes account
- [ ] All endpoints check authentication
- [ ] All endpoints check tenant access
- [ ] All endpoints return correct status codes
- [ ] All endpoints return JSON responses

**Estimated:** 5-6 hours

---

## 4.2 Transaction APIs

### Status: ⚠️ 0/10 tests written
**File:** `tests/integration/api/transactions.test.ts` (NEW)

### Endpoints to Test:
- `GET /api/transactions?tenantId=xxx`
- `POST /api/accounts/[id]/transactions/import`

### Tests Needed:
- [ ] GET returns transactions for tenant
- [ ] GET filters by date range
- [ ] GET filters by account
- [ ] POST imports transactions
- [ ] POST validates transaction data
- [ ] Authentication required
- [ ] Tenant access verified

**Estimated:** 3-4 hours

---

## 4.3 Connection APIs

### Status: ⚠️ 0/10 tests written
**File:** `tests/integration/api/connections.test.ts` (NEW)

### Endpoints to Test:
- `GET /api/connections?tenantId=xxx`
- `GET /api/connections?id=xxx&tenantId=xxx`
- `DELETE /api/connections?id=xxx`

### Tests Needed:
- [ ] GET returns connections for tenant
- [ ] GET with ID returns single connection
- [ ] DELETE removes connection
- [ ] Authentication required
- [ ] Tenant access verified

**Estimated:** 3-4 hours

---

## 4.4 Banking APIs

### Status: ⚠️ 0/15 tests written
**File:** `tests/integration/api/banking.test.ts` (NEW)

### Endpoints to Test:
- `GET /api/banking/providers`
- `GET /api/banking/[provider]/authorize`
- `POST /api/banking/[provider]/callback`
- `POST /api/banking/[provider]/sync`
- `GET /api/banking/accounts?connectionId=xxx`
- `GET /api/banking/tokens?connectionId=xxx`

### Tests Needed:
- [ ] GET providers returns list
- [ ] GET authorize generates OAuth URL
- [ ] POST callback exchanges code for token
- [ ] POST sync triggers sync job
- [ ] All endpoints validate provider exists
- [ ] All endpoints check authentication

**Estimated:** 5-6 hours

---

## 4.5 Dashboard & Admin APIs

### Status: ⚠️ 0/15 tests written
**Files:**
- `tests/integration/api/dashboard.test.ts` (NEW)
- `tests/integration/api/admin.test.ts` (NEW)

### Endpoints to Test:
- `GET /api/dashboard?tenantId=xxx`
- `GET /api/admin/tenants` (super admin only)
- `GET /api/admin/connections` (super admin only)
- `GET /api/admin/health` (super admin only)
- `GET /api/admin/stats` (super admin only)

### Tests Needed:
- [ ] Dashboard returns summary data
- [ ] Dashboard filters work correctly
- [ ] Admin endpoints require super admin
- [ ] Admin endpoints return correct data
- [ ] All endpoints validate permissions

**Estimated:** 5-6 hours

---

## CATEGORY 4 SUMMARY

| Sub-Category | Tests | Status | Priority | Est. Hours |
|--------------|-------|--------|----------|------------|
| Account APIs | 15 | ⚠️ TODO | 🟡 | 5-6 |
| Transaction APIs | 10 | ⚠️ TODO | 🟡 | 3-4 |
| Connection APIs | 10 | ⚠️ TODO | 🟡 | 3-4 |
| Banking APIs | 15 | ⚠️ TODO | 🟡 | 5-6 |
| Dashboard/Admin APIs | 15 | ⚠️ TODO | 🟡 | 5-6 |
| **TOTAL** | **65** | **0% done** | 🟡 | **21-26 hrs** |

**Target:** 80%+ coverage on API routes  
**Timeline:** Week 4

---

# CATEGORY 5: 🟢 LOW - UI COMPONENTS

**Priority:** LOW - Nice to have  
**Risk:** UX issues, but not blocking  
**Current Coverage:** 0%

## 5.1 Form Components

### Status: ⚠️ 0/20 tests written
**File:** `tests/unit/components/forms.test.tsx` (NEW)

### Components to Test:
- EditAccountModal
- BulkImportModal
- DirectBankApiCard
- Entity forms
- Transaction forms

### Tests Needed:
- [ ] Form renders correctly
- [ ] Required field validation
- [ ] Optional field handling
- [ ] Submit triggers API call
- [ ] Loading state during submit
- [ ] Success message after submit
- [ ] Error message on failure
- [ ] Form reset after submit
- [ ] Cancel button closes form

**Estimated:** 6-8 hours

---

## 5.2 Data Display Components

### Status: ⚠️ 0/15 tests written
**File:** `tests/unit/components/display.test.tsx` (NEW)

### Components to Test:
- EnhancedTransactionTable
- EntityGroupedView
- ExchangeRateCharts
- Account cards
- Dashboard widgets

### Tests Needed:
- [ ] Component renders with data
- [ ] Empty state renders correctly
- [ ] Loading state renders
- [ ] Sorting works correctly
- [ ] Filtering works correctly
- [ ] Pagination works correctly

**Estimated:** 5-6 hours

---

## 5.3 Navigation & Layout

### Status: ⚠️ 0/10 tests written
**File:** `tests/unit/components/navigation.test.tsx` (NEW)

### Components to Test:
- Navigation menu
- Tenant switcher
- User menu
- Breadcrumbs

### Tests Needed:
- [ ] Navigation renders all links
- [ ] Active link highlighted
- [ ] Tenant switcher shows tenants
- [ ] Tenant switch updates context
- [ ] User menu shows user info

**Estimated:** 3-4 hours

---

## CATEGORY 5 SUMMARY

| Sub-Category | Tests | Status | Priority | Est. Hours |
|--------------|-------|--------|----------|------------|
| Form components | 20 | ⚠️ TODO | 🟢 | 6-8 |
| Display components | 15 | ⚠️ TODO | 🟢 | 5-6 |
| Navigation | 10 | ⚠️ TODO | 🟢 | 3-4 |
| **TOTAL** | **45** | **0% done** | 🟢 | **14-18 hrs** |

**Target:** 60%+ coverage on UI components  
**Timeline:** Week 5 (optional)

---

# OVERALL SUMMARY

## Test Coverage by Category

| Category | Priority | Tests Written | Tests Passing | % Complete | Est. Hours |
|----------|----------|---------------|---------------|------------|------------|
| 1. Security & Isolation | 🔴 CRITICAL | 100 | 10 | 10% | 27-34 |
| 2. Banking Integrations | 🟠 HIGH | 126 | 11 | 9% | 39-48 |
| 3. Data Integrity | 🟡 MEDIUM | 110 | 2 | 2% | 36-44 |
| 4. API Routes | 🟡 MEDIUM | 65 | 0 | 0% | 21-26 |
| 5. UI Components | 🟢 LOW | 45 | 0 | 0% | 14-18 |
| **TOTAL** | | **446** | **23** | **5%** | **137-170 hrs** |

## Recommended Timeline

### Phase 1: CRITICAL SECURITY (Weeks 1-2)
**Goal:** 100% coverage on Category 1  
**Tests:** 90 additional tests (10 already done)  
**Time:** 27-34 hours  
**Deliverable:** BLOCKING issues resolved

### Phase 2: BANKING CORE (Weeks 2-3)
**Goal:** 90% coverage on Category 2  
**Tests:** 115 additional tests (11 already done)  
**Time:** 39-48 hours  
**Deliverable:** Core product value validated

### Phase 3: DATA INTEGRITY (Week 3-4)
**Goal:** 85% coverage on Category 3  
**Tests:** 108 additional tests (2 already done)  
**Time:** 36-44 hours  
**Deliverable:** Financial accuracy guaranteed

### Phase 4: API VALIDATION (Week 4)
**Goal:** 80% coverage on Category 4  
**Tests:** 65 tests  
**Time:** 21-26 hours  
**Deliverable:** All endpoints validated

### Phase 5: UI POLISH (Week 5 - Optional)
**Goal:** 60% coverage on Category 5  
**Tests:** 45 tests  
**Time:** 14-18 hours  
**Deliverable:** User experience validated

---

## Critical Path to Production

### Minimum Viable Testing (MVP):
**Categories:** 1 + 2 (Security + Banking)  
**Tests:** 226 total (21 done, 205 to write)  
**Time:** 66-82 hours (~2-3 weeks)  
**Coverage:** CRITICAL and HIGH priority only

### Recommended for Client Onboarding:
**Categories:** 1 + 2 + 3 (Security + Banking + Data)  
**Tests:** 336 total (23 done, 313 to write)  
**Time:** 102-126 hours (~3-4 weeks)  
**Coverage:** 80%+ on critical paths

### Production-Ready:
**Categories:** 1 + 2 + 3 + 4 (All except UI)  
**Tests:** 401 total (23 done, 378 to write)  
**Time:** 123-152 hours (~4-5 weeks)  
**Coverage:** 85%+ overall

---

## Next Steps

### Immediate Actions:
1. ✅ Review this audit
2. ✅ Choose timeline (MVP vs Recommended vs Production-Ready)
3. ✅ Start with Category 1 (Security) - HIGHEST PRIORITY
4. ✅ Work through categories in priority order
5. ✅ Track progress with test coverage reports

### Decision Point:
**Can we onboard clients now?**
- ❌ **NO** - Only 5% test coverage, critical security gaps
- ⚠️ **RISKY** - After MVP (2-3 weeks) with known risks
- ✅ **YES** - After Recommended (3-4 weeks) with confidence

**Recommendation:** Complete Categories 1 + 2 (Security + Banking) before onboarding paying clients. This gives you 50% of the way to production-ready, covering the most critical risks.

---

**Ready to start?** Let's tackle **Category 1: Security** first! 🚀

