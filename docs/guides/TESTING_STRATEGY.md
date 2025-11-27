# Testing Strategy for Stratiri - Production Client Onboarding

**Date:** November 23, 2025  
**Status:** 🚨 **CRITICAL - NO TESTS CURRENTLY EXIST**  
**Priority:** HIGH - Before onboarding paying clients

---

## Current State Assessment

### ❌ What We DON'T Have:
- No unit tests
- No integration tests
- No E2E tests
- No test framework installed (Jest, Vitest, Playwright, etc.)
- No CI/CD automated testing
- No test coverage tracking

### ✅ What We DO Have:
- TypeScript (provides compile-time type safety)
- ESLint (code quality)
- Manual testing in development
- Production monitoring via Vercel

---

## Critical Areas That MUST Be Tested

### 🔴 TIER 1: Security & Data Integrity (Blocking Issues)

#### 1. Multi-Tenant Isolation ⚠️ CRITICAL
**Why:** Data leaks between tenants would be catastrophic
**What to Test:**
```typescript
// Tests needed:
- User can ONLY see data for their tenant(s)
- Switching tenants properly filters all queries
- RLS policies enforce tenant boundaries
- API routes validate tenant membership
- Super admin access is properly restricted
```

**Example Test Cases:**
- User from Tenant A tries to access Tenant B's accounts → 403
- API call with valid auth but wrong tenant_id → Empty results or error
- Account creation associates correct tenant_id
- Transaction queries filtered by tenant_id

#### 2. Banking Provider Credentials (New: Standard Bank)
**Why:** Storing/using wrong credentials = security breach + broken integrations
**What to Test:**
```typescript
// Credential storage
- Encryption works (AES-256-GCM)
- Decryption returns original values
- Invalid encryption key fails gracefully
- Credentials scoped to correct tenant

// Standard Bank specific
- All 3 subscription keys stored correctly
- subscriptionKeyBalances used for balance API
- subscriptionKeyTransactions used for transaction API
- Missing optional subscriptionKeyPayments handled gracefully
```

#### 3. Authentication & Authorization
**Why:** Unauthorized access = security breach
**What to Test:**
```typescript
- Login/logout flows
- Session persistence
- Token refresh
- Role-based permissions (owner, admin, editor, viewer)
- API routes reject unauthenticated requests
- Protected pages redirect to login
```

#### 4. Data Ingestion & Deduplication
**Why:** Duplicate transactions = incorrect balances
**What to Test:**
```typescript
// CSV Import
- Column mapping works correctly
- Date parsing handles multiple formats
- Currency conversion applied correctly
- Validation catches malformed data

// Transaction deduplication
- Same transaction imported twice → only 1 record
- Duplicate detection logic (amount + date + account)
- Provider transactions don't duplicate manual entries
```

---

### 🟡 TIER 2: Business Logic (Revenue Impact)

#### 5. Banking Provider Integrations
**Why:** Broken sync = no value for customers
**What to Test:**

**Plaid:**
```typescript
- OAuth flow completes successfully
- Access token exchange works
- Account sync stores correct data
- Transaction sync with cursor pagination
- Incremental sync doesn't duplicate
- Token refresh before expiry
```

**Standard Bank (Future):**
```typescript
- Client credentials OAuth flow
- Correct subscription key per endpoint
- Balance fetching with subscriptionKeyBalances
- Transaction fetching with subscriptionKeyTransactions
- Error handling for API failures
- Sandbox vs Production environment handling
```

**Tink:**
```typescript
- OAuth flow with Tink Connect
- Account sync with European formats (IBAN)
- Transaction pagination with pageToken
- Token expiry handling
```

#### 6. Account & Transaction Management
**Why:** Core product functionality
**What to Test:**
```typescript
// Accounts
- Create account with all required fields
- Update account details
- Delete account (cascade to transactions?)
- Custom fields stored/retrieved correctly
- Multi-currency accounts handled

// Transactions
- Manual transaction entry
- Transaction editing preserves data
- Filtering by date range
- Filtering by account
- Sorting works correctly
- Pagination for large datasets
```

