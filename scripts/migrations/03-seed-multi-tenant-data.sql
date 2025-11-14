-- =====================================================
-- Multi-Tenant Mock Data Seed Script
-- Creates 3 tenants with realistic financial data
-- =====================================================

-- Note: This assumes users already exist in auth.users
-- You'll need to sign up users first, then run this script

-- =====================================================
-- TENANT 1: Acme Corporation (Established company)
-- =====================================================

-- Create tenant
INSERT INTO tenants (id, name, slug, plan, settings) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Acme Corporation', 'acme-corp', 'professional', 
 '{"currency": "USD", "timezone": "America/New_York", "date_format": "MM/DD/YYYY"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- Create entities for Acme Corp
INSERT INTO entities (entity_id, entity_name, type, jurisdiction, tax_id, status, contact_email, tenant_id) VALUES
('ACME-US', 'Acme US Inc', 'Corporation', 'Delaware', '12-3456789', 'Active', 'finance@acme-corp.com', '550e8400-e29b-41d4-a716-446655440001'),
('ACME-UK', 'Acme UK Ltd', 'Corporation', 'United Kingdom', 'GB123456789', 'Active', 'finance-uk@acme-corp.com', '550e8400-e29b-41d4-a716-446655440001'),
('ACME-SG', 'Acme Singapore Pte Ltd', 'Corporation', 'Singapore', 'SG987654321', 'Active', 'finance-sg@acme-corp.com', '550e8400-e29b-41d4-a716-446655440001')
ON CONFLICT (entity_id) DO NOTHING;

-- Create accounts for Acme Corp
INSERT INTO accounts (account_id, account_name, entity_id, bank_name, currency, balance, status, tenant_id) VALUES
('ACME-US-OP-001', 'US Operating Account', 'ACME-US', 'JPMorgan Chase', 'USD', 2450000.00, 'Active', '550e8400-e29b-41d4-a716-446655440001'),
('ACME-US-SAV-001', 'US Savings Account', 'ACME-US', 'JPMorgan Chase', 'USD', 5000000.00, 'Active', '550e8400-e29b-41d4-a716-446655440001'),
('ACME-UK-OP-001', 'UK Operating Account', 'ACME-UK', 'Barclays', 'GBP', 850000.00, 'Active', '550e8400-e29b-41d4-a716-446655440001'),
('ACME-SG-OP-001', 'Singapore Operating Account', 'ACME-SG', 'DBS Bank', 'SGD', 1200000.00, 'Active', '550e8400-e29b-41d4-a716-446655440001')
ON CONFLICT (account_id) DO NOTHING;

-- Create transactions for Acme Corp
INSERT INTO transactions (transaction_id, account_id, date, description, amount, currency, type, category, status, reference, tenant_id) VALUES
('ACME-TXN-001', 'ACME-US-OP-001', '2025-11-01', 'Customer Payment - Enterprise License', 125000.00, 'USD', 'Credit', 'Revenue', 'Completed', 'INV-2025-001', '550e8400-e29b-41d4-a716-446655440001'),
('ACME-TXN-002', 'ACME-US-OP-001', '2025-11-02', 'AWS Infrastructure', -45000.00, 'USD', 'Debit', 'Operating Expense', 'Completed', 'AWS-INV-11-2025', '550e8400-e29b-41d4-a716-446655440001'),
('ACME-TXN-003', 'ACME-US-OP-001', '2025-11-03', 'Payroll - Engineering', -280000.00, 'USD', 'Debit', 'Payroll', 'Completed', 'PAYROLL-11-2025', '550e8400-e29b-41d4-a716-446655440001'),
('ACME-TXN-004', 'ACME-UK-OP-001', '2025-11-04', 'UK Sales Revenue', 95000.00, 'GBP', 'Credit', 'Revenue', 'Completed', 'UK-INV-001', '550e8400-e29b-41d4-a716-446655440001'),
('ACME-TXN-005', 'ACME-SG-OP-001', '2025-11-05', 'Office Rent - Singapore', -12000.00, 'SGD', 'Debit', 'Operating Expense', 'Completed', 'RENT-11-2025', '550e8400-e29b-41d4-a716-446655440001')
ON CONFLICT (transaction_id) DO NOTHING;

