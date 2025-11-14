-- Exchange Rates Table
-- Stores daily USD to currency exchange rates from external sources

CREATE TABLE IF NOT EXISTS exchange_rates (
  id SERIAL PRIMARY KEY,
  currency_code VARCHAR(3) NOT NULL,
  currency_name VARCHAR(100) NOT NULL,
  rate DECIMAL(18, 8) NOT NULL,
  date DATE NOT NULL,
  source VARCHAR(100) NOT NULL DEFAULT 'frankfurter.app',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure one rate per currency per day
  CONSTRAINT unique_currency_date UNIQUE (currency_code, date)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(date DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency ON exchange_rates(currency_code);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency_date ON exchange_rates(currency_code, date DESC);

-- Comment
COMMENT ON TABLE exchange_rates IS 'Daily USD to currency exchange rates from external sources';
COMMENT ON COLUMN exchange_rates.currency_code IS 'ISO 4217 currency code (e.g., EUR, GBP)';
COMMENT ON COLUMN exchange_rates.rate IS 'Exchange rate from 1 USD to target currency';
COMMENT ON COLUMN exchange_rates.date IS 'Date of the exchange rate';
COMMENT ON COLUMN exchange_rates.source IS 'Data source (e.g., frankfurter.app, ECB)';