#### 7. Currency & Exchange Rates
**Why:** Multi-currency support is a key feature
**What to Test:**
```typescript
- Exchange rate fetching/updating
- Currency conversion calculations
- Historical rate lookups
- Fallback for missing rates
- USD/EUR/GBP/ZAR coverage
```

---

### 🟢 TIER 3: User Experience (Quality of Life)

#### 8. UI Components
**Why:** Broken UI = poor user experience
**What to Test:**
```typescript
- Forms validate required fields
- Loading states show correctly
- Error messages are user-friendly
- Modals open/close properly
- Navigation works across all routes
```

#### 9. Dashboard & Analytics
**Why:** Primary value delivery
**What to Test:**
```typescript
- Balance calculations are accurate
- Charts render with correct data
- Date range filters work
- Export functionality generates correct CSVs
- Account grouping by entity works
```

---

## Recommended Testing Stack

### 1. Unit Tests: **Vitest** (Modern, Fast, TypeScript Native)
```bash
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom
```

**Why Vitest:**
- ✅ Native TypeScript support (no configuration)
- ✅ Fast (Vite-powered)
- ✅ Jest-compatible API (easy migration path)
- ✅ Built-in UI for debugging
- ✅ Better for Next.js 14 than Jest

**What to Test:**
- Pure functions (parsers, utilities, formatters)
- React components (rendering, interactions)
- Business logic (calculations, validations)
- Service layer functions

### 2. Integration Tests: **Vitest + Supabase Test Client**
```bash
npm install -D @supabase/supabase-js
```

**What to Test:**
- API routes end-to-end
- Database operations (with test database)
- RLS policies
- Banking provider service functions

### 3. E2E Tests: **Playwright** (Optional, but Recommended)
```bash
npm install -D @playwright/test
```

**What to Test:**
- Critical user flows (signup → onboarding → connect bank → view dashboard)
- Banking OAuth flows (with mock providers)
- Multi-tenant switching
- Account/transaction CRUD operations

---

## Testing Infrastructure Setup

### Phase 1: Foundation (Week 1)
**Goal:** Get testing framework running

```bash
# Install dependencies
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom

# Update package.json
"scripts": {
  "test": "vitest",
  "test:ui": "vitest --ui",
  "test:coverage": "vitest --coverage"
}

# Create vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

**Deliverable:** First 5 tests passing

### Phase 2: Critical Path Coverage (Week 2)
**Goal:** Cover Tier 1 security tests

**Test Files to Create:**
```
tests/
├── setup.ts                          # Test configuration
├── unit/
│   ├── lib/
│   │   ├── csv-parser.test.ts        # CSV parsing logic
│   │   ├── currency.test.ts          # Currency conversions
│   │   └── security/
│   │       └── credential-vault.test.ts  # Encryption/decryption
│   └── components/
│       ├── EditAccountModal.test.tsx
│       └── DirectBankApiCard.test.tsx
├── integration/
│   ├── multi-tenant.test.ts          # RLS & tenant isolation
│   ├── accounts-api.test.ts          # Account CRUD
│   └── banking-providers.test.ts     # Provider registration
└── e2e/
    ├── auth-flow.spec.ts             # Login/signup
    └── connect-bank.spec.ts          # Banking connection
```

**Deliverable:** 80%+ coverage on critical security logic

### Phase 3: Banking Providers (Week 3)
**Goal:** Test all banking integrations

**Focus Areas:**
- Plaid OAuth and sync
- Standard Bank credential collection
- Tink OAuth and sync
- Token refresh logic
- Error handling

**Deliverable:** All banking provider code paths tested

### Phase 4: E2E + CI/CD (Week 4)
**Goal:** Automated testing on every deploy

**Setup:**
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build
```

**Deliverable:** Tests run on every commit

---

## Specific Test Examples

