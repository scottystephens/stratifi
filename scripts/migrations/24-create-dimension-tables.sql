-- =====================================================
-- Core Dimension Tables for Stratiri
-- Migration 24: Add dimension tables for currencies, countries, account types, etc.
-- =====================================================

-- =====================================================
-- 1. CURRENCIES DIMENSION
-- =====================================================

CREATE TABLE IF NOT EXISTS public.currencies (
  currency_code VARCHAR(3) PRIMARY KEY, -- ISO 4217 code (USD, EUR, GBP)
  currency_name TEXT NOT NULL,
  currency_symbol TEXT NOT NULL, -- $, €, £
  decimal_places SMALLINT NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_format TEXT, -- e.g., "$1,234.56" or "1.234,56 €"
  region TEXT, -- Primary region (Americas, Europe, Asia, etc.)
  is_crypto BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Common currencies
INSERT INTO public.currencies (currency_code, currency_name, currency_symbol, decimal_places, region) VALUES
  ('USD', 'United States Dollar', '$', 2, 'Americas'),
  ('EUR', 'Euro', '€', 2, 'Europe'),
  ('GBP', 'British Pound Sterling', '£', 2, 'Europe'),
  ('JPY', 'Japanese Yen', '¥', 0, 'Asia'),
  ('CHF', 'Swiss Franc', 'CHF', 2, 'Europe'),
  ('CAD', 'Canadian Dollar', 'C$', 2, 'Americas'),
  ('AUD', 'Australian Dollar', 'A$', 2, 'Oceania'),
  ('CNY', 'Chinese Yuan', '¥', 2, 'Asia'),
  ('INR', 'Indian Rupee', '₹', 2, 'Asia'),
  ('SGD', 'Singapore Dollar', 'S$', 2, 'Asia'),
  ('HKD', 'Hong Kong Dollar', 'HK$', 2, 'Asia'),
  ('NZD', 'New Zealand Dollar', 'NZ$', 2, 'Oceania'),
  ('SEK', 'Swedish Krona', 'kr', 2, 'Europe'),
  ('NOK', 'Norwegian Krone', 'kr', 2, 'Europe'),
  ('DKK', 'Danish Krone', 'kr', 2, 'Europe'),
  ('ZAR', 'South African Rand', 'R', 2, 'Africa'),
  ('BRL', 'Brazilian Real', 'R$', 2, 'Americas'),
  ('MXN', 'Mexican Peso', '$', 2, 'Americas'),
  ('KRW', 'South Korean Won', '₩', 0, 'Asia'),
  ('THB', 'Thai Baht', '฿', 2, 'Asia')
ON CONFLICT (currency_code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_currencies_active ON public.currencies(is_active);
CREATE INDEX IF NOT EXISTS idx_currencies_region ON public.currencies(region);

-- =====================================================
-- 2. COUNTRIES/LOCATIONS DIMENSION
-- =====================================================

CREATE TABLE IF NOT EXISTS public.countries (
  country_code VARCHAR(2) PRIMARY KEY, -- ISO 3166-1 alpha-2 (US, GB, FR)
  country_code_3 VARCHAR(3) UNIQUE NOT NULL, -- ISO 3166-1 alpha-3 (USA, GBR, FRA)
  country_name TEXT NOT NULL,
  region TEXT NOT NULL, -- Europe, Americas, Asia, Africa, Oceania
  subregion TEXT, -- Western Europe, North America, etc.
  currency_code VARCHAR(3) REFERENCES public.currencies(currency_code),
  phone_code TEXT, -- +1, +44, +33
  capital TEXT,
  languages TEXT[], -- ['en', 'es', 'fr']
  is_eu_member BOOLEAN DEFAULT false,
  is_tax_haven BOOLEAN DEFAULT false,
  regulatory_framework TEXT, -- e.g., 'GDPR', 'SOX', 'MiFID II'
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Major countries
INSERT INTO public.countries (country_code, country_code_3, country_name, region, subregion, currency_code, phone_code, is_eu_member) VALUES
  ('US', 'USA', 'United States', 'Americas', 'North America', 'USD', '+1', false),
  ('GB', 'GBR', 'United Kingdom', 'Europe', 'Northern Europe', 'GBP', '+44', false),
  ('DE', 'DEU', 'Germany', 'Europe', 'Western Europe', 'EUR', '+49', true),
  ('FR', 'FRA', 'France', 'Europe', 'Western Europe', 'EUR', '+33', true),
  ('IT', 'ITA', 'Italy', 'Europe', 'Southern Europe', 'EUR', '+39', true),
  ('ES', 'ESP', 'Spain', 'Europe', 'Southern Europe', 'EUR', '+34', true),
  ('NL', 'NLD', 'Netherlands', 'Europe', 'Western Europe', 'EUR', '+31', true),
  ('BE', 'BEL', 'Belgium', 'Europe', 'Western Europe', 'EUR', '+32', true),
  ('CH', 'CHE', 'Switzerland', 'Europe', 'Western Europe', 'CHF', '+41', false),
  ('AT', 'AUT', 'Austria', 'Europe', 'Western Europe', 'EUR', '+43', true),
  ('IE', 'IRL', 'Ireland', 'Europe', 'Northern Europe', 'EUR', '+353', true),
  ('CA', 'CAN', 'Canada', 'Americas', 'North America', 'CAD', '+1', false),
  ('AU', 'AUS', 'Australia', 'Oceania', 'Australia and New Zealand', 'AUD', '+61', false),
  ('NZ', 'NZL', 'New Zealand', 'Oceania', 'Australia and New Zealand', 'NZD', '+64', false),
  ('SG', 'SGP', 'Singapore', 'Asia', 'South-Eastern Asia', 'SGD', '+65', false),
  ('HK', 'HKG', 'Hong Kong', 'Asia', 'Eastern Asia', 'HKD', '+852', false),
  ('JP', 'JPN', 'Japan', 'Asia', 'Eastern Asia', 'JPY', '+81', false),
  ('CN', 'CHN', 'China', 'Asia', 'Eastern Asia', 'CNY', '+86', false),
  ('IN', 'IND', 'India', 'Asia', 'Southern Asia', 'INR', '+91', false),
  ('ZA', 'ZAF', 'South Africa', 'Africa', 'Southern Africa', 'ZAR', '+27', false),
  ('BR', 'BRA', 'Brazil', 'Americas', 'South America', 'BRL', '+55', false),
  ('MX', 'MEX', 'Mexico', 'Americas', 'Central America', 'MXN', '+52', false),
  ('SE', 'SWE', 'Sweden', 'Europe', 'Northern Europe', 'SEK', '+46', true),
  ('NO', 'NOR', 'Norway', 'Europe', 'Northern Europe', 'NOK', '+47', false),
  ('DK', 'DNK', 'Denmark', 'Europe', 'Northern Europe', 'DKK', '+45', true),
  ('FI', 'FIN', 'Finland', 'Europe', 'Northern Europe', 'EUR', '+358', true),
  ('PL', 'POL', 'Poland', 'Europe', 'Eastern Europe', 'EUR', '+48', true),
  ('PT', 'PRT', 'Portugal', 'Europe', 'Southern Europe', 'EUR', '+351', true),
  ('GR', 'GRC', 'Greece', 'Europe', 'Southern Europe', 'EUR', '+30', true),
  ('CZ', 'CZE', 'Czech Republic', 'Europe', 'Eastern Europe', 'EUR', '+420', true)
ON CONFLICT (country_code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_countries_region ON public.countries(region);
CREATE INDEX IF NOT EXISTS idx_countries_currency ON public.countries(currency_code);
CREATE INDEX IF NOT EXISTS idx_countries_eu ON public.countries(is_eu_member);
CREATE INDEX IF NOT EXISTS idx_countries_active ON public.countries(is_active);

-- =====================================================
-- 3. ACCOUNT TYPES DIMENSION
-- =====================================================

CREATE TABLE IF NOT EXISTS public.account_types (
  type_code VARCHAR(50) PRIMARY KEY,
  type_name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'Asset', 'Liability', 'Operating', 'Investment'
  sub_category TEXT, -- 'Current Asset', 'Long-term Asset', 'Short-term Liability'
  description TEXT,
  is_cash_account BOOLEAN DEFAULT false,
  is_interest_bearing BOOLEAN DEFAULT false,
  typical_currency_types TEXT[], -- ['fiat', 'crypto', 'commodity']
  reporting_group TEXT, -- For financial reporting grouping
  display_order INTEGER, -- Sort order in dropdowns
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.account_types (type_code, type_name, category, sub_category, is_cash_account, is_interest_bearing, display_order) VALUES
  ('checking', 'Checking Account', 'Asset', 'Current Asset', true, false, 1),
  ('savings', 'Savings Account', 'Asset', 'Current Asset', true, true, 2),
  ('money_market', 'Money Market Account', 'Asset', 'Current Asset', true, true, 3),
  ('certificate_deposit', 'Certificate of Deposit', 'Asset', 'Current Asset', true, true, 4),
  ('credit_card', 'Credit Card', 'Liability', 'Short-term Liability', false, false, 5),
  ('line_of_credit', 'Line of Credit', 'Liability', 'Short-term Liability', false, true, 6),
  ('loan', 'Loan Account', 'Liability', 'Long-term Liability', false, true, 7),
  ('mortgage', 'Mortgage', 'Liability', 'Long-term Liability', false, true, 8),
  ('investment_brokerage', 'Investment Brokerage', 'Asset', 'Investment', false, false, 9),
  ('retirement_401k', '401(k) Retirement', 'Asset', 'Investment', false, false, 10),
  ('retirement_ira', 'IRA Retirement', 'Asset', 'Investment', false, false, 11),
  ('pension', 'Pension Account', 'Asset', 'Investment', false, false, 12),
  ('trust', 'Trust Account', 'Asset', 'Current Asset', true, false, 13),
  ('escrow', 'Escrow Account', 'Asset', 'Current Asset', true, false, 14),
  ('merchant', 'Merchant Account', 'Asset', 'Current Asset', true, false, 15),
  ('payroll', 'Payroll Account', 'Asset', 'Current Asset', true, false, 16),
  ('treasury', 'Treasury Account', 'Asset', 'Current Asset', true, true, 17),
  ('foreign_exchange', 'Foreign Exchange Account', 'Asset', 'Current Asset', true, false, 18),
  ('crypto_wallet', 'Cryptocurrency Wallet', 'Asset', 'Investment', false, false, 19),
  ('other', 'Other', 'Asset', 'Other', false, false, 99)
ON CONFLICT (type_code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_account_types_category ON public.account_types(category);
CREATE INDEX IF NOT EXISTS idx_account_types_cash ON public.account_types(is_cash_account);
CREATE INDEX IF NOT EXISTS idx_account_types_active ON public.account_types(is_active);

-- =====================================================
-- 4. TRANSACTION CATEGORIES DIMENSION
-- =====================================================

CREATE TABLE IF NOT EXISTS public.transaction_categories (
  category_code VARCHAR(50) PRIMARY KEY,
  category_name TEXT NOT NULL,
  parent_category VARCHAR(50) REFERENCES public.transaction_categories(category_code),
  category_type TEXT NOT NULL CHECK (category_type IN ('Income', 'Expense', 'Transfer', 'Investment')),
  description TEXT,
  is_tax_deductible BOOLEAN DEFAULT false,
  gl_account_mapping TEXT, -- For GL integration
  display_order INTEGER,
  icon_name TEXT, -- For UI display
  color_code TEXT, -- Hex color for charts
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Top-level categories
INSERT INTO public.transaction_categories (category_code, category_name, parent_category, category_type, display_order, color_code) VALUES
  -- Income
  ('income', 'Income', NULL, 'Income', 1, '#10b981'),
  ('income_salary', 'Salary & Wages', 'income', 'Income', 11, '#059669'),
  ('income_business', 'Business Income', 'income', 'Income', 12, '#047857'),
  ('income_investment', 'Investment Income', 'income', 'Income', 13, '#065f46'),
  ('income_rental', 'Rental Income', 'income', 'Income', 14, '#064e3b'),
  ('income_other', 'Other Income', 'income', 'Income', 19, '#6ee7b7'),
  
  -- Operating Expenses
  ('expense', 'Expenses', NULL, 'Expense', 2, '#ef4444'),
  ('expense_payroll', 'Payroll & Benefits', 'expense', 'Expense', 21, '#dc2626'),
  ('expense_rent', 'Rent & Lease', 'expense', 'Expense', 22, '#b91c1c'),
  ('expense_utilities', 'Utilities', 'expense', 'Expense', 23, '#991b1b'),
  ('expense_insurance', 'Insurance', 'expense', 'Expense', 24, '#7f1d1d'),
  ('expense_marketing', 'Marketing & Advertising', 'expense', 'Expense', 25, '#fca5a5'),
  ('expense_travel', 'Travel & Entertainment', 'expense', 'Expense', 26, '#f87171'),
  ('expense_supplies', 'Office Supplies', 'expense', 'Expense', 27, '#ef4444'),
  ('expense_professional', 'Professional Services', 'expense', 'Expense', 28, '#dc2626'),
  ('expense_technology', 'Technology & Software', 'expense', 'Expense', 29, '#b91c1c'),
  ('expense_taxes', 'Taxes & Fees', 'expense', 'Expense', 30, '#991b1b'),
  ('expense_other', 'Other Expenses', 'expense', 'Expense', 39, '#fecaca'),
  
  -- Transfers
  ('transfer', 'Transfers', NULL, 'Transfer', 3, '#3b82f6'),
  ('transfer_internal', 'Internal Transfer', 'transfer', 'Transfer', 31, '#2563eb'),
  ('transfer_external', 'External Transfer', 'transfer', 'Transfer', 32, '#1d4ed8'),
  ('transfer_loan', 'Loan Payment', 'transfer', 'Transfer', 33, '#1e40af'),
  
  -- Investments
  ('investment', 'Investments', NULL, 'Investment', 4, '#8b5cf6'),
  ('investment_purchase', 'Investment Purchase', 'investment', 'Investment', 41, '#7c3aed'),
  ('investment_sale', 'Investment Sale', 'investment', 'Investment', 42, '#6d28d9'),
  ('investment_dividend', 'Dividend', 'investment', 'Investment', 43, '#5b21b6'),
  
  -- Uncategorized
  ('uncategorized', 'Uncategorized', NULL, 'Expense', 99, '#6b7280')
ON CONFLICT (category_code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_transaction_categories_type ON public.transaction_categories(category_type);
CREATE INDEX IF NOT EXISTS idx_transaction_categories_parent ON public.transaction_categories(parent_category);
CREATE INDEX IF NOT EXISTS idx_transaction_categories_active ON public.transaction_categories(is_active);

-- =====================================================
-- 5. PAYMENT METHODS DIMENSION
-- =====================================================

CREATE TABLE IF NOT EXISTS public.payment_methods (
  method_code VARCHAR(50) PRIMARY KEY,
  method_name TEXT NOT NULL,
  method_type TEXT NOT NULL, -- 'Electronic', 'Paper', 'Cash', 'Crypto'
  description TEXT,
  processing_time_days INTEGER, -- Typical processing time
  is_reversible BOOLEAN DEFAULT true,
  requires_clearing BOOLEAN DEFAULT false, -- ACH, checks require clearing
  typical_cost_percentage DECIMAL(5,2), -- Typical transaction cost
  supported_currencies TEXT[], -- Specific currencies or ['ALL']
  provider_names TEXT[], -- Common providers (e.g., ['Visa', 'Mastercard'])
  display_order INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.payment_methods (method_code, method_name, method_type, processing_time_days, is_reversible, requires_clearing, display_order) VALUES
  ('wire', 'Wire Transfer', 'Electronic', 1, false, false, 1),
  ('ach', 'ACH Transfer', 'Electronic', 3, true, true, 2),
  ('sepa', 'SEPA Transfer', 'Electronic', 1, true, false, 3),
  ('swift', 'SWIFT Transfer', 'Electronic', 2, false, false, 4),
  ('card_debit', 'Debit Card', 'Electronic', 1, true, false, 5),
  ('card_credit', 'Credit Card', 'Electronic', 1, true, false, 6),
  ('check', 'Check', 'Paper', 5, true, true, 7),
  ('cash', 'Cash', 'Cash', 0, false, false, 8),
  ('direct_debit', 'Direct Debit', 'Electronic', 3, true, true, 9),
  ('standing_order', 'Standing Order', 'Electronic', 1, false, false, 10),
  ('faster_payments', 'Faster Payments (UK)', 'Electronic', 0, false, false, 11),
  ('instant_payment', 'Instant Payment', 'Electronic', 0, false, false, 12),
  ('paypal', 'PayPal', 'Electronic', 1, true, false, 13),
  ('stripe', 'Stripe', 'Electronic', 2, true, false, 14),
  ('crypto', 'Cryptocurrency', 'Crypto', 0, false, false, 15),
  ('other', 'Other', 'Electronic', 3, true, false, 99)
ON CONFLICT (method_code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_payment_methods_type ON public.payment_methods(method_type);
CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON public.payment_methods(is_active);

-- =====================================================
-- 6. FINANCIAL INSTITUTIONS DIMENSION
-- =====================================================

CREATE TABLE IF NOT EXISTS public.financial_institutions (
  institution_id TEXT PRIMARY KEY, -- SWIFT BIC or unique ID
  institution_name TEXT NOT NULL,
  short_name TEXT,
  institution_type TEXT, -- 'Bank', 'Credit Union', 'Investment Firm', 'Fintech'
  country_code VARCHAR(2) REFERENCES public.countries(country_code),
  swift_code TEXT,
  routing_numbers TEXT[], -- For US banks (ABA routing numbers)
  sort_codes TEXT[], -- For UK banks
  website TEXT,
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sample institutions
INSERT INTO public.financial_institutions (institution_id, institution_name, short_name, institution_type, country_code, swift_code) VALUES
  ('chase', 'JPMorgan Chase Bank', 'Chase', 'Bank', 'US', 'CHASUS33'),
  ('bofa', 'Bank of America', 'BofA', 'Bank', 'US', 'BOFAUS3N'),
  ('wells_fargo', 'Wells Fargo Bank', 'Wells Fargo', 'Bank', 'US', 'WFBIUS6S'),
  ('citi', 'Citibank', 'Citi', 'Bank', 'US', 'CITIUS33'),
  ('hsbc', 'HSBC Bank', 'HSBC', 'Bank', 'GB', 'HSBCGB2L'),
  ('barclays', 'Barclays Bank', 'Barclays', 'Bank', 'GB', 'BARCGB22'),
  ('deutsche', 'Deutsche Bank', 'Deutsche', 'Bank', 'DE', 'DEUTDEFF'),
  ('bnp_paribas', 'BNP Paribas', 'BNP', 'Bank', 'FR', 'BNPAFRPP'),
  ('ing', 'ING Bank', 'ING', 'Bank', 'NL', 'INGBNL2A'),
  ('rabobank', 'Rabobank', 'Rabo', 'Bank', 'NL', 'RABONL2U'),
  ('ubs', 'UBS AG', 'UBS', 'Bank', 'CH', 'UBSWCHZH80A'),
  ('credit_suisse', 'Credit Suisse', 'CS', 'Bank', 'CH', 'CRESCHZZ80A'),
  ('tink', 'Tink', 'Tink', 'Fintech', 'SE', NULL),
  ('bunq', 'bunq', 'bunq', 'Fintech', 'NL', 'BUNQNL2A')
ON CONFLICT (institution_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_financial_institutions_country ON public.financial_institutions(country_code);
CREATE INDEX IF NOT EXISTS idx_financial_institutions_type ON public.financial_institutions(institution_type);
CREATE INDEX IF NOT EXISTS idx_financial_institutions_active ON public.financial_institutions(is_active);

-- =====================================================
-- Update triggers for updated_at timestamps
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_currencies_updated_at BEFORE UPDATE ON public.currencies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_countries_updated_at BEFORE UPDATE ON public.countries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_account_types_updated_at BEFORE UPDATE ON public.account_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transaction_categories_updated_at BEFORE UPDATE ON public.transaction_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_financial_institutions_updated_at BEFORE UPDATE ON public.financial_institutions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Comments for documentation
-- =====================================================

COMMENT ON TABLE public.currencies IS 'Dimension table for currency codes and metadata';
COMMENT ON TABLE public.countries IS 'Dimension table for countries and jurisdictions';
COMMENT ON TABLE public.account_types IS 'Dimension table for standardized account types';
COMMENT ON TABLE public.transaction_categories IS 'Dimension table for transaction categorization with hierarchy';
COMMENT ON TABLE public.payment_methods IS 'Dimension table for payment and transfer methods';
COMMENT ON TABLE public.financial_institutions IS 'Dimension table for banks and financial institutions';

