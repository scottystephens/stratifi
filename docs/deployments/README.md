# Deployments

This directory contains deployment reports, guides, and post-deployment summaries.

---

## 📋 Recent Deployments

### 2025
- **[Deployment Success](DEPLOYMENT_SUCCESS.md)** - Recent successful production deployment
- **[Admin Dashboard Deployment](ADMIN_DASHBOARD_DEPLOYMENT.md)** - Admin dashboard deployment report

---

## 📝 Deployment Guides

For step-by-step deployment instructions, see:
- [Production Deployment Guide](../guides/PRODUCTION_DEPLOYMENT.md)
- [Deployment Process](../guides/DEPLOYMENT.md)
- [Supabase & Vercel Runbook](../operations/CURSOR_SUPABASE_VERCEL_RUNBOOK.md)

---

## 🔧 Deployment Checklist

### Pre-Deployment
- [ ] All tests passing (run `npm run test`)
- [ ] Linting passes (run `npm run lint`)
- [ ] Build succeeds (run `npm run build`)
- [ ] Environment variables verified
- [ ] Database migrations ready

### Deployment
- [ ] Run database migrations (if any)
- [ ] Deploy to Vercel: `vercel --prod`
- [ ] Verify deployment URL
- [ ] Check deployment logs

### Post-Deployment
- [ ] Smoke test critical paths
- [ ] Verify authentication works
- [ ] Check database connections
- [ ] Monitor error logs
- [ ] Update deployment report

---

## 🚀 Deployment Commands

```bash
# Build locally
npm run build

# Deploy to preview
vercel

# Deploy to production
vercel --prod

# View logs
vercel logs stratiri.vercel.app --since 1h

# Check deployment status
vercel ls
```

---

## 🔗 Related Documentation

- [Production Deployment Guide](../guides/PRODUCTION_DEPLOYMENT.md)
- [Operations Runbook](../operations/CURSOR_SUPABASE_VERCEL_RUNBOOK.md)
- [Completed Features](../completed-features/)

---

**Last Deployment:** See most recent file in this directory  
**Deployment Frequency:** As needed (typically 1-3 times per week)

