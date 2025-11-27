# CRITICAL: Tink OAuth Token Expiry - User Action Required

## 🚨 The Problem

**Tink integration is BROKEN due to 2-hour token expiry with NO refresh tokens.**

**Impact:**
- Users must re-authenticate every 2 hours
- Terrible user experience
- Data stops syncing after 2 hours
- No automatic recovery

## ⚠️ Root Cause

**Tink is configured to provide SHORT-LIVED tokens (2 hours) WITHOUT refresh tokens.**

This is a **TINK CONSOLE CONFIGURATION ISSUE**, not a code bug.

### What We're Getting From Tink
```json
{
  "access_token": "...",
  "expires_in": 7200,  // 2 hours only
  "token_type": "Bearer",
  "refresh_token": null  // ❌ NO REFRESH TOKEN
}
```

### What We Need From Tink
```json
{
  "access_token": "...",
  "expires_in": 2592000,  // 30 days
  "token_type": "Bearer",
  "refresh_token": "..."  // ✅ WITH REFRESH TOKEN
}
```

## ✅ Recommended Solutions (Pick One)

### Option 1: Configure Tink for Permanent Access (BEST)

**This requires access to Tink Console:**

1. **Log into Tink Console**
   - URL: https://console.tink.com/
   - Use your Tink developer credentials

2. **Navigate to Your App Settings**
   - Find your Stratiri integration app
   - Look for "OAuth" or "Token" settings

3. **Enable Permanent User Access**
   - Enable "Long-lived tokens" or "Permanent access"
   - Set token lifetime to 30+ days
   - Enable refresh tokens

4. **Update Redirect URI (if needed)**
   - Ensure: `https://stratiri.vercel.app/api/banking/tink/callback`
   - Must match EXACTLY

5. **Save and Test**
   - Reconnect a test Tink connection
   - Verify token lifetime is longer
   - Check if refresh_token is provided

### Option 2: Contact Tink Support (If Console Access Limited)

**Send this email template:**

```
Subject: Enable Permanent User Access for OAuth Integration

Hi Tink Support,

We're integrating Tink banking aggregation into our application (Stratiri) 
and need to enable permanent user access with refresh tokens.

Current Issue:
- Tokens expire after 2 hours
- No refresh tokens provided
- Users must re-authenticate frequently

Our App Details:
- Client ID: [YOUR_TINK_CLIENT_ID]
- Redirect URI: https://stratiri.vercel.app/api/banking/tink/callback
- Integration Type: OAuth 2.0

Requested Configuration:
1. Enable long-lived tokens (30+ days)
2. Enable refresh token support
3. Configure for permanent user access

This is blocking our production launch. How quickly can we get this configured?

Thank you,
[Your Name]
```

### Option 3: Temporarily Disable Tink (INTERIM)

**Until we can configure Tink properly, we should disable it to avoid user frustration.**

To disable Tink temporarily:

```typescript
// lib/banking-providers/provider-registry.ts line 17-27
this.registerProvider({
  providerId: 'tink',
  displayName: 'Tink (3,500+ European Banks)',
  factory: () => tinkProvider,
  enabled: false,  // ← Change to false
  requiredEnvVars: [
    'TINK_CLIENT_ID',
    'TINK_CLIENT_SECRET',
    'TINK_REDIRECT_URI',
  ],
});
```

**Deploy this change ASAP to prevent users from creating broken connections.**

## 📊 Comparison with Working Providers

| Provider | Token Lifetime | Refresh Token | Status |
|----------|---------------|---------------|---------|
| **Plaid** | 24+ hours | ✅ Yes | ✅ **WORKING** |
| **Bunq** | 90 days | ✅ Yes | ✅ **WORKING** |
| **Tink** | 2 hours | ❌ **NO** | ❌ **BROKEN** |

## 🔍 How to Verify Tink Configuration

After making changes in Tink Console, test with this query:

