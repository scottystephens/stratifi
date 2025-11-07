-- =====================================================
-- TreasuryX Multi-Tenant Database Setup
-- Production-Quality Multi-Tenancy with RLS
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- STEP 1: Create Core Multi-Tenant Tables
-- =====================================================

-- Tenants (Organizations)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'professional', 'enterprise')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Settings
  settings JSONB DEFAULT '{
    "currency": "USD",
    "timezone": "America/New_York",
    "date_format": "MM/DD/YYYY"
  }'::jsonb,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- User-Tenant Relationship (Many-to-Many)
CREATE TABLE IF NOT EXISTS user_tenants (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  PRIMARY KEY (user_id, tenant_id)
);

-- Team Invitations
CREATE TABLE IF NOT EXISTS team_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE (tenant_id, email)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant ON user_tenants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_tenant ON team_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email);

-- =====================================================
-- STEP 2: Add tenant_id to Existing Tables
-- =====================================================

-- Accounts
ALTER TABLE accounts 
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON accounts(tenant_id);

-- Entities
ALTER TABLE entities 
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_entities_tenant ON entities(tenant_id);

-- Transactions
ALTER TABLE transactions 
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id, date DESC);

-- Payments
ALTER TABLE payments 
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id, scheduled_date DESC);

-- Forecasts
ALTER TABLE forecasts 
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_forecasts_tenant ON forecasts(tenant_id, date DESC);

-- Note: exchange_rates table is SHARED across all tenants (no tenant_id)

-- =====================================================
-- STEP 3: Row-Level Security (RLS) Policies
-- =====================================================

-- Enable RLS on all tenant-specific tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecasts ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies: Tenants
-- =====================================================

-- Users can see tenants they belong to
CREATE POLICY "Users can view their tenants"
ON tenants FOR SELECT
USING (
  id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

-- Only owners can update tenant details
CREATE POLICY "Owners can update their tenant"
ON tenants FOR UPDATE
USING (
  id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role = 'owner'
  )
);

-- Users can create tenants
CREATE POLICY "Users can create tenants"
ON tenants FOR INSERT
WITH CHECK (true);

-- =====================================================
-- RLS Policies: User-Tenants
-- =====================================================

-- Users can see members of their tenants
CREATE POLICY "Users can view tenant members"
ON user_tenants FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

-- Owners and admins can add team members
CREATE POLICY "Admins can add team members"
ON user_tenants FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- Owners and admins can update member roles
CREATE POLICY "Admins can update member roles"
ON user_tenants FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- Owners and admins can remove team members
CREATE POLICY "Admins can remove team members"
ON user_tenants FOR DELETE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- =====================================================
-- RLS Policies: Team Invitations
-- =====================================================

CREATE POLICY "Users can view invitations for their tenants"
ON team_invitations FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
  OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Admins can create invitations"
ON team_invitations FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "Admins can update invitations"
ON team_invitations FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "Admins can delete invitations"
ON team_invitations FOR DELETE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- =====================================================
-- RLS Policies: Accounts
-- =====================================================

CREATE POLICY "Users can view their tenant's accounts"
ON accounts FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Editors can create accounts"
ON accounts FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY "Editors can update accounts"
ON accounts FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY "Admins can delete accounts"
ON accounts FOR DELETE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- =====================================================
-- RLS Policies: Entities
-- =====================================================

CREATE POLICY "Users can view their tenant's entities"
ON entities FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Editors can create entities"
ON entities FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY "Editors can update entities"
ON entities FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY "Admins can delete entities"
ON entities FOR DELETE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- =====================================================
-- RLS Policies: Transactions
-- =====================================================

CREATE POLICY "Users can view their tenant's transactions"
ON transactions FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Editors can create transactions"
ON transactions FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY "Editors can update transactions"
ON transactions FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY "Admins can delete transactions"
ON transactions FOR DELETE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- =====================================================
-- RLS Policies: Payments
-- =====================================================

