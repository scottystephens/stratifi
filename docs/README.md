# Stratiri Documentation

**Production SaaS Platform for Strategic Financial Intelligence**  
🌐 **Live:** https://stratiri.vercel.app

---

## 📚 Documentation Structure

```
docs/
├── README.md (this file)
│
├── 🎯 Core Documentation
│   ├── STRATIFI_BRAND.md           # Brand identity and naming
│   └── architecture/               # System architecture docs
│
├── 🛠️ Development & Operations
│   ├── operations/                 # DevOps guides (Supabase, Vercel, deployments)
│   ├── guides/                     # Feature guides and how-tos
│   └── migrations/                 # Database migration docs
│
├── 🏗️ Features & Integrations
│   ├── features/                   # Feature-specific documentation
│   │   ├── standard-bank/          # Standard Bank (SA) direct API
│   │   ├── tink/                   # Tink aggregation provider
│   │   ├── plaid/                  # Plaid aggregation provider
│   │   └── migration/              # Database migrations
│   ├── integrations/               # Banking provider integration guides
│   └── completed-features/         # Historical feature completion reports
│
├── 🧪 Testing
│   └── testing/                    # Test strategy, reports, and tasks
│
├── 📋 Planning & Strategy
│   ├── plans/                      # Feature plans and roadmaps
│   └── analysis/                   # Analysis and research docs
│
├── 🚀 Deployments
│   └── deployments/                # Deployment reports and guides
│
└── 📦 Archive
    └── archive/                    # Deprecated/historical documentation
```

---

## 🎯 Quick Links

### Getting Started
- **[Brand & Identity](STRATIFI_BRAND.md)** - Project name, vision, and brand guidelines
- **[Architecture Overview](architecture/MULTI_TENANT_SYSTEM.md)** - Multi-tenant SaaS architecture
- **[Database Setup](guides/DATABASE_SETUP.md)** - Local development setup
- **[Production Deployment](guides/PRODUCTION_DEPLOYMENT.md)** - Deploy to production

### Operations
- **[Supabase & Vercel Runbook](operations/CURSOR_SUPABASE_VERCEL_RUNBOOK.md)** - CLI commands and workflows
- **[Cursor Rules](operations/CURSOR_RULES_SUPABASE_VERCEL.md)** - Development rules and patterns
- **[Deployment Guide](guides/DEPLOYMENT.md)** - Step-by-step deployment process

### Banking Providers
- **[Adding New Banking Providers](guides/ADDING_NEW_BANKING_PROVIDERS.md)** - Integration guide
- **[Plaid Integration](integrations/plaid/PLAID_INTEGRATION_GUIDE.md)** - Plaid setup
- **[Tink Integration](integrations/tink/README.md)** - Tink setup
- **[Standard Bank Integration](integrations/standard-bank/README.md)** - Direct API setup

### Testing
- **[Testing Strategy](testing/README.md)** - Comprehensive testing approach
- **[Test Coverage Report](testing/CATEGORY_1_COMPLETE.md)** - Current test status

### Architecture
- **[Multi-Tenant System](architecture/MULTI_TENANT_SYSTEM.md)** - Tenant isolation and RLS
- **[Data Ingestion](architecture/DATA_INGESTION_ARCHITECTURE.md)** - CSV import and processing
- **[Multi-Provider Strategy](architecture/MULTI_PROVIDER_STRATEGY.md)** - Banking provider architecture
- **[Bank Data Standards](architecture/BANK_DATA_STANDARDS.md)** - Data normalization

---

## 📖 Documentation by Topic

### 🏢 Multi-Tenancy
- [Multi-Tenant System](architecture/MULTI_TENANT_SYSTEM.md)
- [Database Design Principles](architecture/DATABASE_DESIGN_PRINCIPLES.md)
- [RLS Policy Testing](testing/CATEGORY_1_COMPLETE.md)

### 🏦 Banking Integrations
- [Banking Aggregation Providers](guides/BANKING_AGGREGATION_PROVIDERS.md)
- [Multi-Bank Standardization](guides/MULTI_BANK_STANDARDIZATION.md)
- [Plaid Cost Optimization](guides/PLAID_COST_OPTIMIZATION.md)
- [Multi-Provider Lessons Learned](guides/MULTI_PROVIDER_LESSONS_LEARNED.md)

### 💾 Data Management
- [CSV Ingestion](guides/CSV_INGESTION_COMPLETE.md)
- [Transaction Sync](guides/transaction-sync.md)
- [Account Management](guides/account-management.md)
- [Exchange Rates](guides/EXCHANGE_RATES.md)
- [Transactions vs Statements](guides/TRANSACTIONS_VS_STATEMENTS.md)

### 🔐 Security
- [Authentication Testing](testing/tasks/TASK_3_AUTHENTICATION_COMPLETE.md)
- [Authorization Testing](testing/tasks/TASK_4_AUTHORIZATION_COMPLETE.md)
- [Credential Encryption](testing/tasks/TASK_5_ENCRYPTION_COMPLETE.md)

### 🗄️ Database
- [Supabase CLI Setup](guides/SUPABASE_CLI_SETUP.md)
- [Database Setup](guides/DATABASE_SETUP.md)
- [Migrations 13-14 Summary](migrations/MIGRATIONS-13-14-SUMMARY.md)

### 🚀 Deployment
- [Production Deployment](guides/PRODUCTION_DEPLOYMENT.md)
- [Deployment Guide](guides/DEPLOYMENT.md)
- [Recent Deployment Success](deployments/DEPLOYMENT_SUCCESS.md)

---

## 🆕 Recently Completed Features

See [completed-features/](completed-features/) for detailed reports:

- ✅ Multi-Provider Implementation
- ✅ Admin Dashboard
- ✅ Bulk Import
- ✅ Entity Diagrams
- ✅ Full-Width Layout
- ✅ Dimension Tables
- ✅ Account Detail Enhancements
- ✅ UX Fixes

---

## 🧪 Testing Status

**Category 1: Security & Core Functionality**
- ✅ 109/109 tests passing (100%)
- ✅ Multi-tenant isolation
- ✅ RLS policies
- ✅ Authentication & Authorization
- ✅ Credential encryption

See [testing/](testing/) for complete test documentation.

---

## 🛠️ Tech Stack

### Frontend
- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Recharts for visualizations

### Backend
- PostgreSQL via Supabase
- Next.js API Routes
- Row-Level Security (RLS)

### Infrastructure
- Hosting: Vercel
- Database: Supabase
- CI/CD: GitHub Actions

---

## 📝 Contributing

When adding new documentation:

1. **Place files in appropriate folders:**
   - Feature completion → `completed-features/`
   - Deployment reports → `deployments/`
   - Guides/tutorials → `guides/`
   - Architecture docs → `architecture/`
   - Provider-specific → `features/{provider}/` or `integrations/{provider}/`

2. **Update this README** with links to new docs

3. **Follow naming conventions:**
   - Feature completion: `{FEATURE}_COMPLETE.md`
   - Guides: `{TOPIC}.md` or `{TOPIC}_GUIDE.md`
   - Architecture: `{CONCEPT}_ARCHITECTURE.md`

4. **Include context:**
   - Date completed
   - Problem solved
   - Solution implemented
   - Related files/PRs

---

## 🔗 External Links

- **Production:** https://stratiri.vercel.app
- **Supabase Dashboard:** https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik
- **GitHub:** https://github.com/scottystephens/stratiri (update with actual URL)

---

**Last Updated:** November 23, 2025  
**Current Version:** 1.0 (Production)  
**Status:** ✅ Active Development
