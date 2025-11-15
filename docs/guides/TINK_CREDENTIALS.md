# Tink Credentials - Saved

## Production Credentials (Vercel)

✅ **Configured in Vercel Production Environment**

- **Client ID:** `caceafe5840c485f98f3c33d92a236ac`
- **Client Secret:** `1f98b5876bb04c11adeeff36da43eb78`
- **Redirect URI:** `https://stratifi-pi.vercel.app/api/banking/tink/callback`

## Local Development

Add to `.env.local` (DO NOT COMMIT):

```bash
TINK_CLIENT_ID=caceafe5840c485f98f3c33d92a236ac
TINK_CLIENT_SECRET=1f98b5876bb04c11adeeff36da43eb78
TINK_REDIRECT_URI=http://localhost:3000/api/banking/tink/callback
```

## Tink Console

- **Console URL:** https://console.tink.com
- **Documentation:** https://docs.tink.com

### Redirect URI Configuration

**IMPORTANT:** The redirect URI in Tink Console must match exactly:

```
https://stratifi-pi.vercel.app/api/banking/tink/callback
```

**Common mistakes to avoid:**
- ❌ `https://stratifi-pi.vercel.app/connections` (wrong path)
- ❌ `https://stratifi-pi.vercel.app/api/banking/tink/callback/` (trailing slash)
- ❌ `http://stratifi-pi.vercel.app/api/banking/tink/callback` (http instead of https)
- ✅ `https://stratifi-pi.vercel.app/api/banking/tink/callback` (correct)

## OAuth Flow

### Standard OAuth 2.0 Authorization Code Flow

Tink uses the standard OAuth 2.0 Authorization Code Flow:

1. **Authorization Request**: User is redirected to Tink's authorization endpoint
2. **User Authentication**: User logs into their bank through Tink
3. **Authorization Grant**: Tink redirects back with an authorization code
4. **Token Exchange**: Your app exchanges the code for an access token
5. **API Access**: Use the access token to fetch accounts and transactions

### Important Notes

- **No custom login forcing**: Tink manages user sessions server-side
- **Standard redirect flow**: Use `window.location.href` for OAuth (no popups)
- **Demo bank**: Use credentials `demo` / `demo` for testing
- **Session management**: Tink handles login/logout - we cannot force re-authentication

---

**Note:** These credentials are stored securely in Vercel. Never commit them to git.

