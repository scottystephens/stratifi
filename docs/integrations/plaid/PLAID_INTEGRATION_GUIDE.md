# Plaid Integration Guide

## Overview

This guide documents the complete Plaid integration for Stratifi, including setup, architecture, troubleshooting, and lessons learned during implementation.

## Table of Contents

1. [Plaid Overview](#plaid-overview)
2. [Architecture](#architecture)
3. [Setup Instructions](#setup-instructions)
4. [Implementation Details](#implementation-details)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)
7. [Lessons Learned](#lessons-learned)

---

## Plaid Overview

**Plaid** is a financial technology platform that enables applications to connect with users' bank accounts. Unlike traditional OAuth providers, Plaid uses a proprietary client-side component called **Plaid Link** for authentication.

### Key Differences from Standard OAuth

- **Plaid Link**: Client-side modal/iframe that handles bank authentication
- **Link Token**: Server creates a one-time token for initializing Link
- **Public Token**: Client receives after successful authentication
- **Access Token**: Server exchanges public token for permanent access token
- **Item ID**: Plaid's equivalent of a refresh token (but tokens don't expire)

### Supported Coverage

- **19 Countries**: US, CA, GB, IE, FR, ES, NL, DE, IT, PL, BE, AT, DK, FI, NO, SE, EE, LT, LV
- **Products**: Transactions, Auth, Balance, Identity, and more
- **Thousands of Banks**: Including all major banks in supported countries

---

## Architecture

### Integration Flow

```
1. User clicks "Connect Plaid"
   ↓
2. Frontend calls POST /api/banking/plaid/authorize
   ↓
3. Server creates connection record & Link Token
   ↓
4. Frontend receives Link Token
   ↓
5. Plaid Link modal opens (using react-plaid-link)
   ↓
6. User authenticates with their bank
   ↓
7. Plaid Link returns Public Token
   ↓
8. Frontend calls POST /api/banking/plaid/exchange-token
   ↓
9. Server exchanges Public Token for Access Token
   ↓
10. Server stores token in provider_tokens table
   ↓
11. Server triggers background sync (accounts & transactions)
   ↓
12. User redirected to connection detail page
```

### Database Schema

Plaid integration uses the existing multi-provider schema:

#### `banking_providers` Table
```sql
id: 'plaid'
display_name: 'Plaid (Global Banks)'
auth_type: 'oauth'
supported_countries: [Array of 19 country codes]
config: {
  integration_type: 'plaid_link',
  products: ['transactions'],
  sandbox_enabled: true
}
```

#### `provider_tokens` Table
```sql
provider_id: 'plaid'
access_token: <Plaid access_token>
refresh_token: <Plaid item_id>
expires_at: NULL  -- Plaid tokens don't expire
```

#### `provider_accounts` & `provider_transactions`
Standard provider tables for synced data.

---

## Setup Instructions

### 1. Get Plaid Credentials

**Sandbox (for development)**:
- Sign up at https://dashboard.plaid.com/signup
- Create a new app
- Get credentials from Keys page

**Production**:
- Complete Plaid's production application process
- Production keys are separate from sandbox

### 2. Environment Variables

Add to `.env.local` (development) and Vercel (production):

```bash
# Plaid Credentials
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox  # or 'production'

# Configuration
PLAID_PRODUCTS=transactions
PLAID_COUNTRY_CODES=US,CA,GB,IE,FR,ES,NL,DE,IT,PL,BE,AT,DK,FI,NO,SE,EE,LT,LV

# Optional
PLAID_WEBHOOK_URL=https://yourdomain.com/api/webhooks/plaid
PLAID_REDIRECT_URI=https://yourdomain.com/api/banking/plaid/callback
```

**⚠️ IMPORTANT**: When setting environment variables via CLI, use `printf` NOT `echo` to avoid newline characters:

```bash
# ✅ Correct
printf "6918ea73ca21950020011c9e" | vercel env add PLAID_CLIENT_ID production

# ❌ Wrong (adds newline)
echo "6918ea73ca21950020011c9e" | vercel env add PLAID_CLIENT_ID production
```

### 3. Database Setup

**CRITICAL**: Plaid must be registered in the `banking_providers` table before it can be used.

Run this script:
```bash
cd /Users/scottstephens/stratifi
export $(cat .env.local | grep -v '^#' | xargs)
npx tsx scripts/utilities/add-plaid-provider.ts
```

Or manually run the SQL migration:
```sql
-- See: scripts/migrations/15-add-plaid-provider.sql
```

This is **required** because the `provider_tokens` table has a foreign key constraint on `provider_id`.

### 4. Dependencies

Already installed:
```json
{
  "plaid": "^39.1.0",
  "react-plaid-link": "^4.1.1"
}
```

---

## Implementation Details

### Backend Components

#### 1. `lib/plaid.ts`
Initializes the Plaid API client:
```typescript
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const configuration = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
      'Plaid-Version': '2020-09-14',
    },
  },
});

export const plaidClient = new PlaidApi(configuration);
```

#### 2. `lib/banking-providers/plaid-provider.ts`
Implements the `BankingProvider` interface:
- `createLinkToken()`: Generates Link token for frontend
- `exchangeCodeForToken()`: Exchanges public token for access token
- `fetchAccounts()`: Retrieves accounts via Plaid API
- `fetchTransactions()`: Retrieves transactions via Plaid API

#### 3. API Routes

**`/api/banking/plaid/authorize` (POST)**
- Creates connection record
- Generates Link token
- Returns token to frontend

**`/api/banking/plaid/exchange-token` (POST)**
- Receives public token from frontend
- Exchanges for access token
- Stores in `provider_tokens` table
- Triggers background sync
- Returns redirect URL

### Frontend Components

#### 1. `components/banking-provider-card.tsx`
Detects Plaid Link integration type and uses `usePlaidLink` hook:
```typescript
const { open, ready } = usePlaidLink({
  token: linkToken,
  onSuccess: (public_token, metadata) => {
    // Exchange token and redirect
  },
  onExit: (err) => {
    // Handle user exit
  }
});
```

### Data Mapping

#### Account Types
```typescript
Plaid → Stratifi
- depository/checking → checking
- depository/savings → savings
- credit → credit_card
- investment → investment
- loan → loan
```

#### Transaction Amounts
⚠️ **Important**: Plaid uses **opposite sign convention**:
- Positive amount = **expense/debit** (money out)
- Negative amount = **income/credit** (money in)

We multiply by `-1` to convert to standard accounting (positive = credit/deposit).

---

## Testing

### Sandbox Credentials

According to [Plaid's Transactions testing guide](https://plaid.com/docs/transactions/), use these test users:

#### For Testing Transactions (RECOMMENDED):
- **Username**: `user_transactions_dynamic`
- **Password**: Any non-blank password
- **Bank**: First Platypus Bank (`ins_109508`)
- **Features**:
  - 6 months of realistic, dynamic transaction data
  - Transactions update when calling `/transactions/refresh`
  - Supports recurring transactions
  - Can add custom transactions via `/sandbox/transactions/create`

#### Basic Testing (Limited Transactions):
- **Username**: `user_good`
- **Password**: `pass_good`
- **Note**: This user has minimal transaction data

#### Other Test Personas:
- `user_ewa_user` - Earned-wage access persona (3 months data)
- `user_yuppie` - Young affluent professional (3 months data)
- `user_small_business` - Small business persona (3 months data)

### Test Bank: "First Platypus Bank" (`ins_109508`)
- Multiple account types (checking, savings, credit, etc.)
- Dynamic transaction data
- All features enabled
- No OAuth required (easier testing)

### Important: Transaction Availability

⚠️ **Plaid Transaction Processing Delay**: Transactions are **NOT** immediately available after OAuth. This is expected Plaid behavior:

**API Response**:
```
error_code: 'PRODUCT_NOT_READY'
error_message: 'the requested product is not yet ready. please provide a webhook or try the request again later'
```

**Timeline**:
1. **Immediate**: Accounts are created with current balances
2. **30-60 seconds**: Initial transactions begin appearing
3. **2-5 minutes**: Full historical transactions available
4. **Webhook**: Plaid sends `INITIAL_UPDATE` when first batch ready
5. **Webhook**: Plaid sends `HISTORICAL_UPDATE` when all history loaded

**What you'll see in Stratifi**:
- ✅ Account appears immediately (e.g., "Plaid Checking")
- ✅ Current balance displayed
- ⏳ Transactions: "No transactions found - Try syncing"
- 🔄 Click "Sync Transactions" after 2-3 minutes
- ✅ Transactions will appear

**Current Implementation**:
- Uses `/transactions/sync` endpoint (Plaid's recommended approach)
- Gracefully handles `PRODUCT_NOT_READY` errors
- Returns empty array initially, allowing sync to complete successfully
- Subsequent syncs will fetch transactions once ready

**Why You're Not Seeing Transactions**:

1. **Using wrong test user**: `user_good` has minimal/no transaction data
   - ✅ **Solution**: Use `user_transactions_dynamic` instead
   
2. **Plaid processing delay**: Even with correct user, first sync returns 0 transactions
   - ✅ **Solution**: Wait 2-3 minutes, then click "Sync Transactions" on the account page
   
3. **Sandbox behavior**: Transactions aren't pre-populated like production banks
   - ✅ **Solution**: Use `user_transactions_dynamic` which has 6 months of dynamic data

**Step-by-Step to See Transactions**:
```
1. Delete existing Plaid connection (if using user_good)
2. Go to /connections/new
3. Click "Connect Plaid"
4. Select "First Platypus Bank" (ins_109508)
5. Username: user_transactions_dynamic
6. Password: test123 (any non-blank password)
7. Select accounts
8. Wait on connection page for 2-3 minutes
9. Click "Sync Transactions" button
10. Transactions should appear!
```

**Production Recommendation**:
Implement webhook endpoint at `/api/webhooks/plaid` to handle:
- `SYNC_UPDATES_AVAILABLE`: New transaction data ready
- `INITIAL_UPDATE`: First batch of transactions ready  
- `HISTORICAL_UPDATE`: All historical data loaded
- `DEFAULT_UPDATE`: New transactions available
- Auto-trigger sync when webhooks received

### Test Flow

1. Navigate to `/connections/new`
2. Click "Connect Plaid (Global Banks)"
3. Plaid Link modal opens
4. Select "First Platypus Bank"
5. Enter `user_good` / `pass_good`
6. Select accounts to connect
7. Click "Continue"
8. You'll be redirected to connection detail page
9. Background sync fetches accounts and transactions

---

## Troubleshooting

### Issue 1: "Invalid character in header content"

**Symptom**: 
```
Error: Invalid character in header content ["PLAID-CLIENT-ID"]
```

**Cause**: Environment variables contain newline characters (`\n`)

**Solution**: 
```bash
# Remove and re-add using printf
vercel env rm PLAID_CLIENT_ID production --yes
printf "your_client_id" | vercel env add PLAID_CLIENT_ID production
```

### Issue 2: "Foreign key constraint violation"

**Symptom**:
```
insert or update on table "provider_tokens" violates foreign key constraint "provider_tokens_provider_id_fkey"
Key (provider_id)=(plaid) is not present in table "banking_providers".
```

**Cause**: Plaid not registered in `banking_providers` table

**Solution**:
```bash
npx tsx scripts/utilities/add-plaid-provider.ts
```

### Issue 3: "OAuth token not found" after successful OAuth

**Symptom**: Token exchange succeeds but sync fails

**Cause**: Token not stored in `provider_tokens` table

**Solution**: Verify exchange-token route stores token with correct fields

### Issue 4: Tink tokens expiring

**Symptom**: Tink connections show "expired" status with no refresh token

**Cause**: Tink OAuth flow not requesting `offline_access` scope or not providing refresh token

**Solution**: 
- Check Tink OAuth scopes in authorization URL
- Implement automatic token refresh before expiry
- Add webhook handlers for token expiration events

---

## Lessons Learned

### 1. Foreign Key Constraints Matter

**What Happened**: When implementing Plaid, we assumed the code registration (`provider-registry.ts`) was sufficient. However, the database enforces referential integrity through foreign keys.

**Lesson**: Always ensure database-level registrations match code-level registrations for multi-provider systems.

**Solution**: Created `scripts/utilities/add-plaid-provider.ts` to programmatically register providers in the database.

### 2. Environment Variable Encoding

**What Happened**: Using `echo` to pipe values to `vercel env add` introduced newline characters that caused HTTP header validation errors.

**Lesson**: Always use `printf` (not `echo`) when setting environment variables programmatically.

**Fix**:
```bash
# Before (broken)
echo "value" | vercel env add VAR_NAME production

# After (works)
printf "value" | vercel env add VAR_NAME production
```

### 3. Plaid Link vs Standard OAuth

**What Happened**: Initial implementation tried to treat Plaid like a standard OAuth redirect flow.

**Lesson**: Plaid uses a hybrid approach:
- Frontend: Plaid Link component (modal/iframe)
- Backend: Link Token creation + Public Token exchange

**Solution**: Added `integrationType` field to `BankingProviderConfig` to support both flows.

### 4. Token Storage Architecture

**What Happened**: Different providers store tokens differently (some in `connections`, some in `provider_tokens`).

**Lesson**: Standardize on `provider_tokens` table for ALL providers to ensure sync consistency.

**Implementation**: All OAuth flows now store in `provider_tokens` with proper foreign key references.

### 5. Plaid API Version Header

**What Happened**: Initial implementation didn't include `Plaid-Version` header.

**Lesson**: Plaid requires API version header for all requests (even though SDK handles this internally).

**Fix**: Added `'Plaid-Version': '2020-09-14'` to configuration.

### 6. Testing is Essential

**What Happened**: Issues weren't discovered until production deployment.

**Lesson**: 
- Test with `npm run build` locally before deploying
- Use sandbox credentials extensively
- Monitor Vercel logs for detailed error messages
- Test API endpoints directly with curl when debugging

**Best Practice**:
```bash
# Verify API works before integrating
curl -X POST https://sandbox.plaid.com/link/token/create \
  -H 'Content-Type: application/json' \
  -H 'PLAID-CLIENT-ID: xxx' \
  -H 'PLAID-SECRET: yyy' \
  -d '{"client_name": "Test", ...}'
```

---

## Production Checklist

Before going live with Plaid:

- [ ] Get production credentials from Plaid dashboard
- [ ] Complete Plaid's production application process
- [ ] Set production environment variables in Vercel
- [ ] Update `PLAID_ENV=production`
- [ ] Test with real bank accounts (your own)
- [ ] Set up webhook endpoint for real-time updates
- [ ] Implement token refresh logic (if using products that expire)
- [ ] Monitor connection success rates
- [ ] Set up error alerting for failed syncs
- [ ] Document user-facing connection instructions
- [ ] Add Plaid branding/disclosure as per their requirements
- [ ] Implement Link customization (colors, logo)

---

## Additional Resources

- **Plaid Docs**: https://plaid.com/docs/
- **Plaid Quickstart**: https://plaid.com/docs/quickstart/
- **Link Best Practices**: https://plaid.com/docs/link/best-practices/
- **Node SDK**: https://github.com/plaid/plaid-node
- **React Link**: https://github.com/plaid/react-plaid-link
- **Coverage Explorer**: https://plaid.com/docs/institutions/

---

## Support

For issues:
1. Check Vercel logs for detailed errors
2. Verify environment variables are set correctly (no newlines!)
3. Ensure `banking_providers` table has Plaid entry
4. Test API endpoints directly with curl
5. Review Plaid's status page: https://status.plaid.com/

---

## Migration History

- **Migration 15**: Add Plaid to `banking_providers` table (REQUIRED)
- **Utility Script**: `scripts/utilities/add-plaid-provider.ts`

---

## Notes

- Plaid tokens don't expire like traditional OAuth tokens
- Item ID (stored in `refresh_token` field) is used for re-authentication if needed
- Plaid Link handles OAuth for institutions that require it
- Sandbox always uses `user_good`/`pass_good` credentials
- Production requires real bank credentials

---

**Last Updated**: November 21, 2025
**Integration Status**: ✅ Production Ready (Sandbox)
**Author**: Stratifi Engineering Team

