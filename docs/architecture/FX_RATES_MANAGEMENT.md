# FX Rates Architecture & Management

## Overview
Stratiri maintains a comprehensive database of daily foreign exchange rates for 170+ currencies. The system is designed to be self-healing, historically complete, and supports smart triangulation for any currency pair.

## Architecture

### 1. Database Schema (`fx_rates`)
The system uses a single, optimized table for all rate data.

| Column | Type | Description |
|--------|------|-------------|
| `currency_from` | TEXT(3) | Source currency (usually USD) |
| `currency_to` | TEXT(3) | Target currency |
| `date` | DATE | Effective date of the rate |
| `rate` | NUMERIC(20,10) | High-precision exchange rate |
| `rate_type` | ENUM | `SPOT`, `EOM` (End of Month), `AVG` (Monthly Average) |
| `source` | TEXT | 'open_exchange_rates', 'backfill', etc. |

**Constraints:**
- Unique constraint on `(currency_from, currency_to, date, rate_type)` to prevent duplicates.
- Currency codes must be exactly 3 characters.

### 2. Smart SQL Functions
We use database-level functions to handle "projection" logic (finding the latest valid rate if a specific date is missing).

*   **`get_fx_rate(from, to, date)`**: Returns the exact rate if found. If not, it looks back up to **2 years** to find the most recent rate (Projected Spot).
*   **`get_monthly_average(from, to, date)`**: Returns the average rate for the requested month.
*   **`get_previous_period_end(from, to, date)`**: Returns the rate for the last day of the *previous* month.

### 3. Data Sources
*   **Primary Source:** [Open Exchange Rates](https://openexchangerates.org/)
*   **Base Currency:** USD (all other pairs are triangulated)
*   **Update Frequency:** Daily at 00:00 UTC (via Vercel Cron)

## Operations Guide

### 🔄 Daily Updates (Cron)
The system automatically fetches rates via `/api/exchange-rates/update`.
*   **Schedule:** Daily at 00:00 UTC
*   **Logic:** Fetches `Latest` rates + `Last 2 Days` history.
*   **Why?** This "lookback" ensures self-healing. If a job fails one day, the next day's run will fill in the missing gap.

### 🛠️ Manual Backfill
To import historical data from a CSV file (e.g., `fx_rates_daily_backfill.csv`):

1.  **Prepare Environment:**
    Ensure you have the production Supabase keys. You can pull them from Vercel:
    ```bash
    vercel env pull .env.local --environment=production
    ```

2.  **Run the Script:**
    ```bash
    npx tsx scripts/utilities/backfill-csv-rates.ts
    ```
    *Note: The script automatically handles batching (1000 rows/batch) and data cleaning (truncating currency codes to 3 chars).*

### 📊 Querying Rates
Use the `getExchangeRate` helper in `lib/currency.ts` for simplified access:

```typescript
import { getExchangeRate } from '@/lib/currency'

// Get today's SPOT rate (auto-triangulated via USD)
const rate = await getExchangeRate('GBP', 'EUR');

// Get Monthly Average
const avgRate = await getExchangeRate('GBP', 'EUR', new Date(), 'AVG');
```

## Maintenance
*   **Adding Currencies:** No action needed. The system automatically ingests all available currencies from the source.
*   **API Quota:** The Free Tier of Open Exchange Rates (1,000 requests/month) is sufficient for daily updates (30 requests/month).

### Database Size Management
Currently, only 2025 rates are stored to keep database size manageable.

**To Restore Historical Data:**
1. **Run Full Backfill:** `npx tsx scripts/utilities/backfill-csv-rates.ts`
2. **Or Selective Backfill:** Modify the script to filter by date range
3. **Monitor Database Size:** ~1.6M rows = ~200MB, so plan accordingly

**To Delete Old Data:**
```sql
-- Delete rates before a certain date
DELETE FROM public.fx_rates WHERE date < '2025-01-01';
```

