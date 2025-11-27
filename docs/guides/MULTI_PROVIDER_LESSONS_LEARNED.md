# Multi-Provider Banking Integration: Lessons Learned

## Overview

This document captures key lessons learned while implementing multiple banking provider integrations (Tink, Plaid) in Stratiri. These lessons are critical for future provider integrations and system maintenance.

---

## Critical Lesson: Database Referential Integrity

### The Problem

When implementing Plaid, we encountered this error:
```
insert or update on table "provider_tokens" violates foreign key constraint "provider_tokens_provider_id_fkey"
Key (provider_id)=(plaid) is not present in table "banking_providers".
```

### Root Cause

The `provider_tokens` table has a foreign key constraint:
```sql
CREATE TABLE provider_tokens (
  provider_id TEXT NOT NULL REFERENCES banking_providers(id) ON DELETE CASCADE,
  ...
);
```

We registered Plaid in **code** (`provider-registry.ts`) but **not in the database** (`banking_providers` table).

### Why This Happened

1. **Two-Layer Architecture**: Providers must be registered in:
   - **Application layer**: `lib/banking-providers/provider-registry.ts`
   - **Database layer**: `banking_providers` table

2. **Assumption**: We assumed code registration was sufficient
3. **Oversight**: Migration 07 only seeded Bunq and Tink

### The Fix

Created a utility script to register providers in the database:
```bash
npx tsx scripts/utilities/add-plaid-provider.ts
```

And a SQL migration for documentation:
```sql
-- scripts/migrations/15-add-plaid-provider.sql
INSERT INTO banking_providers (id, display_name, ...) VALUES ('plaid', ...);
```

### Lesson

**ALWAYS register new banking providers in BOTH places:**

1. **Code**: `lib/banking-providers/provider-registry.ts`
```typescript
this.registerProvider({
  providerId: 'plaid',
  displayName: 'Plaid (Global Banks)',
  factory: () => plaidProvider,
  enabled: true,
  requiredEnvVars: ['PLAID_CLIENT_ID', 'PLAID_SECRET'],
});
```

2. **Database**: Run registration script or SQL
```bash
npx tsx scripts/utilities/add-[provider]-provider.ts
```

---

## Environment Variables: The Newline Problem

### The Problem

```
Error: Invalid character in header content ["PLAID-CLIENT-ID"]
```

Environment variables contained newline characters (`\n`) which broke HTTP headers.

### Root Cause

Using `echo` to pipe values:
```bash
# This adds \n at the end
echo "value" | vercel env add VAR_NAME production
```

The logs showed:
```javascript
{
  env: 'sandbox\n',        // ← Newline!
  products: [ 'transactions\n' ],  // ← Newline!
  countryCodes: [ 'US', 'CA\n' ]   // ← Newline!
}
```

### The Fix

Use `printf` instead of `echo`:
```bash
# ✅ Correct
printf "sandbox" | vercel env add PLAID_ENV production
printf "6918ea73ca21950020011c9e" | vercel env add PLAID_CLIENT_ID production

# ❌ Wrong
echo "sandbox" | vercel env add PLAID_ENV production
```

### Lesson

**Shell commands matter**: `echo` adds newlines by default, `printf` doesn't.

**Testing**: Always verify environment variables after setting:
```bash
vercel env pull .env.verify
cat .env.verify  # Check for weird characters
rm .env.verify
```

---

## Provider Integration Types

### The Problem

We tried to use the same OAuth redirect flow for all providers, but Plaid uses Plaid Link (a client-side component).

### Solution

Added `integrationType` to `BankingProviderConfig`:
```typescript
export interface BankingProviderConfig {
  // ... other fields
  integrationType: 'redirect' | 'plaid_link';
}
```

This allows the authorize endpoint to return different responses:
- **redirect**: Returns `authorizationUrl` (standard OAuth)
- **plaid_link**: Returns `linkToken` (Plaid Link)

### Lesson

**Don't assume all providers work the same way**. Design for flexibility:
- Use configuration fields to specify behavior
- Check provider type before executing flow logic
- Allow providers to override default behavior

---

## Token Storage: One Source of Truth

### The Problem

Different parts of the codebase looked for tokens in different places:
- Some checked `connections.access_token`
- Some checked `provider_tokens.access_token`
- Inconsistency caused "token not found" errors

### Solution

**Standardize on `provider_tokens` table** for ALL provider OAuth flows:

```typescript
// Always store here
await supabase
  .from('provider_tokens')
  .upsert({
    connection_id,
    provider_id,
    access_token,
    refresh_token,
    // ... other fields
  });
```

### Lesson

**Consistency is key**: 
- Document where tokens are stored
- Use the same storage location for all providers
- Update existing providers to use standard location
- Make it explicit in code comments

---

## Testing Strategy

### What We Learned

1. **Local builds catch TypeScript errors** before deployment
```bash
npm run build  # Always run before deploying
```

2. **Direct API testing validates credentials** before integration
```bash
curl -X POST https://sandbox.plaid.com/link/token/create ...
```

3. **Vercel logs are invaluable** for production debugging
```bash
vercel logs stratiri.vercel.app --follow
```

