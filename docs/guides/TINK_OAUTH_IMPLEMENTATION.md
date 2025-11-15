# Tink OAuth 2.0 Implementation - Industry Standard

## Overview

Stratifi implements Tink's banking aggregation using the **standard OAuth 2.0 Authorization Code Flow**, following industry best practices and Tink's official documentation.

## Architecture

### OAuth 2.0 Flow

```
User → Stratifi → Tink Authorization → Bank Login → Tink Callback → Stratifi
```

1. **User initiates connection** - Clicks "Connect Tink" in Stratifi
2. **Stratifi creates connection** - Generates secure state parameter
3. **Redirect to Tink** - Standard OAuth redirect to Tink's authorization server
4. **Tink handles authentication** - User authenticates with their bank via Tink
5. **Bank authorization** - User authorizes Stratifi to access their data
6. **Callback to Stratifi** - Tink redirects back with authorization code
7. **Token exchange** - Stratifi exchanges code for access/refresh tokens
8. **Data sync** - Stratifi fetches accounts and transactions

## Implementation Details

### 1. Authorization URL Generation

**File:** `lib/tink-client.ts`

```typescript
export function getTinkAuthorizationUrl(state: string, market: string = 'NL'): string {
  const params = new URLSearchParams({
    client_id: TINK_CONFIG.clientId,
    redirect_uri: TINK_CONFIG.redirectUri,
    response_type: 'code',
    scope: 'accounts:read,transactions:read',
    state: state,
    market: market,
  });
  
  return `${TINK_CONFIG.authorizeUrl}?${params.toString()}`;
}
```

**Parameters:**
- `client_id` - Your Tink application client ID
- `redirect_uri` - Where Tink sends the user after authorization
- `response_type` - Always `code` for Authorization Code Flow
- `scope` - Permissions requested (accounts, transactions)
- `state` - Security parameter to prevent CSRF attacks
- `market` - Country code (e.g., 'NL' for Netherlands)

### 2. OAuth Callback Handling

**File:** `app/api/banking/[provider]/callback/route.ts`

The callback:
1. Validates the `state` parameter
2. Exchanges authorization code for tokens
3. Stores tokens securely in the database
4. Fetches user info from Tink
5. Automatically syncs accounts in the background
6. Redirects user back to Stratifi

### 3. Token Storage

**Table:** `provider_tokens`

Tokens are stored securely with:
- `access_token` - For API requests
- `refresh_token` - To get new access tokens
- `expires_at` - Token expiration timestamp
- `provider_user_id` - Tink user identifier

### 4. Token Refresh

Tokens are automatically refreshed when:
- Access token has expired
- Before making API requests
- Using the refresh token flow

## Security Considerations

### State Parameter
- Random 32-byte hex string
- Stored in connection record
- Validated on callback
- Prevents CSRF attacks

### Token Security
- Tokens stored in database (not client-side)
- Row-Level Security (RLS) enforces tenant isolation
- Service role used for token operations
- Tokens are never exposed to client

### HTTPS Only
- All OAuth flows use HTTPS
- Redirect URI must be HTTPS in production
- Prevents man-in-the-middle attacks

## User Experience

### First-Time Connection
1. User clicks "Connect Tink"
2. Redirects to Tink's authorization page
3. User selects their bank
4. User logs in to their bank
5. User authorizes Stratifi
6. Redirects back to Stratifi
7. Accounts appear automatically

### Subsequent Connections
- Tink may cache the user's session
- User might not need to re-enter credentials
- This is **normal behavior** for OAuth providers
- Controlled by Tink, not Stratifi

## Testing

### Demo Bank Credentials
- **URL:** https://demobank.production.global.tink.se
- **Username:** `demo`
- **Password:** `demo`

### Test Flow
1. Delete any existing Tink connections
2. Go to `/connections/new`
3. Click "Connect Tink"
4. Should redirect to Tink
5. Select "Demo Bank (NL)"
6. Enter credentials
7. Authorize
8. Should redirect back with connection active

## Common Issues

### Issue: "Tink doesn't prompt for login"
**Cause:** Tink caches user sessions server-side  
**Solution:** This is normal OAuth behavior. Tink controls authentication UX.  
**Note:** For testing, you can clear browser cookies for `link.tink.com` and `tink.com`

### Issue: "HTTP 405 Error"
**Cause:** Invalid HTTP method or URL  
**Solution:** Ensure you're using GET for authorization, POST for token exchange

### Issue: "Invalid redirect_uri"
**Cause:** Redirect URI doesn't match Tink Console  
**Solution:** Verify redirect URI in Tink Console matches exactly:
```
https://stratifi-pi.vercel.app/api/banking/tink/callback
```

### Issue: "OAuth token not found"
**Cause:** Race condition in automatic sync  
**Solution:** Already fixed - we wait for token insert before syncing

## Why This Approach?

### 1. Industry Standard
- OAuth 2.0 is the industry standard for third-party authorization
- Used by Google, Microsoft, GitHub, and all major providers
- Well-documented, secure, battle-tested

### 2. Provider Control
- Tink controls their authentication UX
- We don't manipulate their session management
- Respects their security policies

### 3. Maintainable
- Clean, simple implementation
- No hacks or workarounds
- Easy to understand and debug
- Follows official documentation

### 4. Secure
- State parameter prevents CSRF
- Tokens never exposed to client
- HTTPS enforced
- Row-Level Security for multi-tenancy

## What We Removed

### ❌ Popup Window Approach
- Causes cross-origin issues
- Not standard for OAuth
- Complicates error handling

### ❌ Cookie Manipulation
- Can't clear third-party cookies reliably
- Doesn't affect server-side sessions
- Security risk

### ❌ Custom URL Parameters
- `prompt=login` - Not supported by Tink
- `max_age=0` - Not supported by Tink
- `_nocache`, `_force_login` - Non-standard hacks

### ❌ localStorage Clearing
- Doesn't affect Tink's server-side sessions
- Can break legitimate functionality

## References

- [OAuth 2.0 RFC](https://datatracker.ietf.org/doc/html/rfc6749)
- [Tink Documentation](https://docs.tink.com)
- [Tink Link Web](https://docs.tink.com/resources/tutorials/tink-link-web-permanent-users)
- [OAuth 2.0 Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)

## Conclusion

This implementation follows OAuth 2.0 best practices and Tink's official documentation. It's clean, maintainable, secure, and reliable. The session management is handled by Tink, as it should be in a standard OAuth flow.

For production use, users will experience Tink's standard authentication flow, which is optimized for security and user experience.

