# Migration 55: Calculate EOM and AVG Rates

**Date:** 2025-11-27  
**Migration:** `55-calculate-eom-avg-rates.sql`

## Purpose

Automatically generate End of Month (EOM) and Monthly Average (AVG) exchange rates from existing SPOT data, and create stored procedures to maintain these rates going forward.

## What It Does

### 1. Backfills Historical Data
- **EOM Rates:** Takes the last SPOT rate of each month for each currency pair
- **AVG Rates:** Calculates the average of all SPOT rates in each month for each pair
- Result: **12,397 EOM** and **12,397 AVG** rates inserted from existing SPOT data

### 2. Creates Stored Procedures

#### `calculate_derived_fx_rates(currency_from, currency_to, month_date)`
- Calculates EOM and AVG rates for a specific currency pair and month
- Uses existing SPOT data to derive the rates
- Handles upserts (creates or updates existing rates)

#### `recalculate_all_derived_fx_rates(start_date, end_date)`
- Recalculates all derived rates for a date range
- Useful for bulk updates or corrections
- Returns a summary of processing (pairs processed, months calculated)

### 3. Creates Automatic Trigger
- **Trigger:** `trg_calculate_derived_fx_rates`
- **Fires:** After INSERT or UPDATE on `fx_rates` table
- **Condition:** Only for SPOT rate types
- **Action:** Automatically calculates EOM and AVG rates for the affected month

## How It Works

### EOM Calculation
```sql
-- For each currency pair and month:
-- 1. Find all SPOT rates in that month
-- 2. Take the rate with the latest date
-- 3. Insert as EOM type with that date
```

Example:
- SPOT rates for USD/EUR in January 2025:
  - Jan 1: 0.9658
  - Jan 15: 0.9700
  - Jan 31: 0.9620 ← **This becomes the EOM rate**

### AVG Calculation
```sql
-- For each currency pair and month:
-- 1. Find all SPOT rates in that month
-- 2. Calculate the average
-- 3. Insert as AVG type with first day of month as date
```

Example:
- SPOT rates for USD/EUR in January 2025:
  - Average of all daily rates = 0.9660 ← **This becomes the AVG rate**
  - Date stored: 2025-01-01 (first day of month)

## Automatic Maintenance

Going forward, whenever new SPOT rates are inserted (e.g., from the daily cron job), the trigger automatically:

1. Detects the new SPOT rate
2. Identifies which month it belongs to
3. Recalculates EOM (updates to the latest date in the month)
4. Recalculates AVG (updates the average for the month)

## Verification

After migration, you can verify:

```sql
-- Check counts by rate type
SELECT rate_type, COUNT(*) as count, MIN(date) as earliest, MAX(date) as latest
FROM public.fx_rates
GROUP BY rate_type
ORDER BY rate_type;

-- Check specific pair
SELECT date, rate, rate_type
FROM public.fx_rates
WHERE currency_from = 'EUR' AND currency_to = 'USD'
  AND date >= '2025-01-01'
ORDER BY rate_type, date;
```

## UI Impact

The Exchange Rates page (`/rates`) now shows actual data when switching between:
- **Spot Rate** - Daily rates
- **End of Month** - Last rate of each month
- **Monthly Avg** - Average rate for each month

## Manual Recalculation

If you need to recalculate derived rates (e.g., after fixing SPOT data):

```sql
-- Recalculate all derived rates
SELECT * FROM public.recalculate_all_derived_fx_rates();

-- Recalculate for specific date range
SELECT * FROM public.recalculate_all_derived_fx_rates('2025-01-01', '2025-12-31');
```

## Source Attribution

All derived rates have modified source strings:
- EOM: `{original_source}_calculated_eom`
- AVG: `{original_source}_calculated_avg`

This makes it clear they were calculated from SPOT data.

## Performance

- Trigger overhead: Minimal (only fires on SPOT inserts/updates)
- Backfill time: ~1 second for 12,000+ rates
- Daily maintenance: Automatic with no manual intervention

## Related Files

- **Migration:** `scripts/migrations/55-calculate-eom-avg-rates.sql`
- **Service:** `lib/services/exchange-rate-service.ts`
- **API:** `app/api/rates/history/route.ts`
- **Test Script:** `scripts/utilities/test-fx-rates.ts`

