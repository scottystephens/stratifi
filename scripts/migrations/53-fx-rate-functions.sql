/*
  Rate Projection Logic:
  We need a smart way to get the "latest valid rate" for any date, effectively projecting forward.
  Instead of physically creating millions of rows, we use a PostgreSQL function to find the most recent rate.
*/

/*
  # 53-fx-rate-functions.sql

  1. Functions
    - `get_fx_rate(from_curr, to_curr, target_date)`: 
      Returns the rate for the specific date. 
      If no rate exists for that date, it looks back up to 2 years to find the latest available rate (Projected Spot).
    
    - `get_monthly_average(from_curr, to_curr, month_date)`:
      Returns the average rate for a specific month.

    - `get_previous_period_end(from_curr, to_curr, target_date)`:
      Returns the rate from the last day of the *previous* month.
*/

CREATE OR REPLACE FUNCTION public.get_fx_rate(
  p_currency_from TEXT,
  p_currency_to TEXT,
  p_date DATE DEFAULT CURRENT_DATE,
  p_rate_type TEXT DEFAULT 'SPOT'
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  -- 1. Try to find exact match
  SELECT rate INTO v_rate
  FROM public.fx_rates
  WHERE currency_from = p_currency_from
    AND currency_to = p_currency_to
    AND date = p_date
    AND rate_type = p_rate_type;

  -- 2. If not found, look back up to 2 years (projection)
  IF v_rate IS NULL THEN
    SELECT rate INTO v_rate
    FROM public.fx_rates
    WHERE currency_from = p_currency_from
      AND currency_to = p_currency_to
      AND date < p_date
      AND date >= (p_date - INTERVAL '2 years')
      AND rate_type = p_rate_type
    ORDER BY date DESC
    LIMIT 1;
  END IF;

  -- 3. If still null (no history), return null (or handle error in app)
  RETURN v_rate;
END;
$$;

-- Function for Monthly Average
CREATE OR REPLACE FUNCTION public.get_monthly_average(
  p_currency_from TEXT,
  p_currency_to TEXT,
  p_month_date DATE -- Any date within the target month
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_avg_rate NUMERIC;
BEGIN
  SELECT AVG(rate) INTO v_avg_rate
  FROM public.fx_rates
  WHERE currency_from = p_currency_from
    AND currency_to = p_currency_to
    AND date_trunc('month', date) = date_trunc('month', p_month_date)
    AND rate_type = 'SPOT';
    
  RETURN v_avg_rate;
END;
$$;

-- Function for Previous Period End (Last day of previous month)
CREATE OR REPLACE FUNCTION public.get_previous_period_end(
  p_currency_from TEXT,
  p_currency_to TEXT,
  p_target_date DATE
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_rate NUMERIC;
  v_prev_month_end DATE;
BEGIN
  -- Calculate last day of previous month
  v_prev_month_end := (date_trunc('month', p_target_date) - INTERVAL '1 day')::DATE;

  -- Get rate for that date (using our smart get_fx_rate to handle missing weekends/holidays if needed)
  -- Note: We recursively call get_fx_rate to handle "closest available" if the exact end of month is missing
  v_rate := public.get_fx_rate(p_currency_from, p_currency_to, v_prev_month_end, 'SPOT');
  
  RETURN v_rate;
END;
$$;