### Example 1: Multi-Tenant Isolation Test
```typescript
// tests/integration/multi-tenant.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@/lib/supabase';

describe('Multi-Tenant Isolation', () => {
  let tenant1Id: string;
  let tenant2Id: string;
  let user1Id: string;
  let user2Id: string;

  beforeEach(async () => {
    // Setup test data
    // Create 2 tenants, 2 users, 2 accounts (one per tenant)
  });

  it('should only return accounts for current tenant', async () => {
    const supabase = createClient();
    // Authenticate as user1
    
    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('tenant_id', tenant1Id);

    // Should only see tenant1's account
    expect(accounts).toHaveLength(1);
    expect(accounts[0].tenant_id).toBe(tenant1Id);
  });

  it('should reject access to other tenant data', async () => {
    const supabase = createClient();
    // Authenticate as user1, try to access tenant2 data
    
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('tenant_id', tenant2Id);

    // RLS should block this
    expect(data).toEqual([]);
  });
});
```

### Example 2: Standard Bank Credential Storage
```typescript
// tests/unit/lib/security/credential-vault.test.ts
import { describe, it, expect } from 'vitest';
import { encryptCredentials, decryptCredentials } from '@/lib/security/credential-vault';

describe('Credential Vault', () => {
  const credentials = {
    appId: 'sbx-app-12345',
    clientSecret: 'super-secret',
    subscriptionKeyBalances: 'key-balances-123',
    subscriptionKeyTransactions: 'key-transactions-456',
    subscriptionKeyPayments: 'key-payments-789',
  };

  it('should encrypt and decrypt credentials', () => {
    const encrypted = encryptCredentials(credentials);
    
    // Should be encrypted (not plaintext)
    expect(encrypted).not.toContain('super-secret');
    expect(encrypted).toContain(':'); // iv:tag:ciphertext format
    
    const decrypted = decryptCredentials(encrypted);
    expect(decrypted).toEqual(credentials);
  });

  it('should use correct subscription key per API endpoint', () => {
    const creds = {
      subscriptionKeyBalances: 'balance-key',
      subscriptionKeyTransactions: 'transaction-key',
      subscriptionKeyPayments: 'payment-key',
    };

    // Balance API should use subscriptionKeyBalances
    const balanceKey = getSubscriptionKeyForEndpoint(creds, 'balances');
    expect(balanceKey).toBe('balance-key');

    // Transaction API should use subscriptionKeyTransactions
    const txKey = getSubscriptionKeyForEndpoint(creds, 'transactions');
    expect(txKey).toBe('transaction-key');
  });

  it('should handle missing optional payment key gracefully', () => {
    const creds = {
      subscriptionKeyBalances: 'balance-key',
      subscriptionKeyTransactions: 'transaction-key',
      // subscriptionKeyPayments not provided
    };

    // Should throw or return null for payment endpoint
    expect(() => {
      getSubscriptionKeyForEndpoint(creds, 'payments');
    }).toThrow('Payment subscription key not provided');
  });
});
```

### Example 3: CSV Parser
```typescript
// tests/unit/lib/csv-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseCSV, detectColumns } from '@/lib/csv-parser';

describe('CSV Parser', () => {
  it('should parse valid CSV data', async () => {
    const csvContent = `Date,Description,Amount,Currency
2024-01-01,Test Transaction,100.50,USD
2024-01-02,Another Transaction,-50.25,EUR`;

    const result = await parseCSV(csvContent);
    
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      Date: '2024-01-01',
      Description: 'Test Transaction',
      Amount: '100.50',
      Currency: 'USD',
    });
  });

  it('should detect column mappings', () => {
    const headers = ['Date', 'Desc', 'Amt', 'Curr'];
    const mapping = detectColumns(headers);

    expect(mapping.date).toBe('Date');
    expect(mapping.description).toBe('Desc');
    expect(mapping.amount).toBe('Amt');
    expect(mapping.currency).toBe('Curr');
  });

  it('should handle missing required columns', () => {
    const headers = ['Date', 'Description']; // Missing amount
    
    expect(() => {
      validateCSVHeaders(headers);
    }).toThrow('Missing required column: amount');
  });
});
```

