# Standard Bank (South Africa) Integration

Direct API integration with Standard Bank South Africa's OneHub API Marketplace for business banking accounts.

---

## 📋 Overview

**Type:** Direct Bank API (not aggregation)  
**Region:** South Africa  
**Status:** ✅ Production Ready (Closed Beta)  
**API Platform:** OneHub Marketplace

---

## 🔑 Credentials Required

Clients need to provide **multiple subscription keys** from their OneHub Marketplace subscriptions:

### Required Credentials
1. **App ID (Client ID)** - Application identifier from OneHub
2. **Client Secret** - Application secret from OneHub
3. **Subscription Key - Balance Enquiry API** - For account balance queries
4. **Subscription Key - Statements/Transactions API** - For transaction history

### Optional Credentials
5. **Subscription Key - Payments API** - Only if initiating payments through Stratiri
6. **API Key / Additional Secret** - If API product issues an extra key
7. **Business / Division ID** - Business Online profile identifier

---

## 📚 Documentation

- **[Multiple Subscription Keys Implementation](STANDARD_BANK_MULTIPLE_SUBSCRIPTION_KEYS.md)** - How we handle multiple API product subscriptions
- **[Integration Guide](../../integrations/standard-bank/README.md)** - Complete integration documentation

---

## 🔐 Security

- All credentials encrypted at rest (AES-256-GCM)
- Stored in `banking_provider_credentials` table
- Never exposed in logs or API responses
- Scoped to tenant via RLS policies

---

## 🏗️ Architecture

```
Client Credentials (OneHub)
         ↓
Stratiri Credential Vault (encrypted)
         ↓
Standard Bank OneHub APIs
    ├── Balance Enquiry API
    ├── Statements/Transactions API
    └── Payments API (optional)
```

---

## 🔧 Implementation Files

- `lib/direct-bank-providers.ts` - Provider configuration
- `components/connections/direct-bank-api-card.tsx` - UI for credential collection
- `app/api/direct-banks/route.ts` - API endpoint for credential submission
- `app/api/banking/standard-bank/` - Standard Bank-specific API routes
- `lib/security/credential-vault.ts` - Encryption/decryption
- `lib/services/banking-credential-service.ts` - Credential storage

---

## 📖 Client Onboarding Flow

1. **Client signs up** for OneHub API Marketplace
2. **Client subscribes** to required API products:
   - Balance Enquiry
   - Statements/Transactions
   - (Optional) Payments
3. **Client provides credentials** to Stratiri:
   - App ID & Client Secret
   - All subscription keys
4. **Stratiri encrypts** and stores credentials
5. **Stratiri connects** to Standard Bank APIs
6. **Data syncs** automatically

---

## 🔗 External Links

- [Standard Bank OneHub](https://corporateandinvestment.standardbank.com/cib/global/products-and-services/onehub/api-marketplace)
- [OneHub API Documentation](https://developer.standardbank.co.za/) (requires account)

---

## ⚠️ Known Limitations

- Sandbox environment may have limited data
- Rate limits apply per subscription key
- Each API product requires separate subscription

---

**Last Updated:** November 23, 2025  
**Status:** Production Ready  
**Next Steps:** Client onboarding in progress

