# Database Migrations Documentation

This directory contains documentation about database migrations for Stratiri.

---

## 📋 Key Documents

### [MIGRATIONS_LIST.md](MIGRATIONS_LIST.md) ⭐
**Complete list of all database migrations** with execution order, status, and descriptions.

**Use this for:**
- Understanding migration history
- Checking what migrations have been executed
- Planning new migrations
- Rollback procedures

---

## 🗄️ Migration Files

All actual migration SQL files are located in:
```
/scripts/migrations/
```

See [scripts/README.md](../../scripts/README.md) for how to run migrations.

---

## 📊 Current Status

- **Total Migrations:** 38+ (and counting)
- **Latest Migration:** 38-create-direct-bank-docs.sql
- **Tables Created:** 40+ tables
- **RLS Policies:** 100+ policies
- **Indexes:** 200+ indexes

---

## 🔄 Migration Execution

### Preferred Method: Supabase CLI
```bash
cd /Users/scottstephens/stratiri && npx tsx scripts/utilities/run-migration-cli.ts scripts/migrations/XX-name.sql
```

### Alternative: SQL Editor
1. Open: https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new
2. Copy migration SQL
3. Paste and run

See [Operations Runbook](../operations/CURSOR_SUPABASE_VERCEL_RUNBOOK.md) for detailed instructions.

---

## 📚 Related Documentation

- [Database Setup Guide](../guides/DATABASE_SETUP.md)
- [Operations Runbook](../operations/CURSOR_SUPABASE_VERCEL_RUNBOOK.md)
- [Supabase CLI Setup](../guides/SUPABASE_CLI_SETUP.md)
- [Plaid Optimization](../features/plaid/PLAID_OPTIMIZATION_COMPLETE.md)
- [Tink Storage Implementation](../features/tink/TINK_STORAGE_IMPLEMENTATION.md)

---

## 🏗️ Architecture Patterns

### Two-Layer Storage (Provider Data)
```
Provider API → Raw Provider Tables → Normalized App Tables
```

**Benefits:**
- Complete data preservation
- Audit trail for compliance
- Provider-specific fields accessible
- Easy to add new providers

---

**Last Updated:** November 23, 2025  
**For Questions:** See [MIGRATIONS_LIST.md](MIGRATIONS_LIST.md)

