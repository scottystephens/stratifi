# Cursor Rules: Supabase & Vercel CLI Usage

Add these rules to your `.cursorrules` file:

---

## Supabase Operations

### Running Migrations (Preferred Method)
Always use Supabase CLI via npx - it works without installation and bypasses DNS issues:

```bash
# Run a migration
cd /Users/scottstephens/stratifi && npx tsx scripts/utilities/run-migration-cli.ts scripts/migrations/XX-name.sql

# Link to project (if needed)
cd /Users/scottstephens/stratifi && npx supabase link --project-ref vnuithaqtpgbwmdvtxik
```

**Key Points:**
- ✅ Use `npx supabase` (no global install needed)
- ✅ Helper script handles migration copying and naming automatically
- ✅ Fully automated with `--yes` flag
- ❌ Don't use `psql` - DNS resolution fails in this environment

### Database Queries
Use TypeScript with Supabase client for queries:
```bash
cd /Users/scottstephens/stratifi && npx tsx -e "import { createClient } from '@supabase/supabase-js'; ..."
```

Or use the existing `exec_sql` RPC function via `scripts/utilities/run-migration.ts` for raw SQL.

---

## Vercel Operations

### Deployments
```bash
# Production deployment
cd /Users/scottstephens/stratifi && vercel --prod

# Preview deployment
cd /Users/scottstephens/stratifi && vercel

# View logs
cd /Users/scottstephens/stratifi && vercel logs stratiri.vercel.app --since 1h
```

### Environment Variables
```bash
# Pull env vars to local
cd /Users/scottstephens/stratifi && vercel env pull .env.local

# List production vars
cd /Users/scottstephens/stratifi && vercel env ls production
```

---

## General Rules

1. **Always cd first:** Start commands with `cd /Users/scottstephens/stratifi &&`
2. **Use absolute paths** when possible
3. **Load env vars:** Use `source .env.local` if needed for scripts
4. **Reference:** Full details in `docs/CURSOR_SUPABASE_VERCEL_RUNBOOK.md`

---

**Quick Reference:**
- Supabase migrations: `npx tsx scripts/utilities/run-migration-cli.ts scripts/migrations/XX-name.sql`
- Vercel deploy: `vercel --prod`
- Supabase project: `vnuithaqtpgbwmdvtxik`
- Production URL: `stratiri.vercel.app`

