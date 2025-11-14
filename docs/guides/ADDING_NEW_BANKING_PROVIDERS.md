##Adding New Banking Providers

Complete guide for adding new banking integrations to Stratifi's generic provider system.

## Overview

Stratifi uses a generic banking provider architecture that makes it easy to add new banks, fintech APIs, and open banking connections. Each provider implements a standard interface, allowing the same code to work with multiple banking APIs.

## Architecture

```
┌─────────────────────────────────────┐
│   BankingProvider (Abstract Base)   │
│   - OAuth/Auth methods              │
│   - Account fetching               │
│   - Transaction syncing            │
│   - Standard interface             │
└─────────────────────────────────────┘
              ▲
              │ implements
              │
    ┌─────────┴───────────┬──────────────┐
    │                     │              │
┌───▼────┐         ┌──────▼───┐    ┌────▼─────┐
│  Bunq  │         │ Nordigen │    │  Plaid   │
│Provider│         │ Provider │    │ Provider │
└────────┘         └──────────┘    └──────────┘
```

## Step 1: Create Your Provider Class

### File Location
```
lib/banking-providers/your-provider-name.ts
```

### Template

```typescript
import {
  BankingProvider,
  BankingProviderConfig,
  OAuthTokens,
  ProviderAccount,
  ProviderTransaction,
  ConnectionCredentials,
} from './base-provider';

export class YourProviderName extends BankingProvider {
  config: BankingProviderConfig = {
    providerId: 'your_provider_id', // lowercase, no spaces
    displayName: 'Your Provider Name',
    logo: '/logos/your-provider.svg',
    color: '#0066CC', // Brand color
    description: 'Connect your accounts with Your Provider',
    authType: 'oauth', // or 'api_key' or 'open_banking'
    supportsSync: true,
    supportedCountries: ['US', 'GB', 'DE'], // ISO country codes
    website: 'https://yourprovider.com',
    documentationUrl: 'https://docs.yourprovider.com',
  };

  validateConfiguration(): boolean {
    // Check required environment variables
    return !!(
      process.env.YOUR_PROVIDER_CLIENT_ID &&
      process.env.YOUR_PROVIDER_CLIENT_SECRET
    );
  }

  // Implement all required methods...
  // See full template in lib/banking-providers/provider-template.ts
}

// Export singleton instance
export const yourProvider = new YourProviderName();
```

## Step 2: Implement Required Methods

### OAuth Methods (for OAuth providers)

```typescript
getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.YOUR_PROVIDER_CLIENT_ID!,
    redirect_uri: process.env.YOUR_PROVIDER_REDIRECT_URI!,
    state: state,
    response_type: 'code',
    scope: 'accounts transactions',
  });
  
  return `https://auth.yourprovider.com/oauth?${params.toString()}`;
}

async exchangeCodeForToken(code: string): Promise<OAuthTokens> {
  const response = await fetch('https://api.yourprovider.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: code,
      client_id: process.env.YOUR_PROVIDER_CLIENT_ID,
      client_secret: process.env.YOUR_PROVIDER_CLIENT_SECRET,
    }),
  });

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    tokenType: data.token_type,
  };
}

