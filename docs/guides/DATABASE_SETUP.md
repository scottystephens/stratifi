# Database Setup for Exchange Rates

## Quick Setup with Vercel Postgres (Recommended)

### 1. Create Vercel Postgres Database

1. Go to your Vercel Dashboard: https://vercel.com/dashboard
2. Select your `stratiri` project
3. Go to **Storage** tab
4. Click **Create Database**
5. Select **Postgres**
6. Choose a database name (e.g., `stratiri-db`)
7. Select region (choose closest to your users)
8. Click **Create**

### 2. Connect Database to Project

Vercel automatically adds the `DATABASE_URL` environment variable to your project. 

To verify:
1. Go to **Settings** → **Environment Variables**
2. You should see `POSTGRES_URL` or `DATABASE_URL`

### 3. Create Exchange Rates Table

Run this command from your local machine:

```bash
# Get your database URL from Vercel
# Go to Storage → Your Database → .env.local tab
# Copy the DATABASE_URL

export DATABASE_URL="your-connection-string-here"

# Create the table
psql $DATABASE_URL -f scripts/create-exchange-rates-table.sql
```

Or manually run this SQL:

```sql
CREATE TABLE IF NOT EXISTS exchange_rates (
  id SERIAL PRIMARY KEY,
  currency_code VARCHAR(3) NOT NULL,
  currency_name VARCHAR(100) NOT NULL,
  rate DECIMAL(18, 8) NOT NULL,
  date DATE NOT NULL,
  source VARCHAR(100) NOT NULL DEFAULT 'frankfurter.app',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_currency_date UNIQUE (currency_code, date)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(date DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency ON exchange_rates(currency_code);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency_date ON exchange_rates(currency_code, date DESC);
```

### 4. Backfill Historical Data from 2025

Install ts-node if you don't have it:
```bash
npm install -g ts-node
```

Run the backfill script:

```bash
cd /Users/scottstephens/stratiri

# Set your database URL
export DATABASE_URL="your-connection-string-here"

# Backfill from January 1, 2025 to today
npx ts-node scripts/backfill-exchange-rates.ts 2025-01-01
```

This will:
- Fetch rates from Frankfurter.app (free ECB data)
- Insert ~300 days × 20 currencies = ~6,000 records
- Take about 30-60 seconds
- Show progress for each date and currency

### 5. Trigger Manual Update

Test the update endpoint:

```bash
curl -X POST https://stratiri-pi.vercel.app/api/exchange-rates/update
```

You should see:
```json
{
  "success": true,
  "message": "Updated 20 exchange rates",
  "date": "2025-11-07",
  "source": "frankfurter.app",
  "updated": 20,
  "failed": 0,
  "duration": "1234ms"
}
```

### 6. Verify Data

```bash
curl https://stratiri-pi.vercel.app/api/exchange-rates
```

You should see real rates instead of fallback data.

## Alternative: Use Another PostgreSQL Provider

### Supabase (Free Tier)

1. Go to https://supabase.com
2. Create new project
3. Copy connection string
4. Add to Vercel Environment Variables as `DATABASE_URL`
5. Run table creation SQL in Supabase SQL Editor
6. Run backfill script

### Neon (Free Tier)

1. Go to https://neon.tech
2. Create new project
3. Copy connection string
4. Add to Vercel Environment Variables as `DATABASE_URL`
5. Run table creation SQL
6. Run backfill script

### Railway

1. Go to https://railway.app
2. Create new Postgres database
3. Copy connection string
4. Add to Vercel Environment Variables as `DATABASE_URL`
5. Run table creation SQL
6. Run backfill script

## Troubleshooting

### "Database not configured" message

- Check that `DATABASE_URL` is set in Vercel Environment Variables
- Redeploy your app after adding the environment variable

### Connection refused

- Make sure your IP is whitelisted (some providers require this)
- Check that the connection string is correct
- Verify SSL settings in connection string

### Backfill script fails

- Make sure `DATABASE_URL` is exported in your terminal
- Check that the table exists
- Verify network connection
- Try running for a shorter date range first: `npx ts-node scripts/backfill-exchange-rates.ts 2025-11-01`

### Cron job not running

- Verify `vercel.json` is committed and deployed
- Check Vercel Dashboard → Cron Jobs tab
- Add `CRON_SECRET` environment variable for security (optional)

## Security (Optional but Recommended)

Add a cron secret to protect your update endpoint:

1. Generate a secret:
```bash
openssl rand -base64 32
```

2. Add to Vercel Environment Variables:
```
CRON_SECRET=your-generated-secret
```

3. Update endpoint will now require authentication:
```bash
curl -X POST https://stratiri-pi.vercel.app/api/exchange-rates/update \
  -H "Authorization: Bearer your-generated-secret"
```

## Monitoring

### Check Cron Logs

1. Go to Vercel Dashboard
2. Select your project
3. Go to **Cron Jobs** tab
4. View execution history and logs

### Manual Queries

Connect to your database and run:

```sql
-- Count total rates
SELECT COUNT(*) FROM exchange_rates;

-- Get latest date
SELECT MAX(date) FROM exchange_rates;

-- Check rates for today
SELECT * FROM exchange_rates 
WHERE date = CURRENT_DATE 
ORDER BY currency_code;

-- View rate history for EUR
SELECT date, rate 
FROM exchange_rates 
WHERE currency_code = 'EUR' 
ORDER BY date DESC 
LIMIT 30;
```

## Next Steps

After setup:
1. ✅ Visit https://stratiri-pi.vercel.app/rates
2. ✅ Verify no "Using Fallback Data" warning
3. ✅ See 20 currencies with real rates
4. ✅ Check "Last updated" date
5. ✅ Cron will automatically update daily at 00:00 UTC

## Cost

All these options have generous free tiers:
- **Vercel Postgres**: Free tier includes 256 MB storage, 60 hours compute/month
- **Supabase**: Free tier includes 500 MB database, unlimited API requests
- **Neon**: Free tier includes 0.5 GB storage, always-available compute
- **Frankfurter API**: Completely free, no limits, no API key

Perfect for this use case with ~6,000-10,000 records per year.

