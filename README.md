# TreasuryX

A modern, production-ready **multi-tenant SaaS treasury management platform** for enterprise cash visibility, bank account management, and data ingestion.

[![Production](https://img.shields.io/badge/production-live-green)](https://treasuryx-pi.vercel.app)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 🎯 Overview

TreasuryX is a comprehensive treasury management system built for **multi-tenant SaaS** operations with:

- ✅ **Multi-tenant architecture** with row-level security
- ✅ **Bank account management** with 30+ industry-standard fields
- ✅ **CSV data ingestion** with flexible column mapping
- ✅ **Multi-currency support** (USD, EUR, GBP, etc.)
- ✅ **Transaction deduplication** and reconciliation
- ✅ **Full audit trail** for compliance
- ✅ **Extensible architecture** for BAI2, Plaid, bank APIs

---

## 🚀 Live Demo

**Production**: https://treasuryx-pi.vercel.app

**Test Credentials:**
```
Email:    test@treasuryx.com
Password: test123456
```

---

## ✨ Features

### 🏢 Multi-Tenant SaaS
- Organization management with role-based access (owner, admin, member)
- Tenant switcher for users with multiple organizations
- Complete tenant isolation via Row-Level Security (RLS)
- Team invitation and management

### 🏦 Account Management
- Comprehensive bank account tracking
- 30+ industry-standard fields (balances, limits, bank info)
- 10 custom fields per account (JSONB)
- Multi-currency support
- Account categorization (business unit, cost center, GL codes)
- Integration-ready (Plaid, external bank IDs)

### 📊 Data Ingestion
- **CSV import** with smart column mapping
- Auto-detect columns and suggest mappings
- Support for any CSV format
- Preview before importing
- Append or Override import modes
- Transaction deduplication
- Full import history with metrics

### 💰 Transaction Management
- Import from multiple sources (CSV, BAI2, APIs - CSV ready now)
- Link transactions to specific accounts
- Transaction categorization
- Audit trail (source, job ID, raw data preserved)
- Multi-currency transactions

### 📈 Exchange Rates
- Real-time exchange rates from Frankfurter.app
- Historical rate tracking
- Interactive charts and comparisons
- Multi-currency conversion

### 🎨 Modern UI
- Responsive design with Tailwind CSS
- Collapsible navigation sidebar
- Interactive charts (Recharts)
- Beautiful card-based layouts
- Real-time updates

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Icons**: Lucide React
- **State**: React Context API

### Backend
- **Database**: PostgreSQL (Supabase)
- **Authentication**: Supabase Auth
- **Authorization**: Row-Level Security (RLS)
- **File Parsing**: PapaParse (CSV)
- **API**: Next.js API Routes

### Infrastructure
- **Hosting**: Vercel
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage (ready)

---

## 📁 Project Structure

```
treasuryx/
├── app/                          # Next.js app directory
│   ├── accounts/                 # Account management module
│   │   ├── new/                  # Create new account
│   │   └── page.tsx              # Accounts list
│   ├── api/                      # API routes
│   │   ├── accounts/             # Account CRUD APIs
│   │   ├── connections/          # Connection management
│   │   └── ingestion/            # CSV import APIs
│   ├── connections/              # Data connection management
│   │   ├── new/                  # CSV import wizard
│   │   ├── [id]/history/         # Import history
│   │   └── page.tsx              # Connections list
│   ├── rates/                    # Exchange rates
│   ├── login/                    # Authentication
│   ├── signup/                   # User registration
│   ├── onboarding/               # New user onboarding
│   ├── settings/                 # Organization settings
│   └── team/                     # Team management
├── components/                   # Reusable components
│   ├── navigation.tsx            # Main navigation sidebar
│   ├── exchange-rate-charts.tsx  # Charts component
│   └── ui/                       # UI components (Card, Button, Badge)
├── lib/                          # Core library code
│   ├── supabase.ts               # Database operations (service role)
│   ├── supabase-client.ts        # Client-side Supabase
│   ├── supabase-server.ts        # Server-side Supabase (API routes)
│   ├── auth-context.tsx          # Authentication context
│   ├── tenant-context.tsx        # Tenant/organization context
│   └── parsers/                  # Data parsers
│       └── csv-parser.ts         # CSV parsing engine
├── scripts/                      # Database and utility scripts
│   ├── migrations/               # SQL migrations
│   ├── data-generation/          # Test data generation
│   └── utilities/                # Helper scripts
├── docs/                         # Documentation
│   ├── architecture/             # Architecture docs
│   └── guides/                   # Feature guides
└── data/                         # Data storage
    └── backups/                  # Bank statement backups
        └── bank-statements/      # Generated CSV files
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- npm or yarn
- Supabase account
- Vercel account (for deployment)

### 1. Clone and Install
```bash
git clone https://github.com/scottystephens/treasuryx.git
cd treasuryx
npm install
```

### 2. Environment Variables
Create `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Run Database Migrations
Run SQL files in `scripts/migrations/` in order (01-05) via [Supabase SQL Editor](https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new)

### 4. Generate Test Data
```bash
# Create test user
npx tsx scripts/data-generation/create-test-user.ts

# Create test organization
npx tsx scripts/data-generation/setup-test-user-org.ts

# Create test accounts
npx tsx scripts/data-generation/create-test-accounts-v2.ts

# Generate bank statements (2 years, 4 accounts, ~4,300 transactions)
npx tsx scripts/data-generation/generate-bank-statements.ts
```

### 5. Start Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📊 Test Data

### Generated Bank Statements
Located in `data/backups/bank-statements/`:

- **CHK-1001234567** - Main Checking (USD) - 1,056 transactions
- **CHK-2001234567** - Business Checking (USD) - 1,114 transactions
- **SAV-3001234567** - Savings (USD) - 1,091 transactions
- **CHK-4001234567** - EUR Operations (EUR) - 1,037 transactions

**Total**: ~4,300 realistic transactions spanning Jan 2023 - Jan 2025

Includes:
- Bi-weekly salary deposits
- Monthly recurring expenses (rent, utilities)
- Daily transactions (groceries, dining, gas)
- Transfers and fees
- Categories for reporting

### Test Accounts (Database)
- Main Operating Account (USD) - $125,000
- Savings Reserve Account (USD) - $500,000
- EUR Operations Account (EUR) - €75,000
- Business Credit Card (USD) - -$8,500

---

## 🔑 Key Workflows

### CSV Import Workflow
1. Navigate to `/connections/new`
2. Upload CSV bank statement
3. System auto-detects columns
4. Map columns to standard fields (date, amount, description)
5. Preview parsed transactions
6. Configure:
   - Connection name
   - Link to account (optional)
   - Import mode (append/override)
7. Import → Transactions saved to database
8. View import history and connection details

### Account Management
1. Navigate to `/accounts`
2. View all accounts with balances
3. Create new accounts with comprehensive fields
4. Add up to 10 custom fields per account
5. Link data imports to specific accounts

### Organization Management
1. User signs up → Creates first organization
2. Invite team members via `/team`
3. Assign roles (owner, admin, member)
4. Configure organization settings (currency, timezone)
5. Switch between organizations (sidebar dropdown)

---

## 🔒 Security

### Authentication
- Supabase Auth with email/password
- Session management via cookies
- Protected API routes

### Authorization
- Row-Level Security (RLS) policies on all tables
- Tenant-scoped data access
- Role-based permissions (owner, admin, member)
- Service role for admin operations

### Data Protection
- Tenant isolation via RLS
- Audit logging for all data operations
- Raw data preservation for compliance
- Encrypted credentials (production ready)

---

## 📚 Documentation

- **[Architecture Docs](./docs/architecture/)** - System design and decisions
- **[Feature Guides](./docs/guides/)** - How-to guides and documentation
- **[Scripts README](./scripts/README.md)** - Database and utility scripts

---

## 🚀 Deployment

### Production
Automatically deploys to Vercel from `main` branch:
```bash
git push origin main
```

Vercel: https://treasuryx-pi.vercel.app

### Environment Variables (Vercel)
Set in Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## 🛣️ Roadmap

### Phase 1: MVP ✅ Complete
- ✅ Multi-tenant architecture
- ✅ Authentication & authorization
- ✅ Account management
- ✅ CSV data ingestion
- ✅ Transaction import

### Phase 2: Advanced Integrations (Next)
- [ ] BAI2 file format parser
- [ ] Plaid API integration
- [ ] Direct bank API connections
- [ ] SFTP automation
- [ ] Scheduled imports

### Phase 3: Analytics & Reporting
- [ ] Cash flow forecasting
- [ ] Transaction categorization (ML)
- [ ] Custom dashboards
- [ ] Report builder
- [ ] Export capabilities

### Phase 4: Enterprise Features
- [ ] SSO integration
- [ ] Advanced reconciliation
- [ ] Approval workflows
- [ ] Account hierarchies
- [ ] White-label support

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🔗 Links

- **Production App**: https://treasuryx-pi.vercel.app
- **Supabase Dashboard**: https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik
- **GitHub**: https://github.com/scottystephens/treasuryx

---

## 📞 Support

For issues or questions:
- Check [documentation](./docs/)
- Review [scripts README](./scripts/README.md)
- Open a GitHub issue

---

**Built with ❤️ for modern treasury management**
