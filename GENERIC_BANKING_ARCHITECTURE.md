# Generic Banking Provider Architecture

## 🎯 Overview

Stratifi now has a **fully generic banking provider architecture** that makes it incredibly easy to add new banks, fintech APIs, and open banking connections. You can now integrate with:

- **Bunq** (Netherlands) ✅ Implemented
- **Plaid** (US/Canada) - Ready to implement
- **Nordigen** (EU Open Banking) - Ready to implement  
- **TrueLayer** (UK Open Banking) - Ready to implement
- **Any other banking API** - Just implement the interface!

## 🏗️ Architecture

### High-Level Structure

```
┌──────────────────────────────────────────────────┐
│         Provider Registry                        │
│  - Discovers all available providers             │
│  - Validates configuration                       │
│  - Returns enabled providers                     │
└──────────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┬──────────────┬───────────┐
        │                       │              │           │
┌───────▼────────┐    ┌────────▼──────┐  ┌───▼──────┐  ┌─▼──────┐
│ BankingProvider│    │ BankingProvider│  │ Banking  │  │ Banking│
│    Interface   │    │    Interface   │  │ Provider │  │Provider│
│                │    │                │  │ Interface│  │Interfac│
│   (Abstract)   │    │   (Abstract)   │  │          │  │   e    │
└────────────────┘    └────────────────┘  └──────────┘  └────────┘
        ▲                     ▲                 ▲            ▲
        │implements           │implements       │implements  │implements
        │                     │                 │            │
┌───────┴────────┐    ┌──────┴───────┐  ┌─────┴──────┐ ┌──┴────────┐
│ BunqProvider   │    │NordigenProv. │  │PlaidProv.  │ │YourProv.  │
│  (OAuth 2.0)   │    │(Open Banking)│  │(OAuth 2.0) │ │(Any Auth) │
└────────────────┘    └──────────────┘  └────────────┘ └───────────┘
```

### Data Flow

```
User Action
    ↓
┌───────────────────────────────────┐
│  Generic UI (Provider Agnostic)   │
│  - Shows all available providers  │
│  - One click to connect           │
└───────────────────────────────────┘
    ↓
┌───────────────────────────────────┐
│  Generic API Routes               │
│  /api/banking/[provider]/auth     │
│  /api/banking/[provider]/callback │
│  /api/banking/[provider]/sync     │
└───────────────────────────────────┘
    ↓
┌───────────────────────────────────┐
│  Provider Registry                │
│  - Gets correct provider          │
│  - Validates configuration        │
└───────────────────────────────────┘
    ↓
┌───────────────────────────────────┐
│  Specific Provider Implementation │
│  - Calls provider's API           │
│  - Maps to standard format        │
└───────────────────────────────────┘
    ↓
┌───────────────────────────────────┐
│  Generic Database Tables          │
│  - provider_tokens                │
│  - provider_accounts              │
│  - provider_transactions          │
└───────────────────────────────────┘
```

## 📁 File Structure

```
stratifi/
├── lib/banking-providers/
│   ├── base-provider.ts          # Abstract interface (all providers implement this)
│   ├── provider-registry.ts       # Central registry of all providers
│   ├── bunq-provider.ts          # Bunq implementation ✅
│   ├── plaid-provider.ts         # Plaid implementation (template)
│   ├── nordigen-provider.ts      # Nordigen implementation (template)
│   └── provider-template.ts      # Copy this to add new providers
│
├── app/api/banking/
│   ├── providers/route.ts        # GET - Lists all available providers
│   ├── [provider]/
│   │   ├── authorize/route.ts    # POST - Initiates OAuth for any provider
│   │   ├── callback/route.ts     # GET - Handles OAuth callback for any provider
│   │   └── sync/route.ts         # POST - Syncs accounts/transactions for any provider
│
├── components/
│   └── banking-provider-card.tsx  # Generic UI card for any provider
│
├── app/connections/new/
│   └── generic-page.tsx          # Dynamic page showing all providers
│
└── scripts/migrations/
    └── 07-add-generic-banking-providers.sql  # Generic database schema
```

## 🗄️ Database Schema

### Generic Tables (Work with ANY provider)

