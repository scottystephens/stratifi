# Admin Dashboard - Deployment Guide

## Overview

The Stratiri Admin Dashboard provides comprehensive system monitoring, tenant management, connection orchestration, and automated data sync scheduling for super admins.

## Features Implemented

✅ Super Admin Authentication & Authorization
✅ System Overview Dashboard with KPIs
✅ Tenant Management with Statistics
✅ Connection Monitoring Across All Tenants
✅ Data Orchestration Hub with Sync Scheduling
✅ Comprehensive Logs Viewer
✅ System Health Monitoring
✅ Automated Sync Cron Jobs (Vercel Cron)
✅ Connection Health Tracking
✅ API Usage Monitoring
✅ Admin Audit Logging

## Database Migrations

### Step 1: Run Migration 21 - Super Admin Support

Open [Supabase SQL Editor](https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new) and run:

```sql
-- Copy and paste the contents of:
scripts/migrations/21-add-super-admin-support.sql
```

This creates:
- `admin_audit_log` table for tracking admin actions
- `is_super_admin()` function for permission checks
- `get_all_tenants()` function for cross-tenant queries
- `get_all_connections()` function for connection management
- `log_admin_action()` function for audit trail
- RLS policies for admin access

### Step 2: Run Migration 22 - Orchestration Infrastructure

Run in [Supabase SQL Editor](https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new):

```sql
-- Copy and paste the contents of:
scripts/migrations/22-add-orchestration-tables.sql
```

This adds:
- Sync scheduling columns to `connections` table
- Connection health tracking (health_score, consecutive_failures, etc.)
- `provider_api_usage` table for API quota monitoring
- `system_health_metrics` table for system monitoring
- `connection_stats` view for analytics
- `update_connection_health()` function for health scoring
- Automatic health update triggers
- Helper functions for sync orchestration

### Step 3: Mark Yourself as Super Admin

Run in [Supabase SQL Editor](https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/sql/new):

```sql
-- Replace with your actual email
UPDATE auth.users 
SET raw_user_meta_data = raw_user_meta_data || '{"is_super_admin": true}'::jsonb
WHERE email = 'your-admin@email.com';
```

## Environment Variables

### Required for Cron Jobs

Add to Vercel environment variables:

```bash
CRON_SECRET=<generate-a-random-secret>
```

Generate a random secret:
```bash
openssl rand -base64 32
```

Add this in Vercel Dashboard → Settings → Environment Variables

## Vercel Deployment

### Step 1: Deploy to Vercel

```bash
# Commit changes
git add .
git commit -m "Add admin dashboard with orchestration and cron jobs"

# Push to deploy (if auto-deploy is enabled)
git push origin main
```

Or deploy manually:
```bash
vercel --prod
```

### Step 2: Verify Cron Jobs

After deployment:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Navigate to **Cron Jobs** section
4. Verify all 5 cron jobs are registered:
   - `sync-hourly` - Every hour (0 * * * *)
   - `sync-4hours` - Every 4 hours (0 */4 * * *)
   - `sync-12hours` - Every 12 hours (0 */12 * * *)
   - `sync-daily` - Daily at 2 AM (0 2 * * *)
   - `health-check` - Every 15 minutes (*/15 * * * *)

### Step 3: Test Cron Jobs

Vercel provides a "Run Now" button for testing cron jobs in the dashboard.