### Example 4: API Route Test
```typescript
// tests/integration/accounts-api.test.ts
import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/accounts/route';

describe('Accounts API', () => {
  it('should create account with valid data', async () => {
    const request = new Request('http://localhost:3000/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'test-tenant-id',
        account_name: 'Test Account',
        account_number: '1234567890',
        currency: 'USD',
        account_type: 'checking',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.account_name).toBe('Test Account');
    expect(data.data.tenant_id).toBe('test-tenant-id');
  });

  it('should reject account creation without tenant_id', async () => {
    const request = new Request('http://localhost:3000/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_name: 'Test Account',
        // tenant_id missing
      }),
    });

    const response = await POST(request);
    
    expect(response.status).toBe(400);
  });
});
```

---

## Test Data Strategy

### 1. Separate Test Database
```bash
# .env.test
NEXT_PUBLIC_SUPABASE_URL="https://test-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="test-anon-key"
SUPABASE_SERVICE_ROLE_KEY="test-service-role-key"
```

### 2. Test Fixtures
```typescript
// tests/fixtures/accounts.ts
export const mockAccount = {
  id: 'test-account-id',
  tenant_id: 'test-tenant-id',
  account_name: 'Test Checking Account',
  account_number: '1234567890',
  currency: 'USD',
  account_type: 'checking',
  balance: 10000.50,
};

export const mockTransaction = {
  id: 'test-tx-id',
  account_id: 'test-account-id',
  tenant_id: 'test-tenant-id',
  amount: 100.50,
  currency: 'USD',
  transaction_date: '2024-01-01',
  description: 'Test Transaction',
};
```

### 3. Database Seeding
```typescript
// tests/setup.ts
import { beforeAll, afterAll } from 'vitest';
import { supabase } from '@/lib/supabase';

beforeAll(async () => {
  // Seed test database
  await supabase.from('tenants').insert([
    { id: 'test-tenant-1', name: 'Test Org 1' },
    { id: 'test-tenant-2', name: 'Test Org 2' },
  ]);
});

afterAll(async () => {
  // Clean up test data
  await supabase.from('tenants').delete().in('id', ['test-tenant-1', 'test-tenant-2']);
});
```

---

## CI/CD Integration

