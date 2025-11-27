# Xero Integration Guide

## Overview

Stratiri now supports Xero integration, allowing users to connect their Xero accounting software to sync bank accounts and transactions automatically.

## Architecture

Xero follows Stratiri's standard banking provider architecture:

1. **XeroProvider** (`lib/banking-providers/xero-provider.ts`) - Handles OAuth and API communication
2. **Raw Storage** (`xero_accounts`, `xero_transactions` tables) - Stores complete JSONB API responses
3. **Normalization** (`NormalizationService`) - Transforms Xero data to Stratiri standard format
4. **Orchestration** - Universal `orchestrateSync` handles the complete flow

## Database Tables

### `xero_accounts`
Stores raw Xero account data in JSONB format:
- `account_id` - Xero AccountID (UUID)
- `xero_tenant_id` - Xero Organization ID (required for API calls)
- `raw_account_data` - Complete account object from Xero API
- Filtered to BANK type accounts only during normalization

### `xero_transactions`
Stores raw Xero bank transaction data:
- `transaction_id` - Xero BankTransactionID
- `account_id` - Which bank account the transaction belongs to
- `xero_tenant_id` - Xero Organization ID
- `raw_transaction_data` - Complete transaction object from Xero API

## OAuth Flow

### 1. Authorization Request
```typescript
// User clicks "Connect Xero" in Stratiri
POST /api/banking/xero/authorize
{
  tenantId: "tenant-123",
  connectionName: "My Xero Connection"
}

// Returns authorization URL
{
  authorizationUrl: "https://login.xero.com/identity/connect/authorize?..."
}
```

### 2. User Authorization
- User is redirected to Xero login
- User selects which Xero organization to connect
- Xero redirects back to Stratiri callback

### 3. Callback & Token Exchange
```typescript
GET /api/banking/xero/callback?code=xyz&state=abc

// Backend:
// 1. Exchanges code for access_token & refresh_token
// 2. Calls /connections to get xero-tenant-id
// 3. Stores tokens in provider_tokens table
// 4. Automatically syncs accounts and transactions
// 5. Redirects user to connection details page
```

## API Calls

### Fetch Connections (Xero Organizations)
```bash
GET https://api.xero.com/connections
Authorization: Bearer {access_token}

Response:
[
  {
    "tenantId": "abc-123-def-456",
    "tenantName": "Demo Company (US)",
    "tenantType": "ORGANISATION"
  }
]
```

### Fetch Accounts
```bash
GET https://api.xero.com/api.xro/2.0/Accounts
Authorization: Bearer {access_token}
Xero-Tenant-Id: abc-123-def-456

Response:
{
  "Accounts": [
    {
      "AccountID": "uuid",
      "Code": "090",
      "Name": "Business Bank Account",
      "Type": "BANK",
      "Status": "ACTIVE",
      "CurrencyCode": "USD"
    }
  ]
}
```

### Fetch Bank Transactions
```bash
GET https://api.xero.com/api.xro/2.0/BankTransactions
  ?where=BankAccount.AccountID=Guid("uuid")
Authorization: Bearer {access_token}
Xero-Tenant-Id: abc-123-def-456

Response:
{
  "BankTransactions": [
    {
      "BankTransactionID": "uuid",
      "Type": "RECEIVE",
      "Status": "AUTHORISED",
      "Total": 1500.00,
      "CurrencyCode": "USD",
      "Date": "2024-01-15",
      "Contact": {
        "Name": "Customer ABC"
      }
    }
  ]
}
```

## Data Mapping

### Account Type Mapping
| Xero Type | Xero Bank Account Type | Stratiri Type |
|-----------|------------------------|---------------|
| BANK | CREDITCARD | credit_card |
| BANK | SAVINGS | savings |
| BANK | (default) | checking |

### Transaction Type Mapping
| Xero Type | Stratiri Type | Amount Sign |
|-----------|---------------|-------------|
| RECEIVE | Credit | Positive |
| RECEIVE-OVERPAYMENT | Credit | Positive |
| SPEND | Debit | Negative |
| SPEND-OVERPAYMENT | Debit | Negative |

### Transaction Status Mapping
| Xero Status | Stratiri Status |
|-------------|-----------------|
| AUTHORISED | posted |
| SUBMITTED | pending |
| DELETED | (filtered out) |
| VOIDED | (filtered out) |

## Environment Variables

### Production
```bash
XERO_CLIENT_ID=D0A2ED5D847A49CEBD815C43A439192D
XERO_CLIENT_SECRET=7r1XePyS5lU_RSAB9taYLpyJo7arbrZi3eqGAZndn1Qzuv5c
XERO_REDIRECT_URI=https://stratiri.vercel.app/api/banking/xero/callback
```

### Development
```bash
XERO_CLIENT_ID=D0A2ED5D847A49CEBD815C43A439192D
XERO_CLIENT_SECRET=7r1XePyS5lU_RSAB9taYLpyJo7arbrZi3eqGAZndn1Qzuv5c
XERO_REDIRECT_URI=http://localhost:3000/api/banking/xero/callback
```

**Note:** You must add the localhost redirect URI to your Xero app configuration for local testing.

## Testing with Xero Demo Company

### 1. Create Xero Developer Account
1. Go to https://developer.xero.com/
2. Sign up or log in
3. Create a free Xero trial (includes demo company)

### 2. Configure Redirect URIs in Xero App
1. Go to https://developer.xero.com/app/manage
2. Select your app
3. Add redirect URIs:
   - Production: `https://stratiri.vercel.app/api/banking/xero/callback`
   - Development: `http://localhost:3000/api/banking/xero/callback`

