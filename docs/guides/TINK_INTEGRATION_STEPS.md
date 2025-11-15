# Tink Integration - Step-by-Step Guide

## Overview

This guide walks you through integrating Tink as a banking aggregation provider for Stratifi. Tink provides access to 3,500+ European banks through a single API.

---

## Step 1: Get Tink API Credentials

### 1.1 Sign Up for Tink
1. Go to https://tink.com
2. Click "Get Started" or "Sign Up"
3. Create a developer account
4. Complete the onboarding process

### 1.2 Create an Application
1. Log into Tink Console (https://console.tink.com)
2. Create a new application
3. Note down:
   - **Client ID**
   - **Client Secret**
   - **Redirect URI** (set to: `https://yourdomain.com/api/banking/tink/callback`)

### 1.3 Configure OAuth Settings
- Set redirect URI: `https://stratifi-pi.vercel.app/api/banking/tink/callback`
- Select scopes: `accounts:read`, `transactions:read`
- Save configuration

---

## Step 2: Set Up Environment Variables

Add to `.env.local` and Vercel:

```bash
# Tink OAuth Configuration
TINK_CLIENT_ID=your_client_id_here
TINK_CLIENT_SECRET=your_client_secret_here
TINK_REDIRECT_URI=https://stratifi-pi.vercel.app/api/banking/tink/callback

# Tink API URLs (usually these defaults)
TINK_API_BASE_URL=https://api.tink.com
TINK_OAUTH_AUTHORIZE_URL=https://link.tink.com/1.0/authorize
TINK_OAUTH_TOKEN_URL=https://api.tink.com/api/v1/oauth/token
```

---

## Step 3: Create Tink Client Library

**File:** `lib/tink-client.ts`

This will handle:
- OAuth token exchange
- API requests to Tink
- Data normalization

---

## Step 4: Create TinkProvider Class

**File:** `lib/banking-providers/tink-provider.ts`

This implements the `BankingProvider` interface:
- OAuth flow
- Account fetching
- Transaction fetching
- Token refresh

---

## Step 5: Register Tink Provider

**File:** `lib/banking-providers/provider-registry.ts`

Add Tink to the registry so it's available in the UI.

---

## Step 6: Create API Routes

**Files:**
- `app/api/banking/tink/authorize/route.ts` - Initiate OAuth
- `app/api/banking/tink/callback/route.ts` - Handle OAuth callback

These use the generic banking provider system.

---

## Step 7: Test Integration

1. Start dev server: `npm run dev`
2. Go to `/connections/new`
3. Select "Tink" as provider
4. Connect a test bank account
5. Verify accounts sync correctly

---

## Step 8: Deploy to Production

1. Add environment variables to Vercel
2. Deploy: `git push origin main`
3. Test with real bank accounts
4. Monitor for errors

---

## Next Steps After Implementation

- Add Tink logo to `/public/logos/tink.svg`
- Update UI to show Tink as an option
- Test with multiple banks (Bunq, ING, etc.)
- Monitor usage and costs

---

Let's start implementing!