Or test via cURL:
```bash
curl -X GET \
  https://stratiri.vercel.app/api/admin/cron/health-check \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Accessing the Admin Dashboard

1. **Login** to Stratiri: https://stratiri.vercel.app/login
2. **Navigate** to `/admin` (or click the "Admin Dashboard" link in the sidebar)
3. **Verify** you see the amber-colored admin navigation

### Admin Pages

- `/admin` - System Overview with KPIs
- `/admin/tenants` - Tenant Management
- `/admin/connections` - Connection Monitoring
- `/admin/orchestration` - Sync Schedule Management
- `/admin/logs` - System Logs Viewer
- `/admin/health` - System Health Monitor

## Using the Admin Dashboard

### Setting Up Sync Schedules

1. Go to `/admin/orchestration`
2. For each connection:
   - Select sync schedule (Manual, Hourly, Every 4h, Every 12h, Daily, Weekly)
   - Toggle "Enabled" checkbox
   - Changes save automatically
3. Cron jobs will automatically pick up connections based on their schedule

### Monitoring System Health

1. Go to `/admin/health`
2. View overall system status
3. Check connection health distribution
4. Monitor job success rates
5. Review alerts for critical connections

### Viewing Logs

1. Go to `/admin/logs`
2. Filter by status (All, Completed, Failed, Running)
3. Search by job type or connection ID
4. Click logs to expand and view details
5. Export logs to CSV for analysis

### Triggering Manual Syncs

1. Go to `/admin/connections`
2. Click the sync icon (↻) next to any connection with a provider
3. Wait for the sync to complete
4. View results in the logs page

## Connection Health Scoring

Connections are automatically assigned a health score (0-100) based on:

- **Success Rate**: Recent job completion rate (0-40 points)
- **Consecutive Failures**: Penalty for repeated failures (-15 points each)
- **Staleness**: Penalty for connections not synced recently (-10 to -20 points)

Health Status:
- **Healthy**: 80-100 (Green)
- **Warning**: 50-79 (Amber)
- **Critical**: 0-49 (Red)

Health scores update automatically after each sync job.

## Sync Orchestration Logic

### How It Works

1. **Cron Job Runs** (e.g., hourly cron at 0 * * * *)
2. **Query Ready Connections**: Finds connections with matching schedule AND `next_sync_at <= NOW()`
3. **Batch Process**: Processes up to 20 (hourly) or 50 (daily) connections per run
4. **Trigger Sync**: Calls the banking provider sync API
5. **Record Result**: Updates connection health, consecutive_failures, last_sync_at
6. **Calculate Next Sync**: Sets next_sync_at based on schedule

### Batch Limits

To avoid timeouts, cron jobs process connections in batches:
- **Hourly**: 20 connections per run
- **4-Hour**: 20 connections per run
- **12-Hour**: 20 connections per run
- **Daily**: 50 connections per run

If more connections are ready than the batch limit, they'll be picked up in the next run.

## API Quota Tracking

The system tracks API usage per provider:

- API calls count
- Transactions synced
- Accounts synced
- Sync jobs executed

View usage in `/admin` dashboard or query `provider_api_usage` table.

## Security Features

### Admin Access Control

- **Middleware Protection**: `/admin` routes require `is_super_admin: true` flag
- **API Authorization**: All admin APIs check super admin status
- **Audit Logging**: All admin actions logged to `admin_audit_log` table
- **Cron Authorization**: Cron jobs require `CRON_SECRET` header

### RLS Policies

Admin functions use `SECURITY DEFINER` to bypass RLS when needed, but still validate user permissions.

## Monitoring & Alerts

### Automatic Alerts

The system automatically identifies:
- Connections with health score < 50 (Critical)
- Connections with 3+ consecutive failures
- Error rate > 10% in last 24 hours
- Connections not synced in 7+ days

View alerts in `/admin/health` page.

## Troubleshooting

### "Admin access required" error

Verify super admin flag:
```sql
SELECT raw_user_meta_data->>'is_super_admin' as is_admin
FROM auth.users
WHERE email = 'your-email@example.com';
```

### Cron jobs not running

1. Check Vercel Dashboard → Cron Jobs section
2. Verify `CRON_SECRET` is set in environment variables
3. Check deployment logs for errors
4. Manually trigger via "Run Now" button

### Connection not syncing

1. Check `/admin/connections` - verify schedule is set and enabled
2. Check `/admin/logs` - look for error messages
3. Verify `next_sync_at` is in the past
4. Check connection health score - low scores may indicate recurring issues

### Health scores not updating

Health scores update automatically via trigger after each job. To manually recalculate:

```sql
SELECT update_connection_health('connection-id-here');
```

## Maintenance

### Archive Old Logs

The health-check cron job (runs every 15 minutes) automatically archives logs older than 30 days.

### Monitor API Quotas

Check `/admin` dashboard for provider API usage. Add alerts if usage exceeds 80% of limits.

### Review Admin Audit Log

Periodically review admin actions:

```sql
SELECT * FROM admin_audit_log
ORDER BY created_at DESC
LIMIT 100;
```

## Next Steps

### Optional Enhancements

1. **Email Alerts**: Send emails when connections go critical
2. **Slack Integration**: Post alerts to Slack channel
3. **Custom Schedules**: Support custom cron expressions per connection
4. **Retry Logic**: Exponential backoff for failed syncs
5. **Performance Metrics**: Track API response times, sync durations
6. **Provider Status Page**: External API health checks

### Scaling Considerations

- **Batch Processing**: Current batch limits handle ~100 connections/hour
- **Job Queues**: For >1000 connections, consider job queue (BullMQ, Inngest)
- **Rate Limiting**: Add per-provider rate limiting
- **Database Indexing**: Monitor query performance, add indexes as needed

## Support

For issues or questions:
1. Check logs in `/admin/logs`
2. Review system health in `/admin/health`
3. Check admin audit log for recent changes
4. Review Vercel deployment logs

---

**Deployment Date**: {{ deployment_date }}
**Version**: 1.0.0
**Status**: ✅ Production Ready

