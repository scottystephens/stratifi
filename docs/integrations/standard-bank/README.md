# Standard Bank (South Africa) – Direct Credential Flow

## 1. Why this exists
- Standard Bank&apos;s Business Online SA APIs (OneHub Marketplace) require customer-issued App IDs, client secrets, and subscription keys rather than Plaid/Tink OAuth links.
- Clients can now securely share those credentials inside Stratiri from the **Connections → New → Direct Bank APIs** section.
- Credentials are encrypted with AES-256-GCM using `CREDENTIAL_ENCRYPTION_KEY` before landing in Supabase, then scoped to each tenant via RLS.

## 2. Credential ingredients
Per the [Standard Bank OneHub API Marketplace](https://corporateandinvestment.standardbank.com/cib/global/products-and-services/onehub/api-marketplace) and Business Online SA documentation:

### Required Credentials:
- **App ID / Client ID** – Issued when a client registers their app on OneHub Marketplace.
- **Client Secret** – Paired with the App ID for OAuth 2.0 client credentials flow.
- **Subscription Key - Balance Enquiry** – Unique key for the Balance Enquiry API product. Used to fetch account balances.
- **Subscription Key - Statements/Transactions** – Unique key for the Statements/Transactions API product. Used to fetch transaction history.

### Optional Credentials:
- **Subscription Key - Payments** – Only required if initiating payments through Stratiri. Leave blank for read-only access.
- **Business Unit / Division ID** – Required for multi-entity business structures with multiple profiles.

**Important:** Standard Bank issues a **separate subscription key for each API product**. Each key must be included in API requests via the `Ocp-Apim-Subscription-Key` header. The correct key must be used for the corresponding API endpoint (balances vs. transactions).

## 3. Product flow in Stratiri
1. Tenant admin navigates to `Connections → New → Direct Bank APIs`.
2. They enter the fields above plus optional metadata (environment flag, notes).
3. API route `POST /api/banking/standard-bank/credentials`:
   - Verifies tenant membership + role.
   - Creates a `connections` row (`provider = standard_bank_sa`, `status = pending_setup`).
   - Encrypts and stores secrets in `banking_provider_credentials`.
4. Connection detail page will show as “Pending Direct API activation” until engineering completes the upstream integration.

## 4. Database artifacts
- Migration `37-create-banking-credentials.sql` adds `banking_provider_credentials` with RLS.
- Secrets live in `encrypted_credentials` as `iv:tag:ciphertext` (base64 parts). Use `lib/security/credential-vault.ts` to decrypt on the server when building the future Standard Bank sync service.

## 5. Operational checklist
- [ ] Set `CREDENTIAL_ENCRYPTION_KEY` (32-byte base64 or hex) locally and in every Vercel environment.
- [ ] Rotate the key if leaked; re-encrypt stored payloads via a maintenance script.
- [ ] Coordinate with clients to collect sandbox credentials first; toggle `environment` to “production” once live keys are ready.
- [ ] When the Standard Bank API client is ready, load credentials via the vault helper instead of reading JSON columns directly.

## 6. Next integration steps
- Build `lib/banking-providers/standard-bank-provider.ts` using Standard Bank&apos;s OAuth 2.0 client credentials + mutual TLS requirements.
- Implement job runners to exchange credentials for access tokens and fetch balances/statements.
- **Use the correct subscription key** for each API endpoint:
  - `subscriptionKeyBalances` → Balance Enquiry API
  - `subscriptionKeyTransactions` → Statements/Transactions API  
  - `subscriptionKeyPayments` → Payment Initiation API (if provided)
- Expose activity status on the connection detail page (success/failure of API calls).

## 7. Example: Using Multiple Subscription Keys

When implementing the Standard Bank API client, credentials will be structured as:

```typescript
{
  appId: 'sbx-app-12345',
  clientSecret: '***',
  subscriptionKeyBalances: 'abc123...',
  subscriptionKeyTransactions: 'def456...',
  subscriptionKeyPayments: 'ghi789...', // optional
  businessUnitId: 'BU-12345' // optional
}
```

Each API call must use the appropriate subscription key:

```typescript
// Fetching balances
const balancesResponse = await fetch(balanceApiUrl, {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Ocp-Apim-Subscription-Key': credentials.subscriptionKeyBalances
  }
});

// Fetching transactions
const transactionsResponse = await fetch(transactionsApiUrl, {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Ocp-Apim-Subscription-Key': credentials.subscriptionKeyTransactions
  }
});
```

