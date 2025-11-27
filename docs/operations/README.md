# Operations

This directory contains operational documentation, runbooks, and DevOps guides for managing Stratiri's infrastructure.

---

## 📋 Core Operations Documentation

### CLI & Infrastructure
- **[Supabase & Vercel Runbook](CURSOR_SUPABASE_VERCEL_RUNBOOK.md)** - Complete CLI reference and workflows
- **[Cursor Rules](CURSOR_RULES_SUPABASE_VERCEL.md)** - Development rules and patterns for Cursor AI
- **[Supabase CLI Findings](SUPABASE_CLI_FINDINGS.md)** - CLI tips, tricks, and gotchas
- **[GitHub/Vercel Rename Guide](GITHUB_VERCEL_RENAME_GUIDE.md)** - Repository and deployment renaming

---

## 🔧 Quick Reference

### Supabase Commands
```bash
# Run migrations
cd /Users/scottstephens/stratifi && npx tsx scripts/utilities/run-migration-cli.ts scripts/migrations/XX-name.sql

# Link project
cd /Users/scottstephens/stratifi && npx supabase link --project-ref vnuithaqtpgbwmdvtxik
```

### Vercel Commands
```bash
# Deploy to production
cd /Users/scottstephens/stratifi && vercel --prod

# View logs
cd /Users/scottstephens/stratifi && vercel logs stratiri.vercel.app --since 1h

# Pull environment variables
cd /Users/scottstephens/stratifi && vercel env pull .env.local
```

---

## 📚 Related Documentation

### Supabase
- [Supabase CLI Setup Guide](../guides/SUPABASE_CLI_SETUP.md)
- [Database Setup](../guides/DATABASE_SETUP.md)
- [Supabase CLI Quick Reference](../../scripts/utilities/SUPABASE_CLI_QUICK_REFERENCE.md)

### Deployment
- [Production Deployment](../guides/PRODUCTION_DEPLOYMENT.md)
- [Deployment Guide](../guides/DEPLOYMENT.md)
- [Recent Deployments](../deployments/)

### Testing
- [Testing Strategy](../testing/README.md)
- [CI/CD Workflow](../../.github/workflows/test.yml)

---

## 🌐 Important URLs

| Service | URL | Notes |
|---------|-----|-------|
| **Production App** | https://stratiri.vercel.app | Live production instance |
| **Supabase Dashboard** | https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik | Database & Auth management |
| **Supabase SQL Editor** | https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new | Run SQL queries |
| **Vercel Dashboard** | https://vercel.com/dashboard | Deployment management |

---

## 🔐 Environment Variables

Required environment variables for local development:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://vnuithaqtpgbwmdvtxik.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.vnuithaqtpgbwmdvtxik.supabase.co:5432/postgres"

# Credential Encryption
CREDENTIAL_ENCRYPTION_KEY="..." # 32-byte key (base64 or hex)

# Banking Providers (optional, if using)
PLAID_CLIENT_ID="..."
PLAID_SECRET="..."
PLAID_ENV="sandbox" # or production

TINK_CLIENT_ID="..."
TINK_CLIENT_SECRET="..."

BUNQ_CLIENT_ID="..."
BUNQ_CLIENT_SECRET="..."
BUNQ_ENVIRONMENT="SANDBOX" # or PRODUCTION
```

---

## 🚨 Troubleshooting

### Common Issues

**Supabase Connection Issues:**
- Verify environment variables are set
- Check if Supabase project is awake (free tier sleeps after inactivity)
- Confirm database URL is correct

**Vercel Deployment Fails:**
- Check build logs: `vercel logs <deployment-url>`
- Verify environment variables in Vercel dashboard
- Ensure `npm run build` succeeds locally

**Migration Errors:**
- Use SQL Editor in browser if CLI fails
- Check migration file syntax
- Verify RLS policies don't block operations

---

## 📞 Support

For operational issues:
1. Check this runbook first
2. Review related documentation
3. Check deployment logs
4. Review Supabase/Vercel dashboards

---

**Last Updated:** November 23, 2025  
**Maintained By:** Development Team

