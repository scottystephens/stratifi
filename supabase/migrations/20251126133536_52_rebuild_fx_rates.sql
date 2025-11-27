/*
  # 52-rebuild-fx-rates.sql

  1. New Tables
    - `fx_rates`
      - `id` (uuid, pk)
      - `currency_from` (text, char(3))
      - `currency_to` (text, char(3))
      - `date` (date) - The effective date of the rate
      - `rate` (numeric) - High precision rate
      - `rate_type` (text) - SPOT, EOM (End of Month), AVG (Monthly Average)
      - `source` (text) - 'open_exchange_rates', 'backfill', 'projection', 'calculated'
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Constraints
    - Unique constraint on (currency_from, currency_to, date, rate_type) to prevent duplicates
    - Check constraint for valid rate types

  3. Indexes
    - Index on date for range queries
    - Index on currency pair for lookup
    - Index on rate_type for filtering

  4. Security
    - Enable RLS (though this is shared data, so maybe global read access)
*/

-- Create custom type for rate types if not exists
DO $$ BEGIN
    CREATE TYPE fx_rate_type AS ENUM ('SPOT', 'EOM', 'AVG');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create the table
CREATE TABLE IF NOT EXISTS public.fx_rates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    currency_from TEXT NOT NULL CHECK (char_length(currency_from) = 3),
    currency_to TEXT NOT NULL CHECK (char_length(currency_to) = 3),
    date DATE NOT NULL,
    rate NUMERIC(20, 10) NOT NULL, -- High precision for rates
    rate_type TEXT NOT NULL DEFAULT 'SPOT' CHECK (rate_type IN ('SPOT', 'EOM', 'AVG')),
    source TEXT NOT NULL DEFAULT 'open_exchange_rates',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint to ensure data integrity
ALTER TABLE public.fx_rates 
DROP CONSTRAINT IF EXISTS fx_rates_unique_entry;

ALTER TABLE public.fx_rates
ADD CONSTRAINT fx_rates_unique_entry UNIQUE (currency_from, currency_to, date, rate_type);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_fx_rates_date ON public.fx_rates(date);
CREATE INDEX IF NOT EXISTS idx_fx_rates_currency_pair ON public.fx_rates(currency_from, currency_to);
CREATE INDEX IF NOT EXISTS idx_fx_rates_type ON public.fx_rates(rate_type);
CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup ON public.fx_rates(currency_from, currency_to, date, rate_type);

-- Enable RLS
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Everyone can read rates
CREATE POLICY "Everyone can view fx rates"
    ON public.fx_rates
    FOR SELECT
    USING (true);

-- Only service role can insert/update/delete (handled by API/cron)
-- We don't need specific RLS for writes if we only use service role for ingestion