#### `banking_providers`
Registry of all available providers
- `id` - Provider ID ('bunq', 'plaid', 'nordigen')
- `display_name` - Name shown to users
- `auth_type` - 'oauth', 'api_key', or 'open_banking'
- `supported_countries` - Array of ISO codes
- `enabled` - Can be toggled on/off

#### `provider_tokens`
OAuth/API tokens for ALL providers
- `provider_id` - References banking_providers
- `access_token` - OAuth access token
- `refresh_token` - For token refresh
- `expires_at` - Token expiration
- `provider_user_id` - User ID in provider's system
- **Replaces bunq_oauth_tokens** (Bunq data auto-migrated)

#### `provider_accounts`
Accounts from ALL providers
- `provider_id` - References banking_providers
- `external_account_id` - Account ID in provider's system
- `account_id` - Links to Stratifi accounts table
- `currency`, `balance`, `iban`, etc.
- **Replaces bunq_accounts** (Bunq data auto-migrated)

#### `provider_transactions`
Transactions from ALL providers
- `provider_id` - References banking_providers
- `external_transaction_id` - Transaction ID in provider's system
- `import_status` - 'pending', 'imported', 'skipped', 'failed'
- **Replaces bunq_transactions_staging** (Bunq data auto-migrated)

## 🔌 Adding a New Provider

Adding a new bank takes just **4 steps**:

### Step 1: Create Provider Class (10 minutes)

```typescript
// lib/banking-providers/your-provider.ts
import { BankingProvider } from './base-provider';

export class YourProvider extends BankingProvider {
  config = {
    providerId: 'your_provider',
    displayName: 'Your Provider',
    logo: '/logos/your-provider.svg',
    color: '#0066CC',
    authType: 'oauth',
    supportedCountries: ['US', 'GB'],
    // ...
  };

  // Implement required methods:
  // - getAuthorizationUrl()
  // - exchangeCodeForToken()
  // - fetchAccounts()
  // - fetchTransactions()
  // - fetchUserInfo()
}
```

### Step 2: Register Provider (2 minutes)

```typescript
// lib/banking-providers/provider-registry.ts
this.registerProvider({
  providerId: 'your_provider',
  displayName: 'Your Provider',
  factory: () => new YourProvider(),
  enabled: true,
  requiredEnvVars: ['YOUR_PROVIDER_CLIENT_ID', 'YOUR_PROVIDER_SECRET'],
});
```

### Step 3: Add Environment Variables (1 minute)

```bash
# .env.local
YOUR_PROVIDER_CLIENT_ID=abc123
YOUR_PROVIDER_CLIENT_SECRET=xyz789
YOUR_PROVIDER_REDIRECT_URI=http://localhost:3000/api/banking/your_provider/callback
```

### Step 4: Add to Database (1 minute)

```sql
INSERT INTO banking_providers (id, display_name, auth_type, color, supported_countries)
VALUES ('your_provider', 'Your Provider', 'oauth', '#0066CC', ARRAY['US', 'GB']);
```

**That's it!** Your new provider automatically appears in the UI and works with all existing routes.

## ✨ Key Features

### 1. Provider Auto-Discovery
The UI automatically shows all enabled providers - no hardcoding needed!

### 2. Generic API Routes
One set of routes works for ALL providers:
- `/api/banking/bunq/authorize`
- `/api/banking/plaid/authorize`
- `/api/banking/nordigen/authorize`
- `/api/banking/[any-provider]/authorize`

### 3. Unified Data Model
All providers store data in the same tables, making queries simple.

### 4. Automatic Migration
Existing Bunq data was automatically migrated to generic tables.

### 5. Type Safety
Full TypeScript support with interfaces for all providers.

## 🎨 User Experience

### Before (Provider-Specific)
```
User → Select CSV or Bunq → Hard-coded options
```

### After (Generic)
```
User → See all banking providers dynamically → Click any to connect
```

### Dynamic Provider Cards
Each provider card shows:
- Provider logo and brand color
- Description
- Supported features
- Supported countries
- One-click connect button

## 🔒 Security

- **OAuth State Parameter** - CSRF protection for all providers
- **Token Encryption** - Access tokens stored securely
- **Row-Level Security** - Users only see their data
- **Automatic Token Refresh** - Handles expired tokens
- **Provider Validation** - Validates config before enabling

