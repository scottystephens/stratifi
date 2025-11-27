/*
  # 55-calculate-eom-avg-rates.sql
  
  Purpose:
    - Calculate End of Month (EOM) rates from existing SPOT data
    - Calculate Monthly Average (AVG) rates from existing SPOT data
    - Create a stored procedure to automatically maintain these rates
  
  Strategy:
    1. For EOM: Take the last SPOT rate of each month for each currency pair
    2. For AVG: Calculate the average of all SPOT rates in each month for each pair
    3. Create trigger/function to auto-generate EOM/AVG when new SPOT rates inserted
*/

-- ============================================================================
-- PART 1: Backfill End of Month (EOM) rates
-- ============================================================================

DO $$
DECLARE
  v_inserted_count INT := 0;
BEGIN
  -- Insert EOM rates by selecting the last rate of each month for each pair
  INSERT INTO public.fx_rates (
    currency_from,
    currency_to,
    date,
    rate,
    rate_type,
    source,
    created_at,
    updated_at
  )
  SELECT DISTINCT ON (currency_from, currency_to, date_trunc('month', date))
    currency_from,
    currency_to,
    date,  -- This will be the last date of the month due to ORDER BY
    rate,
    'EOM' as rate_type,
    source || '_calculated_eom' as source,
    NOW() as created_at,
    NOW() as updated_at
  FROM public.fx_rates
  WHERE rate_type = 'SPOT'
  ORDER BY 
    currency_from,
    currency_to,
    date_trunc('month', date),
    date DESC  -- Get the last date in each month
  ON CONFLICT (currency_from, currency_to, date, rate_type) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RAISE NOTICE 'Inserted % EOM rates', v_inserted_count;
END $$;

-- ============================================================================
-- PART 2: Backfill Monthly Average (AVG) rates
-- ============================================================================

DO $$
DECLARE
  v_inserted_count INT := 0;
BEGIN
  -- Insert AVG rates by calculating average for each month/pair
  -- We'll use the first day of the month as the date for monthly averages
  INSERT INTO public.fx_rates (
    currency_from,
    currency_to,
    date,
    rate,
    rate_type,
    source,
    created_at,
    updated_at
  )
  SELECT
    currency_from,
    currency_to,
    DATE_TRUNC('month', date)::DATE as date,  -- First day of month
    AVG(rate) as rate,
    'AVG' as rate_type,
    MAX(source) || '_calculated_avg' as source,
    NOW() as created_at,
    NOW() as updated_at
  FROM public.fx_rates
  WHERE rate_type = 'SPOT'
  GROUP BY 
    currency_from,
    currency_to,
    DATE_TRUNC('month', date)
  ON CONFLICT (currency_from, currency_to, date, rate_type) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RAISE NOTICE 'Inserted % AVG rates', v_inserted_count;
END $$;

