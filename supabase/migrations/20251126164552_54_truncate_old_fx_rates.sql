/*
  # 54-truncate-old-fx-rates.sql

  Reduce database size by keeping only 2025 FX rates.
  All rates before 2025-01-01 will be deleted.
*/

-- Delete all rates before 2025 to reduce database size
DELETE FROM public.fx_rates
WHERE date < '2025-01-01';

-- Optional: Add a note about the data reduction
DO $$
BEGIN
  RAISE NOTICE '✅ FX rates data reduced - only 2025 rates retained';
  RAISE NOTICE '   Deleted all rates before 2025-01-01';
  RAISE NOTICE '   To restore historical data, re-run the backfill script';
END $$;
