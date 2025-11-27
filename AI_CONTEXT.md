# Stratiri - AI Context & Development Guide

**Current Date:** November 2025
**Production URL:** https://stratiri.vercel.app
**Supabase Project:** `vnuithaqtpgbwmdvtxik`

## Repository Overview

Stratiri is a multi-tenant SaaS platform for intelligent treasury management. This repository contains the Next.js frontend, Supabase backend definitions, and infrastructure configuration.

### Key Technologies
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui.
- **Backend:** Supabase (PostgreSQL, Auth, RLS), Next.js API Routes.
- **Infrastructure:** Vercel (Hosting), Supabase (Database).
- **Integrations:** Plaid (US/EU), Tink (EU), Bunq (Direct), Xero (Accounting), Google Gemini (AI).
- **CLI Tools:** Supabase CLI, Vercel CLI, Google Cloud SDK (`gcloud`).

## File Structure

- `app/`: Next.js App Router pages and API routes.
- `components/`: Reusable UI components.
- `lib/`: Core logic, utilities, and provider implementations.
- `scripts/`: Database migrations and utility scripts.
  - `scripts/migrations/`: **Source of Truth** for database schema changes.
  - `scripts/utilities/`: TypeScript scripts for data manipulation and maintenance.
- `supabase/`: Generated Supabase configuration.
  - `supabase/migrations/`: History of applied migrations (generated from `scripts/migrations/`).
- `docs/`: Project documentation.
  - `docs/migrations/MIGRATIONS_LIST.md`: Master list of database changes.

## Database Management

**CRITICAL:** The database schema is managed via `scripts/migrations/`, NOT direct SQL editor or `supabase/migrations/` manual edits.

### Workflow
1. Create a new SQL file in `scripts/migrations/` (e.g., `52-add-feature.sql`).
2. Run the migration CLI tool:
   ```bash
   npx tsx scripts/utilities/run-migration-cli.ts scripts/migrations/52-add-feature.sql
   ```
   *This script copies the file to `supabase/migrations/` with a timestamp and pushes it to the remote database.*

### Schema Reference
- **Tables:** See `scripts/migrations/01-create-base-tables.sql` for core structure.
- **Multi-tenancy:** Enforced via `tenant_id` column and RLS policies (see `02-setup-multi-tenant.sql`).
- **Providers:** Banking data is stored in "Raw" tables (`plaid_transactions`, `tink_transactions`) and normalized into `transactions` table.

## Development Guidelines

1. **Multi-Tenancy:** Always include `tenant_id` in queries for tenant-scoped tables. Use `useTenant()` hook on client.
2. **Type Safety:** Use strict TypeScript. Avoid `any`.
3. **Environment:** Use `.env.local` for secrets. Never commit credentials.
4. **Documentation:** Update `docs/` when changing architecture.

## Important Documentation Links
- **Migration History:** `docs/migrations/MIGRATIONS_LIST.md`
- **Cursor Rules:** `.cursorrules` (or `docs/operations/CURSOR_RULES_SUPABASE_VERCEL.md`)
- **Database Setup:** `docs/guides/DATABASE_SETUP.md`
- **Google Cloud Setup:** `docs/guides/GOOGLE_CLOUD_SETUP.md`