-- ============================================================================
-- PART 3: Create function to automatically calculate EOM/AVG rates
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_derived_fx_rates(
  p_currency_from TEXT,
  p_currency_to TEXT,
  p_month_date DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month_start DATE;
  v_month_end DATE;
  v_eom_rate NUMERIC;
  v_avg_rate NUMERIC;
  v_source TEXT;
  v_last_date DATE;
BEGIN
  -- Calculate month boundaries
  v_month_start := DATE_TRUNC('month', p_month_date)::DATE;
  v_month_end := (DATE_TRUNC('month', p_month_date) + INTERVAL '1 month - 1 day')::DATE;

  -- Get the source from existing SPOT data
  SELECT source INTO v_source
  FROM public.fx_rates
  WHERE currency_from = p_currency_from
    AND currency_to = p_currency_to
    AND rate_type = 'SPOT'
    AND date >= v_month_start
    AND date <= v_month_end
  LIMIT 1;

  IF v_source IS NULL THEN
    -- No SPOT data for this month, nothing to calculate
    RETURN;
  END IF;

  -- Calculate EOM rate (last rate in the month)
  SELECT rate, date INTO v_eom_rate, v_last_date
  FROM public.fx_rates
  WHERE currency_from = p_currency_from
    AND currency_to = p_currency_to
    AND rate_type = 'SPOT'
    AND date >= v_month_start
    AND date <= v_month_end
  ORDER BY date DESC
  LIMIT 1;

  -- Insert or update EOM rate
  IF v_eom_rate IS NOT NULL THEN
    INSERT INTO public.fx_rates (
      currency_from,
      currency_to,
      date,
      rate,
      rate_type,
      source,
      created_at,
      updated_at
    ) VALUES (
      p_currency_from,
      p_currency_to,
      v_last_date,
      v_eom_rate,
      'EOM',
      v_source || '_calculated_eom',
      NOW(),
      NOW()
    )
    ON CONFLICT (currency_from, currency_to, date, rate_type)
    DO UPDATE SET
      rate = EXCLUDED.rate,
      updated_at = NOW();
  END IF;

  -- Calculate Monthly Average
  SELECT AVG(rate) INTO v_avg_rate
  FROM public.fx_rates
  WHERE currency_from = p_currency_from
    AND currency_to = p_currency_to
    AND rate_type = 'SPOT'
    AND date >= v_month_start
    AND date <= v_month_end;

  -- Insert or update AVG rate (using first day of month as the date)
  IF v_avg_rate IS NOT NULL THEN
    INSERT INTO public.fx_rates (
      currency_from,
      currency_to,
      date,
      rate,
      rate_type,
      source,
      created_at,
      updated_at
    ) VALUES (
      p_currency_from,
      p_currency_to,
      v_month_start,  -- First day of month for AVG
      v_avg_rate,
      'AVG',
      v_source || '_calculated_avg',
      NOW(),
      NOW()
    )
    ON CONFLICT (currency_from, currency_to, date, rate_type)
    DO UPDATE SET
      rate = EXCLUDED.rate,
      updated_at = NOW();
  END IF;
END;
$$;

-- ============================================================================
-- PART 4: Create trigger to auto-calculate on SPOT insert/update
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_calculate_derived_fx_rates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only trigger for SPOT rates
  IF NEW.rate_type = 'SPOT' THEN
    -- Calculate derived rates for the month of this new/updated SPOT rate
    PERFORM public.calculate_derived_fx_rates(
      NEW.currency_from,
      NEW.currency_to,
      NEW.date
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_calculate_derived_fx_rates ON public.fx_rates;

-- Create trigger that fires after INSERT or UPDATE on fx_rates
CREATE TRIGGER trg_calculate_derived_fx_rates
  AFTER INSERT OR UPDATE ON public.fx_rates
  FOR EACH ROW
  WHEN (NEW.rate_type = 'SPOT')
  EXECUTE FUNCTION public.trigger_calculate_derived_fx_rates();

-- ============================================================================
-- PART 5: Create maintenance function to recalculate all derived rates
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_all_derived_fx_rates(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE(
  currency_pair TEXT,
  months_processed INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_pair RECORD;
  v_month_date DATE;
  v_months_count INT;
BEGIN
  -- Default to all available data if dates not provided
  v_start_date := COALESCE(p_start_date, (SELECT MIN(date) FROM public.fx_rates WHERE rate_type = 'SPOT'));
  v_end_date := COALESCE(p_end_date, (SELECT MAX(date) FROM public.fx_rates WHERE rate_type = 'SPOT'));

  RAISE NOTICE 'Recalculating derived rates from % to %', v_start_date, v_end_date;

  -- For each unique currency pair with SPOT data
  FOR v_pair IN
    SELECT DISTINCT currency_from, currency_to
    FROM public.fx_rates
    WHERE rate_type = 'SPOT'
      AND date >= v_start_date
      AND date <= v_end_date
    ORDER BY currency_from, currency_to
  LOOP
    v_months_count := 0;
    
    -- For each month in the date range
    v_month_date := DATE_TRUNC('month', v_start_date)::DATE;
    WHILE v_month_date <= v_end_date LOOP
      -- Calculate derived rates for this pair and month
      PERFORM public.calculate_derived_fx_rates(
        v_pair.currency_from,
        v_pair.currency_to,
        v_month_date
      );
      
      v_months_count := v_months_count + 1;
      v_month_date := (v_month_date + INTERVAL '1 month')::DATE;
    END LOOP;

    currency_pair := v_pair.currency_from || '/' || v_pair.currency_to;
    months_processed := v_months_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ============================================================================
-- Verification queries (commented out - uncomment to run manually)
-- ============================================================================

-- Check results:
-- SELECT rate_type, COUNT(*) as count, MIN(date) as earliest, MAX(date) as latest
-- FROM public.fx_rates
-- GROUP BY rate_type
-- ORDER BY rate_type;

-- Check a specific pair:
-- SELECT currency_from, currency_to, date, rate, rate_type
-- FROM public.fx_rates
-- WHERE currency_from = 'USD' AND currency_to = 'EUR'
--   AND date >= '2025-01-01'
-- ORDER BY rate_type, date;