async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  // Similar to exchangeCodeForToken but with refresh_token grant
}
```

### Account Methods

```typescript
async fetchAccounts(credentials: ConnectionCredentials): Promise<ProviderAccount[]> {
  const response = await fetch('https://api.yourprovider.com/accounts', {
    headers: {
      'Authorization': `Bearer ${credentials.tokens.accessToken}`,
    },
  });

  const data = await response.json();

  return data.accounts.map((account: any) => ({
    externalAccountId: account.id,
    accountName: account.name,
    accountNumber: account.account_number,
    accountType: this.mapAccountType(account.type),
    currency: account.currency,
    balance: parseFloat(account.balance),
    iban: account.iban,
    status: account.status.toLowerCase(),
    metadata: {
      provider_account_type: account.type,
      additional_data: account.metadata,
    },
  }));
}
```

### Transaction Methods

```typescript
async fetchTransactions(
  credentials: ConnectionCredentials,
  accountId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }
): Promise<ProviderTransaction[]> {
  const params = new URLSearchParams({
    account_id: accountId,
    limit: (options?.limit || 100).toString(),
  });

  if (options?.startDate) {
    params.append('from', options.startDate.toISOString());
  }
  if (options?.endDate) {
    params.append('to', options.endDate.toISOString());
  }

  const response = await fetch(
    `https://api.yourprovider.com/transactions?${params.toString()}`,
    {
      headers: {
        'Authorization': `Bearer ${credentials.tokens.accessToken}`,
      },
    }
  );

  const data = await response.json();

  return data.transactions.map((tx: any) => ({
    externalTransactionId: tx.id,
    accountId: accountId,
    date: new Date(tx.date),
    amount: Math.abs(parseFloat(tx.amount)),
    currency: tx.currency,
    description: tx.description,
    type: parseFloat(tx.amount) >= 0 ? 'credit' : 'debit',
    counterpartyName: tx.merchant_name,
    counterpartyAccount: tx.merchant_account,
    reference: tx.reference,
    metadata: {
      category: tx.category,
      provider_transaction_type: tx.type,
    },
  }));
}
```

## Step 3: Register Your Provider

Edit `lib/banking-providers/provider-registry.ts`:

```typescript
import { yourProvider } from './your-provider-name';

constructor() {
  // ... existing providers ...

  this.registerProvider({
    providerId: 'your_provider_id',
    displayName: 'Your Provider Name',
    factory: () => yourProvider,
    enabled: true,
    requiredEnvVars: [
      'YOUR_PROVIDER_CLIENT_ID',
      'YOUR_PROVIDER_CLIENT_SECRET',
      'YOUR_PROVIDER_REDIRECT_URI',
    ],
  });
}
```

## Step 4: Add Environment Variables

### `.env.local` (development)
```bash
# Your Provider Configuration
YOUR_PROVIDER_CLIENT_ID=your_dev_client_id
YOUR_PROVIDER_CLIENT_SECRET=your_dev_client_secret
YOUR_PROVIDER_REDIRECT_URI=http://localhost:3000/api/banking/your_provider_id/callback
YOUR_PROVIDER_ENVIRONMENT=sandbox
```

### `.env.example`
```bash
# Your Provider Configuration
YOUR_PROVIDER_CLIENT_ID=your_provider_client_id
YOUR_PROVIDER_CLIENT_SECRET=your_provider_client_secret
YOUR_PROVIDER_REDIRECT_URI=https://yourdomain.com/api/banking/your_provider_id/callback
YOUR_PROVIDER_ENVIRONMENT=production
```

### Production (Vercel/hosting)
Add the same variables to your production environment.

## Step 5: Add Provider to Database

```sql
INSERT INTO banking_providers (
  id,
  display_name,
  auth_type,
  logo_url,
  color,
  description,
  website,
  supported_countries,
  enabled
) VALUES (
  'your_provider_id',
  'Your Provider Name',
  'oauth',
  '/logos/your-provider.svg',
  '#0066CC',
  'Connect your accounts with Your Provider',
  'https://yourprovider.com',
  ARRAY['US', 'GB', 'DE'],
  true
);
```

## Step 6: Add Provider Logo

1. Create or obtain the provider logo (SVG preferred)
2. Save to `public/logos/your-provider.svg`
3. Ensure it's square or has proper aspect ratio
4. Optimize for web (small file size)

## Step 7: Test Your Integration

### Unit Tests
Create `lib/banking-providers/__tests__/your-provider.test.ts`:

```typescript
import { yourProvider } from '../your-provider-name';

