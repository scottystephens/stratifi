# Deployment Guide

## Production Deployment

### Prerequisites

- Vercel account
- Supabase project
- Banking provider credentials (Tink, Bunq)
- GitHub repository

### Environment Variables

Set in Vercel dashboard:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.your-project.supabase.co:5432/postgres

# Tink
TINK_CLIENT_ID=your_tink_client_id
TINK_CLIENT_SECRET=your_tink_client_secret
TINK_REDIRECT_URI=https://your-domain.vercel.app/api/banking/tink/callback

# Bunq
BUNQ_CLIENT_ID=your_bunq_client_id
BUNQ_CLIENT_SECRET=your_bunq_client_secret
BUNQ_REDIRECT_URI=https://your-domain.vercel.app/api/banking/bunq/callback
BUNQ_ENVIRONMENT=production
```

### Deployment Steps

#### 1. Database Setup

Run migrations via Supabase SQL Editor:

```bash
# Navigate to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new

# Run migrations in order:
01-create-base-tables.sql
02-entity-relationships.sql
03-add-tenant-user-id.sql
04-setup-data-ingestion-safe.sql
05-add-data-type-field.sql
06-add-bunq-oauth-support.sql
07-add-generic-banking-providers.sql
08-add-provider-column-to-connections.sql
09-fix-statements-foreign-keys.sql
10-add-statements-connection-id-index.sql
11-enhance-accounts-and-connections-fixed.sql
12-make-entity-id-nullable.sql
13-fix-account-id-length.sql
14-remove-all-length-restrictions.sql
```

#### 2. Vercel Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Link project
vercel link

# Deploy to production
vercel --prod
```

#### 3. Verify Deployment

- [ ] App loads: https://your-domain.vercel.app
- [ ] No console errors
- [ ] Can login/signup
- [ ] Can create organization
- [ ] Can view dashboard

#### 4. Test Banking Integration

- [ ] Tink connection works
- [ ] Bunq connection works
- [ ] Account sync works
- [ ] Transaction sync works
- [ ] Transactions display correctly

### Post-Deployment

#### Monitoring

Monitor these metrics:
- Error rate
- API response times
- Database query performance
- OAuth success rate
- Transaction sync success rate

#### Logs

Check logs regularly:
```bash
vercel logs https://your-domain.vercel.app --follow
```

### Rolling Back

If issues arise:

```bash
# List recent deployments
vercel ls

# Promote previous deployment
vercel alias <previous-deployment-url> your-domain.vercel.app
```

### Troubleshooting

**Build Errors**
```bash
# Test locally first
npm run build

# Check for TypeScript errors
npm run lint
```

**Environment Variables**
```bash
# Verify all variables are set
vercel env ls production

# Pull to local for testing
vercel env pull .env.local
```

**Database Connectivity**
- Verify DATABASE_URL is correct
- Check Supabase project is active
- Test connection via psql or SQL Editor

**OAuth Issues**
- Verify redirect URIs match exactly
- Check client IDs and secrets
- Ensure HTTPS is used (required for OAuth)

## Development Setup

### Local Development

```bash
# Clone repository
git clone https://github.com/your-org/stratiri.git
cd stratiri

# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your credentials

# Run development server
npm run dev

# Open http://localhost:3000
```

### Testing

```bash
# Build production bundle
npm run build

# Test production build locally
npm run start

# Run linter
npm run lint
```

## CI/CD

### Automatic Deployment

Vercel automatically deploys:
- **Main branch** → Production
- **Feature branches** → Preview deployments

### Manual Deployment

```bash
# Deploy current branch to preview
vercel

# Deploy to production
vercel --prod

# Deploy with specific name
vercel --name stratiri-test
```

## Database Migrations

### Running Migrations

**Always use Supabase SQL Editor for schema changes:**

1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new
2. Copy migration SQL from `scripts/migrations/`
3. Paste and execute
4. Verify success

**Never use:**
- psql directly (connection issues)
- Supabase CLI push (unreliable for remote)
- Custom RPC functions (don't exist by default)

### Migration Best Practices

```sql
-- ✅ Good: Idempotent, safe
CREATE TABLE IF NOT EXISTS new_table (...);
ALTER TABLE table ADD COLUMN IF NOT EXISTS new_col TEXT;

-- ❌ Bad: Will fail if exists
CREATE TABLE new_table (...);
ALTER TABLE table ADD COLUMN new_col TEXT;
```

## Security

### Checklist

- [ ] All environment variables secured
- [ ] Service role key never exposed to frontend
- [ ] HTTPS enforced
- [ ] RLS policies enabled on all tables
- [ ] OAuth redirect URIs whitelisted
- [ ] Rate limiting configured
- [ ] Error messages don't expose sensitive data

### Regular Security Tasks

**Weekly:**
- Review error logs for security issues
- Check for failed auth attempts
- Monitor API usage for anomalies

**Monthly:**
- Review RLS policies
- Update dependencies (`npm audit`)
- Rotate API keys if compromised

**Quarterly:**
- Full security audit
- Review user permissions
- Update OAuth credentials

## Performance

### Optimization Tips

- Use Next.js Server Components
- Implement caching where appropriate
- Optimize database queries (indexes)
- Use batch operations for bulk data
- Minimize API calls (intelligent sync)

### Monitoring Performance

```bash
# View deployment performance
vercel inspect <deployment-url>

# Check build times
vercel ls --debug
```

## Backup and Recovery

### Database Backups

Supabase provides:
- Automatic daily backups
- Point-in-time recovery
- Manual backup via SQL dump

### Application State

- Code in GitHub (version controlled)
- Deployments in Vercel (can roll back)
- Env vars in Vercel dashboard (document separately)

---

**Last Updated**: November 16, 2025  
**Production URL**: https://stratiri-pi.vercel.app  
**Status**: ✅ Live