### 3. Test OAuth Flow
```bash
# Start local dev server
npm run dev

# Navigate to:
http://localhost:3000/connections/new

# Click "Connect Xero"
# You'll be redirected to Xero login
# Select your demo company
# Approve access
# Redirected back to Stratiri with connection established
```

### 4. Verify Data Synced
```sql
-- Check raw Xero accounts
SELECT account_id, raw_account_data->>'Name' as name, raw_account_data->>'Type' as type
FROM xero_accounts;

-- Check raw Xero transactions
SELECT transaction_id, raw_transaction_data->>'Total' as amount, raw_transaction_data->>'Type' as type
FROM xero_transactions;

-- Check normalized accounts
SELECT account_id, account_name, account_type, currency
FROM accounts
WHERE connection_id = 'your-connection-id';

-- Check normalized transactions
SELECT transaction_id, description, amount, type, date
FROM transactions
WHERE connection_id = 'your-connection-id';
```

## Rate Limits

Xero API Rate Limits (Free Tier):
- **60 API calls per minute**
- **5,000 API calls per day**

Stratiri handles rate limiting by:
1. Batching requests where possible
2. Storing complete raw data to minimize re-fetching
3. Using incremental sync when supported

## Token Refresh

Xero access tokens expire after **30 minutes**. Refresh tokens are valid for **60 days**.

The system automatically refreshes tokens when:
- Access token is expired (based on `expires_at`)
- API call returns 401 Unauthorized

Refresh is handled in `XeroProvider.refreshAccessToken()`:
```typescript
async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  // POST to https://identity.xero.com/connect/token
  // grant_type=refresh_token
  // Returns new access_token and refresh_token
}
```

## Supported Countries

Xero is available in:
- 🇺🇸 United States
- 🇬🇧 United Kingdom
- 🇦🇺 Australia
- 🇳🇿 New Zealand
- 🇨🇦 Canada
- 🇿🇦 South Africa
- 🇮🇪 Ireland
- 🇸🇬 Singapore
- 🇭🇰 Hong Kong

## Troubleshooting

### "Xero tenant ID not found"
**Cause:** OAuth completed but `/connections` call failed  
**Fix:** Ensure `fetchUserInfo()` is called after token exchange and `xeroTenantId` is stored in `provider_metadata`

### "No bank accounts found"
**Cause:** Xero organization has no accounts with `Type: BANK`  
**Fix:** In Xero, go to Accounting → Chart of Accounts → Add a bank account

### "Failed to fetch transactions"
**Cause:** Invalid Xero-Tenant-Id header or expired token  
**Fix:** Check that `xero_tenant_id` is stored in database and token is valid

### "Redirect URI mismatch"
**Cause:** Callback URL doesn't match what's registered in Xero app  
**Fix:** Add the exact callback URL to Xero app configuration (case-sensitive, including trailing slashes)

## Future Enhancements

### Planned Features
- [ ] Webhook support for real-time updates
- [ ] Invoice sync (Accounts Receivable/Payable)
- [ ] Contact sync (customers/suppliers)
- [ ] Multi-organization support (switch between multiple Xero orgs)
- [ ] Bank reconciliation sync (mark transactions as reconciled in Xero)

### Advanced Use Cases
- **Accounting Integration:** Sync Stratiri forecasts back to Xero as journal entries
- **Multi-Currency:** Leverage Xero's multi-currency support for FX-heavy businesses
- **Reporting:** Use raw JSONB data for custom Xero-specific reports

## Architecture Benefits

### Why JSONB Storage?
1. **Future-Proof:** Auto-captures new fields Xero adds to API
2. **Analytics:** Query raw data for ML/analysis without API calls
3. **Debugging:** Full audit trail of API responses
4. **Flexibility:** Can add new normalized fields without re-fetching

### Example: Query Raw Xero Data
```sql
-- Find all transactions with specific line item codes
SELECT 
  transaction_id,
  raw_transaction_data->>'Total' as total,
  raw_transaction_data->'LineItems'->0->>'AccountCode' as account_code
FROM xero_transactions
WHERE raw_transaction_data->'LineItems'->0->>'AccountCode' = '400';

-- Analyze Xero contact frequency
SELECT 
  raw_transaction_data->'Contact'->>'Name' as contact_name,
  COUNT(*) as transaction_count,
  SUM((raw_transaction_data->>'Total')::numeric) as total_amount
FROM xero_transactions
GROUP BY contact_name
ORDER BY transaction_count DESC;
```

## Security Considerations

1. **Credentials:** Xero credentials stored securely in `provider_tokens` table with RLS
2. **Tenant Isolation:** `xero_tenant_id` ensures API calls target correct organization
3. **Token Storage:** Access tokens encrypted at rest (handled by Supabase)
4. **Scopes:** Only request minimum required permissions:
   - `offline_access` - Refresh tokens
   - `accounting.transactions.read` - Read bank transactions
   - `accounting.settings.read` - Read chart of accounts

## Deployment Checklist

- [x] Create Xero app at developer.xero.com
- [x] Add redirect URIs (production + development)
- [x] Store credentials in Vercel environment variables
- [x] Run migration `49-create-xero-storage.sql`
- [x] Deploy to production
- [ ] Test OAuth flow with demo company
- [ ] Monitor initial syncs for errors
- [ ] Document any Xero-specific edge cases

## Support

For Xero API issues:
- **Documentation:** https://developer.xero.com/documentation/api/accounting/overview
- **Support:** https://developer.xero.com/support

For Stratiri integration issues:
- Check logs: `vercel logs stratiri.vercel.app --since 1h`
- Query raw data: `SELECT * FROM xero_accounts LIMIT 10`
- Review provider config: `SELECT * FROM banking_providers WHERE id = 'xero'`