-- Create payments for Acme Corp
INSERT INTO payments (payment_id, from_account, to_entity, amount, currency, scheduled_date, status, approver, description, payment_type, priority, tenant_id) VALUES
('ACME-PAY-001', 'ACME-US-OP-001', 'Google Cloud', 35000.00, 'USD', '2025-11-15', 'Scheduled', 'finance@acme-corp.com', 'Google Cloud Platform - Q4 2025', 'Vendor Payment', 'High', '550e8400-e29b-41d4-a716-446655440001'),
('ACME-PAY-002', 'ACME-UK-OP-001', 'UK Revenue Service', 22000.00, 'GBP', '2025-11-20', 'Scheduled', 'finance-uk@acme-corp.com', 'VAT Payment - October 2025', 'Tax', 'High', '550e8400-e29b-41d4-a716-446655440001')
ON CONFLICT (payment_id) DO NOTHING;

-- =====================================================
-- TENANT 2: StartupXYZ (Fast-growing startup)
-- =====================================================

INSERT INTO tenants (id, name, slug, plan, settings) VALUES
('550e8400-e29b-41d4-a716-446655440002', 'StartupXYZ', 'startupxyz', 'starter',
 '{"currency": "USD", "timezone": "America/Los_Angeles", "date_format": "MM/DD/YYYY"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO entities (entity_id, entity_name, type, jurisdiction, tax_id, status, contact_email, tenant_id) VALUES
('SXYZ-US', 'StartupXYZ Inc', 'Corporation', 'Delaware', '98-7654321', 'Active', 'cfo@startupxyz.com', '550e8400-e29b-41d4-a716-446655440002')
ON CONFLICT (entity_id) DO NOTHING;

INSERT INTO accounts (account_id, account_name, entity_id, bank_name, currency, balance, status, tenant_id) VALUES
('SXYZ-US-OP-001', 'Operating Account', 'SXYZ-US', 'Silicon Valley Bank', 'USD', 850000.00, 'Active', '550e8400-e29b-41d4-a716-446655440002'),
('SXYZ-US-SAV-001', 'Runway Reserve', 'SXYZ-US', 'Silicon Valley Bank', 'USD', 2500000.00, 'Active', '550e8400-e29b-41d4-a716-446655440002')
ON CONFLICT (account_id) DO NOTHING;

INSERT INTO transactions (transaction_id, account_id, date, description, amount, currency, type, category, status, reference, tenant_id) VALUES
('SXYZ-TXN-001', 'SXYZ-US-OP-001', '2025-11-01', 'Seed Round Funding', 3000000.00, 'USD', 'Credit', 'Investment', 'Completed', 'SEED-2025', '550e8400-e29b-41d4-a716-446655440002'),
('SXYZ-TXN-002', 'SXYZ-US-OP-001', '2025-11-02', 'Office Setup', -45000.00, 'USD', 'Debit', 'Capital Expense', 'Completed', 'OFFICE-SETUP', '550e8400-e29b-41d4-a716-446655440002'),
('SXYZ-TXN-003', 'SXYZ-US-OP-001', '2025-11-03', 'Payroll - Team', -120000.00, 'USD', 'Debit', 'Payroll', 'Completed', 'PAYROLL-11-2025', '550e8400-e29b-41d4-a716-446655440002'),
('SXYZ-TXN-004', 'SXYZ-US-OP-001', '2025-11-04', 'Customer Subscription', 5000.00, 'USD', 'Credit', 'Revenue', 'Completed', 'SUB-001', '550e8400-e29b-41d4-a716-446655440002')
ON CONFLICT (transaction_id) DO NOTHING;

INSERT INTO payments (payment_id, from_account, to_entity, amount, currency, scheduled_date, status, approver, description, payment_type, priority, tenant_id) VALUES
('SXYZ-PAY-001', 'SXYZ-US-OP-001', 'Vercel', 500.00, 'USD', '2025-11-10', 'Scheduled', 'cfo@startupxyz.com', 'Hosting - November 2025', 'Vendor Payment', 'Medium', '550e8400-e29b-41d4-a716-446655440002')
ON CONFLICT (payment_id) DO NOTHING;

-- =====================================================
-- TENANT 3: Global Ventures (Investment firm)
-- =====================================================

INSERT INTO tenants (id, name, slug, plan, settings) VALUES
('550e8400-e29b-41d4-a716-446655440003', 'Global Ventures', 'global-ventures', 'enterprise',
 '{"currency": "USD", "timezone": "America/New_York", "date_format": "MM/DD/YYYY"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO entities (entity_id, entity_name, type, jurisdiction, tax_id, status, contact_email, tenant_id) VALUES
('GV-US', 'Global Ventures LLC', 'LLC', 'Delaware', '55-1234567', 'Active', 'treasury@globalventures.com', '550e8400-e29b-41d4-a716-446655440003'),
('GV-CAY', 'Global Ventures Cayman', 'Corporation', 'Cayman Islands', 'CAY-98765', 'Active', 'treasury@globalventures.com', '550e8400-e29b-41d4-a716-446655440003')
ON CONFLICT (entity_id) DO NOTHING;

INSERT INTO accounts (account_id, account_name, entity_id, bank_name, currency, balance, status, tenant_id) VALUES
('GV-US-OP-001', 'US Operating Account', 'GV-US', 'Goldman Sachs', 'USD', 15000000.00, 'Active', '550e8400-e29b-41d4-a716-446655440003'),
('GV-US-INV-001', 'Investment Fund I', 'GV-US', 'Goldman Sachs', 'USD', 50000000.00, 'Active', '550e8400-e29b-41d4-a716-446655440003'),
('GV-CAY-OP-001', 'Cayman Operating Account', 'GV-CAY', 'HSBC Cayman', 'USD', 8000000.00, 'Active', '550e8400-e29b-41d4-a716-446655440003')
ON CONFLICT (account_id) DO NOTHING;

INSERT INTO transactions (transaction_id, account_id, date, description, amount, currency, type, category, status, reference, tenant_id) VALUES
('GV-TXN-001', 'GV-US-INV-001', '2025-11-01', 'Investment - TechCo Series A', -2000000.00, 'USD', 'Debit', 'Investment', 'Completed', 'DEAL-2025-A1', '550e8400-e29b-41d4-a716-446655440003'),
('GV-TXN-002', 'GV-US-OP-001', '2025-11-02', 'Management Fee - Fund I', 500000.00, 'USD', 'Credit', 'Revenue', 'Completed', 'MGT-FEE-Q4', '550e8400-e29b-41d4-a716-446655440003'),
('GV-TXN-003', 'GV-CAY-OP-001', '2025-11-03', 'Portfolio Company Exit', 5000000.00, 'USD', 'Credit', 'Investment Return', 'Completed', 'EXIT-2025-01', '550e8400-e29b-41d4-a716-446655440003')
ON CONFLICT (transaction_id) DO NOTHING;

INSERT INTO payments (payment_id, from_account, to_entity, amount, currency, scheduled_date, status, approver, description, payment_type, priority, tenant_id) VALUES
('GV-PAY-001', 'GV-US-INV-001', 'SaaS Startup Inc', 1500000.00, 'USD', '2025-11-18', 'Pending Approval', 'treasury@globalventures.com', 'Series B Investment', 'Investment', 'High', '550e8400-e29b-41d4-a716-446655440003')
ON CONFLICT (payment_id) DO NOTHING;

-- =====================================================
-- Summary
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Multi-tenant seed data created!';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Created 3 tenants:';
  RAISE NOTICE '   1. Acme Corporation (professional plan) - 4 accounts, 5 transactions';
  RAISE NOTICE '   2. StartupXYZ (starter plan) - 2 accounts, 4 transactions';
  RAISE NOTICE '   3. Global Ventures (enterprise plan) - 3 accounts, 3 transactions';
  RAISE NOTICE '';
  RAISE NOTICE '🔑 Next: Create users and link them to tenants via user_tenants table';
END $$;

