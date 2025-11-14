# Scripts Directory

Organized scripts for database setup, data generation, and utilities.

## Directory Structure

```
scripts/
├── migrations/          # Database migrations (SQL)
├── data-generation/     # Scripts to generate test data
├── utilities/           # Helper scripts and tools
└── README.md           # This file
```

---

## 📊 Migrations (`migrations/`)

SQL files to set up and enhance database tables. **Run in order:**

### Core Setup
1. **01-create-base-tables.sql** - Base tables (accounts, entities, transactions, payments, forecasts)
2. **02-setup-multi-tenant.sql** - Multi-tenancy (tenants, user_tenants, RLS policies)
3. **03-seed-multi-tenant-data.sql** - Mock multi-tenant data (3 organizations)

### Feature Enhancements
4. **04-setup-data-ingestion-safe.sql** - Data ingestion tables (connections, jobs, raw_data, audit)
5. **05-enhance-accounts-safe.sql** - Enhance accounts with custom fields & industry-standard fields
6. **create-exchange-rates-table.sql** - Exchange rates table

### How to Run
1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new)
2. Copy contents of SQL file
3. Paste and click "Run"

---

## 🎲 Data Generation (`data-generation/`)

Scripts to create test data for development.

### User & Organization Setup
- **create-test-user.ts** - Create test user (test@treasuryx.com)
- **setup-test-user-org.ts** - Create organization for test user
- **create-test-accounts-v2.ts** - Create 4 test bank accounts

### Transaction Data
- **generate-bank-statements.ts** - Generate 2 years of realistic CSV bank statements

### How to Run
```bash
npx tsx scripts/data-generation/create-test-user.ts
npx tsx scripts/data-generation/setup-test-user-org.ts
npx tsx scripts/data-generation/create-test-accounts-v2.ts
npx tsx scripts/data-generation/generate-bank-statements.ts
```

---

## 🔧 Utilities (`utilities/`)

Helper scripts for maintenance and debugging.

- **backfill-exchange-rates.ts** - Populate exchange rates from Frankfurter API
- **migrate-csv-to-db.ts** - Import exchange rates CSV to database
- **verify-test-user.ts** - Verify test user setup and organization
- **check-accounts-schema.ts** - Check accounts table schema
- **run-migration.ts** - Run migrations via API (experimental)

### How to Run
```bash
npx tsx scripts/utilities/<script-name>.ts
```

---

## 🗑️ Obsolete Files Removed

The following duplicate/obsolete files have been removed:
- ❌ 04-setup-data-ingestion.sql (superseded by -safe version)
- ❌ 04-setup-data-ingestion-fixed.sql (superseded by -safe version)
- ❌ 05-enhance-accounts.sql (superseded by -safe version)
- ❌ create-test-accounts.ts (superseded by v2)
- ❌ setup-multi-tenant.sql (duplicate)
- ❌ seed-multi-tenant-data.sql (duplicate)

---

## 📝 Quick Start

### Initial Setup
```bash
# 1. Run migrations in Supabase SQL Editor (in order 01-05)
# 2. Create test user and organization
npx tsx scripts/data-generation/create-test-user.ts
npx tsx scripts/data-generation/setup-test-user-org.ts

# 3. Create test accounts
npx tsx scripts/data-generation/create-test-accounts-v2.ts

# 4. Generate bank statement CSVs
npx tsx scripts/data-generation/generate-bank-statements.ts

# 5. Populate exchange rates
npx tsx scripts/utilities/backfill-exchange-rates.ts
```

### Reset Test Environment
```bash
# Delete and recreate test user
npx tsx scripts/data-generation/create-test-user.ts

# Recreate organization
npx tsx scripts/data-generation/setup-test-user-org.ts

# Recreate accounts
npx tsx scripts/data-generation/create-test-accounts-v2.ts
```

---

## 🔐 Environment Variables Required

All scripts require these environment variables in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## 📚 Documentation

See `docs/` folder for detailed documentation:
- Architecture guides
- Feature documentation  
- Deployment guides

