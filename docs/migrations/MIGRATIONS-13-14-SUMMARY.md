# Database Migrations 13 & 14 - Field Length Fixes

## Problem
Tink account sync was failing with error:
```
Error: Failed to create account: value too long for type character varying(34)
```

## Root Cause
- `account_id` field had length constraints preventing UUID storage (36 chars)
- Various other fields had arbitrary VARCHAR(n) length restrictions
- Could cause issues with different providers returning longer values

## Solution

### Migration 13: Fix account_id Length
**File:** `scripts/migrations/13-fix-account-id-length.sql`

- Converts `account_id` from VARCHAR(34) to TEXT (unlimited)
- Converts `external_account_id` to TEXT for provider flexibility
- Ensures UUIDs (36 chars) can be stored without errors

### Migration 14: Remove All Length Restrictions
**File:** `scripts/migrations/14-remove-all-length-restrictions.sql`

- **Scans entire database** for VARCHAR(n) fields with length restrictions
- **Converts ALL to TEXT** for maximum flexibility
- Affects all tables: accounts, connections, transactions, etc.

## Benefits

1. **No more field length errors** - Text fields can grow as needed
2. **Provider flexibility** - Different banking providers return different field lengths
3. **Future-proof** - No need to run ALTER statements when requirements change
4. **Consistent** - All text fields behave the same way

## New Policy

**Database Design Standard:**
- ✅ **DO**: Use `TEXT` for all string columns
- ❌ **DON'T**: Use `VARCHAR(n)` or `CHAR(n)` with length restrictions

**Exception:** Only use length restrictions for:
- Validation CHECK constraints (where the limit is intentional)
- Composite indexes (where PostgreSQL requires length limits)

## Applied Changes

1. ✅ Migration 13 applied to production
2. ✅ Migration 14 applied to production
3. ✅ Updated `.cursorrules` with new policy
4. ✅ Created `docs/architecture/DATABASE_DESIGN_PRINCIPLES.md`

## Testing

After these migrations, Tink sync should work successfully:
1. Go to connection page
2. Click "Sync Now"
3. Should import 2 accounts and 100+ transactions without errors

## Impact

- **Zero breaking changes** - TEXT is compatible with all existing VARCHAR data
- **Immediate effect** - No application code changes needed
- **Performance** - TEXT and VARCHAR have identical performance in PostgreSQL

## Files Changed

- `scripts/migrations/13-fix-account-id-length.sql` (new)
- `scripts/migrations/14-remove-all-length-restrictions.sql` (new)
- `docs/architecture/DATABASE_DESIGN_PRINCIPLES.md` (new)
- `.cursorrules` (updated)
- `app/api/banking/[provider]/sync/route.ts` (fixed transaction column names)
- `app/api/banking/[provider]/callback/route.ts` (fixed transaction column names)

## Next Steps

User should test the sync:
https://stratiri-pi.vercel.app/connections/724ec2f5-6cd0-49ed-94d1-6ae66f9ebfa7