4. **Enhanced logging helps** during integration phase
```typescript
console.log('💾 Storing token:', { connectionId, hasToken: !!token });
console.error('❌ Error:', { code: error.code, message: error.message });
```

### Recommended Testing Process

1. **Test API credentials** with curl
2. **Build locally** to catch type errors
3. **Test in dev environment** first
4. **Monitor logs** during first production test
5. **Add temporary debug logging** during integration
6. **Remove debug logging** once stable

---

## Database Migrations: Execution Methods

### Options for Running Migrations

#### Option 1: Supabase SQL Editor (Recommended for Schema)
```
1. Go to: https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new
2. Copy SQL from scripts/migrations/*.sql
3. Paste and click "Run"
```

#### Option 2: TypeScript Scripts (Recommended for Data)
```bash
npx tsx scripts/utilities/script-name.ts
```

**Best for**:
- Adding data to tables
- Running SELECT queries
- Programmatic operations

**Note**: Requires environment variables to be loaded:
```bash
export $(cat .env.local | grep -v '^#' | xargs)
```

#### Option 3: Supabase CLI (Currently Not Working)
```bash
# These don't work in current environment:
supabase db execute --file migration.sql  # Connection issues
psql $DATABASE_URL < migration.sql        # Authentication issues
```

### Lesson

**Use the right tool for the job**:
- Schema changes → SQL Editor
- Data operations → TypeScript scripts
- Bulk data → SQL Editor with COPY commands

---

## Provider Registration Checklist

When adding a new banking provider, ensure:

### Code Layer
- [ ] Create provider class in `lib/banking-providers/`
- [ ] Extend `BankingProvider` abstract class
- [ ] Implement all required methods
- [ ] Register in `provider-registry.ts`
- [ ] Add environment variables to `.env.local`
- [ ] Update TypeScript types if needed

### Database Layer
- [ ] **Create registration script** in `scripts/utilities/`
- [ ] **Run registration script** to add to `banking_providers`
- [ ] Verify provider exists: `SELECT * FROM banking_providers WHERE id = 'provider_name'`
- [ ] Create SQL migration for documentation

### Infrastructure Layer
- [ ] Add environment variables to Vercel production
- [ ] Use `printf` not `echo` for CLI
- [ ] Verify no newlines in variables
- [ ] Test credentials with direct API call

### Testing Layer
- [ ] Test locally with `npm run build`
- [ ] Test Link Token creation
- [ ] Test Token exchange
- [ ] Test account fetching
- [ ] Test transaction fetching
- [ ] Monitor Vercel logs during first production test

---

## Architecture Improvements for Future

### Suggestion 1: Auto-Sync Database Registration

Create a startup script that automatically syncs `provider-registry.ts` with `banking_providers` table:

```typescript
// On app startup
async function syncProviders() {
  const codeProviders = providerRegistry.getAllProviderMetadata();
  for (const provider of codeProviders) {
    await supabase
      .from('banking_providers')
      .upsert({ id: provider.providerId, ... });
  }
}
```

### Suggestion 2: Environment Variable Validation

Add a healthcheck endpoint that validates all required env vars:

```typescript
// GET /api/health/env
export async function GET() {
  const providers = getEnabledProviders();
  const results = providers.map(p => ({
    provider: p.config.providerId,
    configured: p.validateConfiguration()
  }));
  return NextResponse.json({ providers: results });
}
```

### Suggestion 3: Migration Automation

Consider using a migration tool like:
- Drizzle ORM
- Prisma
- Kysely

This would ensure database schema stays in sync with code.

---

## Quick Reference: Adding a New Provider

```bash
# 1. Create provider implementation
touch lib/banking-providers/new-provider.ts

# 2. Register in code
# Edit: lib/banking-providers/provider-registry.ts

# 3. Create database registration script
touch scripts/utilities/add-new-provider.ts

# 4. Run registration script
export $(cat .env.local | grep -v '^#' | xargs)
npx tsx scripts/utilities/add-new-provider.ts

# 5. Set environment variables (use printf!)
printf "client_id" | vercel env add NEW_PROVIDER_CLIENT_ID production
printf "secret" | vercel env add NEW_PROVIDER_SECRET production

# 6. Test locally
npm run build
npm run dev

# 7. Deploy
git add .
git commit -m "feat: add NewProvider integration"
git push

# 8. Monitor
vercel logs stratiri.vercel.app --follow
```

---

## Summary

### Key Takeaways

1. **Two-layer registration** is required (code + database)
2. **Environment variables** must be set carefully (use `printf`)
3. **Foreign key constraints** enforce data integrity (good!)
4. **Test extensively** before production
5. **Monitor logs** during initial deployment
6. **Document everything** for future maintainers

### Time Investment

- Initial implementation: ~2 hours
- Debugging environment variables: ~30 minutes
- Debugging foreign key issue: ~20 minutes
- Documentation: ~30 minutes
- **Total**: ~3.5 hours

### Future Providers

With this infrastructure in place, adding future providers should take:
- **Simple provider** (standard OAuth): ~1 hour
- **Complex provider** (custom flow like Plaid): ~2 hours

---

**Document Version**: 1.0  
**Last Updated**: November 21, 2025  
**Authors**: Stratiri Engineering Team