### GitHub Actions Workflow
```yaml
# .github/workflows/test.yml
name: Test & Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    env:
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Run tests
        run: npm run test
      
      - name: Run build
        run: npm run build
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

---

## Test Coverage Goals

### Minimum Coverage Before Client Onboarding:

| Area | Target Coverage | Priority |
|------|----------------|----------|
| Multi-tenant isolation | 100% | 🔴 CRITICAL |
| Credential encryption | 100% | 🔴 CRITICAL |
| Authentication/Authorization | 95% | 🔴 CRITICAL |
| Banking provider OAuth | 90% | 🟡 HIGH |
| Data ingestion/deduplication | 85% | 🟡 HIGH |
| Account/Transaction CRUD | 80% | 🟡 HIGH |
| UI Components | 60% | 🟢 MEDIUM |
| Utility functions | 70% | 🟢 MEDIUM |

**Overall Target:** 80%+ test coverage on critical paths

---

## Testing Checklist Before Client Onboarding

### Pre-Launch Checklist:

#### Security & Data Integrity ✅
- [ ] Multi-tenant isolation tested (10+ test cases)
- [ ] RLS policies verified on all tables
- [ ] Credential encryption/decryption tested
- [ ] Standard Bank multiple subscription keys tested
- [ ] Authentication flows tested (login, logout, session)
- [ ] Authorization tested (all 4 roles: owner, admin, editor, viewer)
- [ ] API routes reject unauthenticated requests

#### Banking Integrations ✅
- [ ] Plaid OAuth flow tested (sandbox)
- [ ] Plaid account sync tested
- [ ] Plaid transaction sync tested (incremental)
- [ ] Standard Bank credential collection tested
- [ ] Tink OAuth flow tested
- [ ] Token refresh logic tested
- [ ] Error handling tested (API failures, expired tokens)

#### Data Operations ✅
- [ ] CSV import tested (happy path)
- [ ] CSV import tested (malformed data)
- [ ] Transaction deduplication tested
- [ ] Account CRUD operations tested
- [ ] Entity management tested
- [ ] Currency conversion tested

#### User Experience ✅
- [ ] Dashboard loads with correct data
- [ ] Account detail pages render correctly
- [ ] Transaction filtering/sorting works
- [ ] Forms validate properly
- [ ] Error messages are user-friendly
- [ ] Mobile responsive (basic test)

#### CI/CD ✅
- [ ] Tests run on every commit
- [ ] Deployment blocked if tests fail
- [ ] Test coverage tracked
- [ ] Staging environment for pre-production testing

---

## Recommended Timeline

### 4-Week Plan to Production-Ready Testing

**Week 1: Foundation**
- Install Vitest + testing libraries
- Write first 10 tests (critical security)
- Setup CI/CD pipeline
- **Deliverable:** Tests running on every commit

**Week 2: Security Coverage**
- Multi-tenant isolation (15 tests)
- Credential vault (10 tests)
- Authentication/Authorization (20 tests)
- **Deliverable:** 100% coverage on Tier 1 security

**Week 3: Banking Providers**
- Plaid integration tests (25 tests)
- Standard Bank tests (15 tests)
- Tink integration tests (20 tests)
- **Deliverable:** All banking flows tested

**Week 4: E2E + Polish**
- E2E critical user journeys (5-10 flows)
- API integration tests (30 tests)
- UI component tests (20 tests)
- **Deliverable:** 80%+ overall coverage

---

## Tools & Resources

### Testing Libraries
- **Vitest:** https://vitest.dev/
- **Testing Library:** https://testing-library.com/
- **Playwright:** https://playwright.dev/

### Mocking & Fixtures
- **MSW (Mock Service Worker):** For API mocking
- **Faker.js:** For test data generation

### Coverage & Reporting
- **Codecov:** https://codecov.io/
- **Vitest UI:** Built-in coverage UI

---

## Risks of Not Testing Before Client Onboarding

### High Risk Issues:
1. **Data Leak Between Tenants** 🔴
   - Impact: Catastrophic - legal liability, reputation damage
   - Likelihood without tests: MEDIUM-HIGH

2. **Credential Theft/Exposure** 🔴
   - Impact: Severe - security breach, loss of trust
   - Likelihood without tests: MEDIUM

3. **Duplicate Transactions** 🟡
   - Impact: High - incorrect balances, lost customer trust
   - Likelihood without tests: HIGH

4. **Banking OAuth Failures** 🟡
   - Impact: High - customers can't connect banks = no value
   - Likelihood without tests: MEDIUM

5. **Incorrect Multi-Currency Calculations** 🟢
   - Impact: Medium - financial errors, customer complaints
   - Likelihood without tests: MEDIUM

---

## Recommendation

**Before onboarding PAYING clients:**

### Minimum Viable Testing (2-3 weeks):
1. ✅ Install Vitest + testing libraries
2. ✅ Write 50-75 tests covering Tier 1 security
3. ✅ Write 30-40 tests covering banking providers
4. ✅ Setup CI/CD to run tests on every deploy
5. ✅ Achieve 70%+ coverage on critical code paths

### Ideal Testing (4 weeks):
1. ✅ Complete the 4-week plan above
2. ✅ 150+ tests total
3. ✅ 80%+ overall coverage
4. ✅ E2E tests for critical user journeys
5. ✅ Staging environment for manual QA

**Bottom Line:** You CAN onboard clients without tests, but it's HIGH RISK. The recommended minimum is 2-3 weeks to cover critical security and banking integration paths.

---

**Next Steps:**
1. Decide on timeline (2-week MVP vs 4-week ideal)
2. Install testing dependencies
3. Write first 10 critical security tests
4. Setup CI/CD
5. Iterate toward coverage goals

Would you like me to start implementing the testing infrastructure?