describe('YourProvider', () => {
  it('should validate configuration', () => {
    expect(yourProvider.validateConfiguration()).toBe(true);
  });

  it('should generate authorization URL', () => {
    const url = yourProvider.getAuthorizationUrl('test-state');
    expect(url).toContain('client_id');
    expect(url).toContain('test-state');
  });

  // Add more tests...
});
```

### Manual Testing

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Navigate to connections:**
   ```
   http://localhost:3000/connections/new/generic
   ```

3. **Test OAuth flow:**
   - Click your provider card
   - Should redirect to provider's auth page
   - Authorize the connection
   - Should redirect back with success

4. **Test account sync:**
   - Go to connections page
   - Click sync on your new connection
   - Verify accounts are fetched

5. **Test transaction sync:**
   - Click sync again
   - Verify transactions are imported
   - Check transactions page

## Common Patterns

### API Key Authentication (instead of OAuth)

```typescript
// No OAuth methods needed
// Store API key in provider_tokens.access_token

async fetchAccounts(credentials: ConnectionCredentials): Promise<ProviderAccount[]> {
  const apiKey = credentials.tokens.accessToken;
  
  const response = await fetch('https://api.yourprovider.com/accounts', {
    headers: {
      'X-API-Key': apiKey,
    },
  });
  
  // ... rest of implementation
}
```

### Pagination

```typescript
async fetchTransactions(
  credentials: ConnectionCredentials,
  accountId: string,
  options?: { limit?: number }
): Promise<ProviderTransaction[]> {
  let allTransactions: ProviderTransaction[] = [];
  let nextPage: string | null = null;
  
  do {
    const response = await fetch(
      nextPage || `https://api.yourprovider.com/transactions?account=${accountId}`,
      {
        headers: { 'Authorization': `Bearer ${credentials.tokens.accessToken}` },
      }
    );
    
    const data = await response.json();
    allTransactions = allTransactions.concat(this.mapTransactions(data.transactions));
    nextPage = data.next_page_url;
    
    if (options?.limit && allTransactions.length >= options.limit) {
      break;
    }
  } while (nextPage);
  
  return allTransactions.slice(0, options?.limit);
}
```

### Error Handling

```typescript
getErrorMessage(error: any): string {
  // Map provider-specific errors to user-friendly messages
  if (error.code === 'INVALID_TOKEN') {
    return 'Your connection has expired. Please reconnect your account.';
  }
  
  if (error.code === 'RATE_LIMIT') {
    return 'Too many requests. Please try again in a few minutes.';
  }
  
  return error.message || 'An unexpected error occurred';
}
```

## Best Practices

### 1. Security
- ✅ Never log access tokens or sensitive data
- ✅ Use HTTPS for all API calls
- ✅ Validate all responses from provider API
- ✅ Implement rate limiting
- ✅ Store tokens encrypted (handled by database)

### 2. Error Handling
- ✅ Catch and handle all errors gracefully
- ✅ Provide clear error messages to users
- ✅ Log errors for debugging
- ✅ Implement retry logic for transient failures

### 3. Performance
- ✅ Cache frequently accessed data
- ✅ Implement pagination for large datasets
- ✅ Use batch operations where available
- ✅ Minimize API calls

### 4. User Experience
- ✅ Show progress indicators during sync
- ✅ Provide clear instructions for OAuth
- ✅ Handle edge cases (expired tokens, no accounts, etc.)
- ✅ Test with real accounts before launch

## Checklist

Before submitting your provider:

- [ ] Implements all required BankingProvider methods
- [ ] Registered in provider-registry.ts
- [ ] Environment variables documented
- [ ] Logo added to public/logos/
- [ ] Database record added to banking_providers
- [ ] Unit tests written
- [ ] Manual testing completed
- [ ] OAuth flow works end-to-end
- [ ] Account sync works
- [ ] Transaction sync works
- [ ] Token refresh works (if applicable)
- [ ] Error handling implemented
- [ ] Documentation updated

## Examples

See these files for reference:
- `lib/banking-providers/bunq-provider.ts` - Complete Bunq implementation
- `lib/banking-providers/provider-template.ts` - Starter template
- `lib/banking-providers/base-provider.ts` - Interface definition

## Getting Help

- Review existing provider implementations
- Check provider's API documentation
- Test in sandbox/development environment first
- Ask questions in #engineering channel

## Next Steps

After adding your provider:
1. Test thoroughly in development
2. Test in sandbox/staging environment
3. Document any provider-specific quirks
4. Deploy to production
5. Monitor for errors
6. Gather user feedback

