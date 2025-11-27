# Cursor Runbook: Supabase & Vercel from Cursor Chat

Guidance for Cursor automation agents on executing Supabase + Vercel workflows directly from chat-driven terminals.

---

## 1. Launching Shell Commands the Cursor Way

1. **Always cd first:**  
   ```bash
   cd /Users/scottstephens/stratifi && <command>
   ```
   The `run_terminal_cmd` shell persists, but start every new command with the project `cd` to avoid surprises.

2. **Use absolute paths:** They bypass shell state drift and satisfy repo guardrails.

3. **One command per request:** Chain with `&&` when order matters (e.g., `cd … && npm run build`).

4. **Background jobs:** Set `is_background: true` if a command intentionally runs long (dev server, watchers). Otherwise keep commands foregrounded so Cursor streams output back.

---

## 2. Supabase Operations from Chat

### 2.1 SQL migrations via `psql` (⚠️ DNS Issues - Use 2.2 Instead)

**Note:** `psql` currently fails with DNS resolution errors in this environment:
```
psql: error: could not translate host name "db.vnuithaqtpgbwmdvtxik.supabase.co" to address
```

**Use Supabase CLI method (2.2) instead for running migrations.**

If `psql` DNS issues are resolved in the future:
```bash
cd /Users/scottstephens/stratifi && \
source .env.local && \
psql "$DATABASE_URL" -f scripts/migrations/35-fix-tink-relationship.sql
```

- Make sure `.env.local` contains `DATABASE_URL`.  
- Use `psql "$DATABASE_URL" -c "<SQL>"` for quick checks (e.g., verifying tables).  
- If `psql` is missing: `command -v psql` to confirm, then install via `brew install postgresql`.

### 2.2 Supabase CLI via npx (✅ WORKING - Preferred Method)

**Supabase CLI works via `npx` without global installation:**

```bash
# Link to remote project (one-time setup)
cd /Users/scottstephens/stratifi && npx supabase link --project-ref vnuithaqtpgbwmdvtxik

# Run migrations using the helper script (recommended)
cd /Users/scottstephens/stratifi && npx tsx scripts/utilities/run-migration-cli.ts scripts/migrations/XX-migration-name.sql

# Or use db push directly (requires copying migrations to supabase/migrations/)
cd /Users/scottstephens/stratifi && npx supabase db push --linked --yes
```

**Key Points:**
- ✅ Works without Homebrew installation (uses `npx supabase`)
- ✅ No Xcode CLT issues - uses npm/npx infrastructure
- ✅ Helper script (`run-migration-cli.ts`) automatically handles migration copying and naming
- ✅ Fully automated with `--yes` flag (no prompts)
- ✅ Migrations are copied to `supabase/migrations/` with timestamp prefixes

**The helper script:**
- Copies migrations from `scripts/migrations/` to `supabase/migrations/` with proper naming
- Uses Supabase CLI's `db push` to apply migrations
- Keeps migration files for history (can be manually deleted if needed)

### 2.3 Data / utility scripts (service-role)

```bash
cd /Users/scottstephens/stratifi && \
npx tsx scripts/data-generation/create-test-accounts-v2.ts
```

- These rely on `lib/supabase.ts` (service key). Ensure `.env.local` is loaded or exported beforehand.  
- Great for backfills, verification scripts, or calling the `exec_sql` RPC once that function exists.

### 2.4 Browser fallback (when CLI access fails)

1. Open https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new  
2. Paste the SQL migration (e.g., from `scripts/migrations/*.sql`).  
3. Run and capture the success message back in chat.

---

## 3. Vercel CLI from Chat

### 3.1 Quick health check

```bash
cd /Users/scottstephens/stratifi && vercel whoami
```

- If unauthenticated, run `vercel login` and follow the emailed magic link.

### 3.2 Link the repo once per environment

```bash
cd /Users/scottstephens/stratifi && vercel link
```

- Choose the `scottstephens` scope, project `stratiri`.  
- After linking, subsequent deployments inherit settings automatically.

### 3.3 Deployments

```bash
# Preview
cd /Users/scottstephens/stratifi && vercel

# Production
cd /Users/scottstephens/stratifi && vercel --prod

# Force redeploy current code
cd /Users/scottstephens/stratifi && vercel --prod --force
```

Capture the deployment URL and share it back in the chat response.

### 3.4 Logs and diagnostics

```bash
cd /Users/scottstephens/stratifi && vercel logs stratiri.vercel.app --since 1h
```

- Use `--follow` for streaming logs (remember to set `is_background: true` if tailing).  
- `vercel inspect <deployment-url>` helps root-cause build failures when the web UI is unavailable.

### 3.5 Environment management

```bash
# Pull development env vars into .env.local
cd /Users/scottstephens/stratifi && vercel env pull .env.local

# List current production vars
cd /Users/scottstephens/stratifi && vercel env ls production
```

Never echo secrets in chat output—summarize instead.

---

## 4. Ready-to-run Checklist

1. ✅ **Supabase CLI:** Use `npx supabase` (no installation needed) - preferred method for migrations
2. ✅ **Migrations:** Use `npx tsx scripts/utilities/run-migration-cli.ts scripts/migrations/XX-name.sql` 
3. ✅ Confirm required binaries exist (`command -v vercel`, `npx supabase --version`).  
4. ✅ Load env vars (`source .env.local`) before DB or Supabase scripts (if needed).  
5. ✅ Use repository scripts for repetitive tasks (`npm run build`, `npx tsx …`).  
6. ✅ Report outputs succinctly—focus on success/failure, key warnings, and follow-up steps.  
7. ⚠️ If a tool is unavailable or blocked, state the limitation and fall back to documented alternatives (Supabase SQL Editor, Vercel dashboard).  
8. 📝 Reference this doc (`docs/CURSOR_SUPABASE_VERCEL_RUNBOOK.md`) in chat updates whenever running Supabase or Vercel workflows.

---

Keeping these steps in one reference ensures any Cursor automation agent can safely run infra workflows without leaving the chat interface.