CREATE POLICY "Users can view their tenant's payments"
ON payments FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Editors can create payments"
ON payments FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY "Editors can update payments"
ON payments FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY "Admins can delete payments"
ON payments FOR DELETE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- =====================================================
-- RLS Policies: Forecasts
-- =====================================================

CREATE POLICY "Users can view their tenant's forecasts"
ON forecasts FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Editors can create forecasts"
ON forecasts FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY "Editors can update forecasts"
ON forecasts FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY "Admins can delete forecasts"
ON forecasts FOR DELETE
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- =====================================================
-- STEP 4: Helper Functions
-- =====================================================

-- Function to get current user's tenant_id from context
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tenant_id UUID;
BEGIN
  -- Get tenant_id from request header (set by Next.js middleware)
  tenant_id := current_setting('app.current_tenant_id', true)::UUID;
  
  -- Verify user has access to this tenant
  IF NOT EXISTS (
    SELECT 1 FROM user_tenants 
    WHERE user_id = auth.uid() AND user_tenants.tenant_id = get_current_tenant_id.tenant_id
  ) THEN
    RAISE EXCEPTION 'User does not have access to this tenant';
  END IF;
  
  RETURN tenant_id;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- Function to create a tenant and make the creator an owner
CREATE OR REPLACE FUNCTION create_tenant_with_owner(
  tenant_name TEXT,
  tenant_slug TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_tenant_id UUID;
BEGIN
  -- Create the tenant
  INSERT INTO tenants (name, slug)
  VALUES (tenant_name, tenant_slug)
  RETURNING id INTO new_tenant_id;
  
  -- Add the current user as owner
  INSERT INTO user_tenants (user_id, tenant_id, role)
  VALUES (auth.uid(), new_tenant_id, 'owner');
  
  RETURN new_tenant_id;
END;
$$;

-- Function to accept a team invitation
CREATE OR REPLACE FUNCTION accept_invitation(invitation_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  invitation RECORD;
BEGIN
  -- Get the invitation
  SELECT * INTO invitation
  FROM team_invitations
  WHERE token = invitation_token
    AND expires_at > NOW()
    AND accepted_at IS NULL;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invitation';
  END IF;
  
  -- Verify email matches
  IF invitation.email != (SELECT email FROM auth.users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Email does not match invitation';
  END IF;
  
  -- Add user to tenant
  INSERT INTO user_tenants (user_id, tenant_id, role)
  VALUES (auth.uid(), invitation.tenant_id, invitation.role)
  ON CONFLICT (user_id, tenant_id) DO NOTHING;
  
  -- Mark invitation as accepted
  UPDATE team_invitations
  SET accepted_at = NOW()
  WHERE id = invitation.id;
  
  RETURN invitation.tenant_id;
END;
$$;

-- =====================================================
-- STEP 5: Comments for Documentation
-- =====================================================

COMMENT ON TABLE tenants IS 'Organizations/Companies using the platform';
COMMENT ON TABLE user_tenants IS 'Many-to-many relationship between users and tenants with roles';
COMMENT ON TABLE team_invitations IS 'Pending invitations to join a tenant';

COMMENT ON COLUMN tenants.plan IS 'Subscription plan: starter, professional, or enterprise';
COMMENT ON COLUMN tenants.slug IS 'URL-friendly identifier for the tenant';
COMMENT ON COLUMN user_tenants.role IS 'User role: owner (full control), admin (manage team), editor (edit data), viewer (read-only)';

-- =====================================================
-- Success Message
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Multi-tenant database setup complete!';
  RAISE NOTICE '📋 Next steps:';
  RAISE NOTICE '   1. Run the seed script to create test tenants';
  RAISE NOTICE '   2. Enable Supabase Auth in your Supabase dashboard';
  RAISE NOTICE '   3. Configure email templates for invitations';
END $$;

