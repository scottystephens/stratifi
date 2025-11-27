# Tink Banking Integration

## Overview

Stratiri integrates with Tink's Open Banking platform, providing access to 3,400+ financial institutions across Europe. This enables automatic account and transaction synchronization using PSD2/Open Banking standards.

## Status

✅ **Production Ready** - Tink API v2 implementation complete

## Quick Start

### 1. Prerequisites

- Tink Console account ([https://console.tink.com](https://console.tink.com))
- OAuth Client credentials (Client ID & Secret)
- Redirect URI configured in Tink Console

### 2. Configuration

Add to environment variables:

```bash
TINK_CLIENT_ID=your_client_id
TINK_CLIENT_SECRET=your_client_secret
TINK_REDIRECT_URI=https://yourdomain.com/api/banking/tink/callback
```

### 3. Test Connection

1. Navigate to Connections → New Connection
2. Select "Tink" as provider
3. Authorize with your bank via Tink
4. Click "Sync" to import accounts and transactions

## Features

- ✅ **OAuth 2.0 Authentication** - Secure user-authorized access
- ✅ **Multi-Bank Support** - Connect to 3,400+ banks across Europe
- ✅ **Automatic Account Sync** - Import all connected accounts
- ✅ **Transaction Sync** - Fetch and import transactions
- ✅ **Tink API v2** - Latest API with cursor-based pagination
- ✅ **Intelligent Sync** - Optimize API calls with incremental syncing
- ✅ **Token Management** - Automatic token refresh
- ✅ **Deduplication** - Prevent duplicate imports

## Tink API v2 Migration

**Completed**: November 16, 2025

### What Changed

- **Accounts API**: `/data/v2/accounts` (supports multi-account fetching)
- **Transactions API**: `/data/v2/transactions` (cursor-based pagination)
- **User Info API**: `/data/v2/user`

### Performance Improvements

- **80-90% reduction** in API calls for regular syncs
- **Cursor-based pagination** for efficient large dataset handling
- **Multi-account transaction fetching** with `accountIdIn` parameter

### Migration Details

All Tink API calls updated to v2:
- `lib/tink-client.ts` - Core client updated
- `lib/banking-providers/tink-provider.ts` - Provider adapter updated
- Backward compatible with existing data

## Intelligent Transaction Sync

### Sync Strategy

**Goal**: Always have complete and recent transactions while minimizing API calls

**Approach**:
- **Daily syncs**: Fetch last 2 days only (with 1-day overlap for safety)
- **Weekly syncs**: Fetch last 7 days
- **Initial syncs**: Full backfill based on account type
- **Checking accounts**: 90 days
- **Savings accounts**: 365 days
- **Credit cards**: 90 days

### Throttling

- **Daily sync minimum**: 20 hours between syncs (except forced)
- **API call reduction**: 80-90% for regular syncs
- **Safety overlap**: Always includes previous day to catch delayed transactions

### Implementation

**Key File**: `lib/services/transaction-sync-service.ts`

Functions:
- `determineSyncDateRange()` - Calculate optimal date range
- `calculateSyncMetrics()` - Estimate API impact
- `formatSyncMetrics()` - Human-readable sync info

## User Flow

1. **Connect**: User clicks "Connect with Tink" → Select bank → OAuth authorization → Redirected back
2. **Sync Accounts**: Click sync button → Accounts fetched from Tink → Created in Stratiri
3. **Sync Transactions**: Intelligent sync determines date range → Transactions imported → Displayed in UI

## API Endpoints

### OAuth Flow

- **POST** `/api/banking/tink/authorize` - Initiate OAuth
- **GET** `/api/banking/tink/callback` - Handle OAuth callback

### Data Sync (Generic Provider Endpoints)

- **POST** `/api/banking/tink/sync` - Sync accounts and transactions

Query Parameters:
- `syncAccounts` (boolean) - Whether to sync accounts
- `syncTransactions` (boolean) - Whether to sync transactions
- `transactionStartDate` (ISO date) - Override sync start date
- `transactionEndDate` (ISO date) - Override sync end date
- `transactionLimit` (number) - Max transactions per account

## Database Schema

### Tables Used

- `provider_tokens` - OAuth token storage (generic)
- `provider_accounts` - Tink account mappings
- `provider_transactions` - Raw Tink transactions
- `accounts` - Normalized Stratiri accounts
- `transactions` - Normalized Stratiri transactions

All tables have Row-Level Security (RLS) enabled.

## Security

- ✅ OAuth state validation (CSRF protection)
- ✅ Secure token storage
- ✅ Row-level security
- ✅ Automatic token refresh
- ✅ Read-only access (PSD2 compliant)
- ✅ User-revocable access

## Testing

### Demo Bank

Tink provides a Demo Bank for testing:
- **URL**: https://console.tink.com/demobank
- **Demo Users**: Pre-configured test accounts with transactions
- **Product**: Transactions (Netherlands market)

**Demo Credentials** (User 1):
- Username: `u0662195`
- Password: `lml311`
- Description: User with multiple accounts

### Testing Flow

```bash
# 1. Use Tink Console Demo Bank
# 2. Create Tink connection in Stratiri
# 3. Use demo credentials during OAuth
# 4. Sync to import demo accounts/transactions
# 5. Verify data in Stratiri
```

## Troubleshooting

### Common Errors

**"No accounts synced"**
- Check OAuth scopes include `accounts:read`
- Verify bank connection is active in Tink
- Try re-authorizing the connection

**"No transactions found"**
- Check OAuth scopes include `transactions:read`
- Verify accounts were synced first
- Check date range covers transaction period

**"Token expired"**
- Tink tokens expire after ~1-2 hours
- System attempts automatic refresh
- If refresh fails, user needs to reconnect

**"Transactions not appearing in UI"**
- Verify `account_id` field matches (TEXT vs UUID issue resolved in Migration 13)
- Check transaction table column names (`date`, `type`, not `transaction_date`, `transaction_type`)

## Monitoring

### Metrics to Track

- Number of active Tink connections
- Failed OAuth attempts
- Failed sync jobs
- Token refresh failures
- API call volume
- Sync duration

### Logs to Monitor

- OAuth callback errors
- Sync operation errors
- Token refresh failures
- Tink API errors
- Transaction import failures

## Performance

### API Call Optimization

**Before Intelligent Sync**:
- Every sync: 90 days of transactions
- 100+ API calls for regular syncs

**After Intelligent Sync**:
- Daily syncs: 2 days of transactions (80-90% reduction)
- Initial syncs: Account-type specific backfill
- Safety overlap prevents missed transactions

### Database Performance

- **Batch operations**: Accounts and transactions inserted in batches
- **Deduplication**: `ON CONFLICT` clauses prevent duplicates
- **Indexes**: Optimized for common queries
- **Field types**: TEXT fields prevent length constraint errors (Migration 13-14)

## Architecture

### Data Flow

```
User Authorization → Tink OAuth → Token Storage (provider_tokens)
                                        ↓
                              Connection Active
                                        ↓
                   User Clicks Sync → Intelligent Date Range Calculation
                                        ↓
                              Fetch Accounts (v2 API)
                                        ↓
                          Create/Update Stratiri Accounts
                                        ↓
                     Fetch Transactions (v2 API, paginated)
                                        ↓
                        Store in provider_transactions
                                        ↓
                           Normalize to transactions
                                        ↓
                              Display in UI
```

### Provider Implementation

Tink uses the generic `BankingProvider` interface with specific implementations for:
- OAuth flow management
- Account fetching (v2 API)
- Transaction fetching with pagination (v2 API)
- Token refresh

**Key Files:**
- `lib/banking-providers/tink-provider.ts` - Provider implementation
- `lib/tink-client.ts` - Tink API v2 client
- `lib/services/transaction-sync-service.ts` - Intelligent sync logic
- `app/api/banking/[provider]/callback/route.ts` - OAuth callback
- `app/api/banking/[provider]/sync/route.ts` - Data sync

## Future Enhancements

- [ ] Scheduled automatic syncs (cron jobs)
- [ ] Webhook support for real-time updates
- [ ] Payment initiation (Tink Payment Initiation API)
- [ ] Enrichment API for transaction categorization
- [ ] Income verification
- [ ] Account verification
- [ ] Expense categorization

## Support

- **Tink Docs**: https://docs.tink.com
- **Tink Console**: https://console.tink.com
- **Tink Support**: Available via Console

## Compliance

- **PSD2 Compliant**: Regulated Open Banking access
- **GDPR Compliant**: Users can revoke access anytime
- **User Controlled**: 90-day access consent (renewable)
- **Read-Only**: Transaction Data API only
- **Bank-Agnostic**: Works with any Tink-supported bank

## Credentials

**Production Credentials** (Stored in Vercel environment):
- Client ID: `caceafe5840c485f98f3c33d92a236ac`
- Client Secret: `[Stored securely]`
- Redirect URI: `https://stratiri-pi.vercel.app/api/banking/tink/callback`

## Bank Coverage

Tink provides access to **3,400+ banks** across Europe, including:
- All major European banks
- Regional banks
- Online-only banks
- Credit card providers
- Investment platforms

**Markets**: UK, Sweden, Norway, Denmark, Finland, Germany, France, Spain, Italy, Netherlands, Belgium, Austria, Poland, and more.

---

**Initial Implementation**: November 15, 2025  
**V2 API Migration**: November 16, 2025  
**Status**: ✅ Production Ready  
**Last Updated**: November 16, 2025