## 📊 Comparison

| Aspect | Before (Bunq-only) | After (Generic) |
|--------|-------------------|-----------------|
| **Providers** | 1 (Bunq) | Unlimited |
| **Add New Provider** | Days of work | ~15 minutes |
| **UI Updates** | Manual for each | Automatic |
| **API Routes** | Provider-specific | Generic + dynamic |
| **Database** | Provider-specific tables | Shared generic tables |
| **Code Reuse** | Low | High |
| **Maintenance** | High | Low |

## 🚀 Next Steps

### Ready-to-Implement Providers

1. **Plaid** (US/Canada)
   - Template: `lib/banking-providers/provider-template.ts`
   - Docs: https://plaid.com/docs/
   - Auth: OAuth 2.0
   - Estimated time: 30 minutes

2. **Nordigen** (EU Open Banking)
   - Template: `lib/banking-providers/provider-template.ts`
   - Docs: https://nordigen.com/en/docs/
   - Auth: OAuth 2.0
   - Estimated time: 30 minutes
   - Covers 2,300+ European banks!

3. **TrueLayer** (UK Open Banking)
   - Template: `lib/banking-providers/provider-template.ts`
   - Docs: https://docs.truelayer.com/
   - Auth: OAuth 2.0
   - Estimated time: 30 minutes

### Future Enhancements

- [ ] Scheduled automatic syncs
- [ ] Webhook support for real-time updates
- [ ] Provider health monitoring dashboard
- [ ] Multi-currency conversion
- [ ] Transaction categorization
- [ ] Payment initiation (where supported)

## 📚 Documentation

- **For Developers:** `docs/guides/ADDING_NEW_BANKING_PROVIDERS.md`
- **Provider Template:** `lib/banking-providers/provider-template.ts`
- **Architecture:** This file
- **Bunq Example:** `lib/banking-providers/bunq-provider.ts`

## 🎯 Benefits

### For Development
✅ Add new providers in minutes, not days  
✅ One codebase supports all providers  
✅ Type-safe with full TypeScript support  
✅ Easy to test and maintain  

### For Users
✅ More banking options  
✅ Consistent experience across all providers  
✅ One-click connections  
✅ Automatic sync  

### For Business
✅ Faster time to market  
✅ Easy to expand to new markets  
✅ Competitive advantage  
✅ Scalable architecture  

## 💡 Example: Adding Plaid in 15 Minutes

```typescript
// 1. Create plaid-provider.ts (10 mins)
export class PlaidProvider extends BankingProvider {
  config = { providerId: 'plaid', displayName: 'Plaid', /*...*/ };
  
  getAuthorizationUrl(state) {
    return `https://cdn.plaid.com/link/v2/stable/link-initialize.html?...`;
  }
  
  async exchangeCodeForToken(code) {
    const response = await fetch('https://sandbox.plaid.com/item/public_token/exchange', {/*...*/});
    return { accessToken: response.access_token, /*...*/ };
  }
  
  async fetchAccounts(credentials) {
    const response = await fetch('https://sandbox.plaid.com/accounts/get', {/*...*/});
    return response.accounts.map(a => ({/*...*/}));
  }
  
  async fetchTransactions(credentials, accountId, options) {
    const response = await fetch('https://sandbox.plaid.com/transactions/get', {/*...*/});
    return response.transactions.map(tx => ({/*...*/}));
  }
}

// 2. Register in provider-registry.ts (1 min)
this.registerProvider({
  providerId: 'plaid',
  displayName: 'Plaid',
  factory: () => new PlaidProvider(),
  enabled: true,
  requiredEnvVars: ['PLAID_CLIENT_ID', 'PLAID_SECRET'],
});

// 3. Add env vars (1 min)
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox

// 4. Add to database (1 min)
INSERT INTO banking_providers (id, display_name, auth_type, supported_countries)
VALUES ('plaid', 'Plaid', 'oauth', ARRAY['US', 'CA']);

// Done! Plaid now appears in the UI and works!
```

---

**The generic architecture is complete and production-ready!** You can now add as many banking providers as you need with minimal effort.