```sql
-- Check what Tink is returning
SELECT 
  id,
  connection_id,
  provider_id,
  created_at,
  expires_at,
  extract(epoch from (expires_at - created_at)) / 3600 as token_lifetime_hours,
  refresh_token IS NOT NULL as has_refresh_token
FROM provider_tokens
WHERE provider_id = 'tink'
ORDER BY created_at DESC
LIMIT 5;
```

**Target Results:**
- `token_lifetime_hours` should be **720** (30 days) or more
- `has_refresh_token` should be **true**

**Current Results:**
- `token_lifetime_hours` is **2** ❌
- `has_refresh_token` is **false** ❌

## 🎯 Success Criteria

After fixing Tink configuration:

- [ ] New Tink connections receive tokens with 30+ day lifetime
- [ ] Refresh tokens are provided in OAuth response
- [ ] Tokens can be automatically refreshed before expiry
- [ ] Users connect once and never think about it again
- [ ] Data syncs continuously without re-authentication

## ⚡ Immediate Actions

### TODAY (Emergency)
1. **Disable Tink in production** (Option 3)
   - Change `enabled: false` in provider-registry.ts
   - Deploy immediately
   - Prevents new broken connections

2. **Contact Tink support** (Option 2)
   - Send email with template above
   - Request urgent assistance
   - Provide all app details

### THIS WEEK (Configuration)
3. **Get Tink Console access** (Option 1)
   - Or work with Tink support
   - Enable permanent access
   - Configure long-lived tokens

4. **Test configuration**
   - Create test connection
   - Verify token lifetime
   - Confirm refresh tokens work

5. **Re-enable Tink**
   - Change `enabled: true`
   - Deploy to production
   - Monitor token behavior

### AFTER FIX (Cleanup)
6. **Notify existing users**
   - Email: "Please reconnect your Tink account"
   - Explain the issue was fixed
   - Apologize for inconvenience

7. **Clean up expired connections**
   ```sql
   -- Mark expired Tink tokens
   UPDATE provider_tokens
   SET status = 'expired',
       error_message = 'Token expired. Please reconnect after Tink configuration fix.'
   WHERE provider_id = 'tink'
     AND expires_at < NOW();
   ```

## 📞 Who to Contact

### Tink Support
- **Email:** support@tink.com
- **Console:** https://console.tink.com/
- **Docs:** https://docs.tink.com/
- **Priority:** URGENT (production blocking)

### Internal
- **Developer:** Review Tink Console settings
- **Product:** Decide on temporary disable vs workaround
- **Support:** Prepare user communications

## 💡 Why This Happened

**Tink has TWO types of OAuth configurations:**

1. **Short-lived (2 hour) tokens** - For demos/testing
   - Quick to set up
   - No refresh tokens
   - Not suitable for production

2. **Long-lived (30+ day) tokens** - For production
   - Requires Console configuration
   - Includes refresh tokens
   - Suitable for continuous access

**We accidentally configured for #1 when we need #2.**

## 🚀 After Fix Deployment

Once Tink is properly configured:

```bash
# 1. Update provider-registry.ts enabled: true
# 2. Test locally
npm run dev

# 3. Deploy to production
git add lib/banking-providers/provider-registry.ts
git commit -m "fix: re-enable Tink after configuration fix"
git push origin main

# 4. Verify in production
# - Create test Tink connection
# - Check token lifetime in database
# - Confirm refresh token exists
# - Wait 2 hours, verify still working
```

## 📝 Lessons Learned

1. **Always check token lifetime** in provider documentation
2. **Verify refresh tokens** before production launch
3. **Test token expiry scenarios** in staging
4. **Configure providers properly** before integrating
5. **Have fallback plans** for auth failures

---

**Status:** 🚨 **CRITICAL - ACTION REQUIRED**
**Priority:** **P0 - Production Blocker**
**Owner:** Developer + Tink Support
**Timeline:** Fix within 24-48 hours

**Next Step:** Choose Option 1, 2, or 3 above and execute ASAP.



