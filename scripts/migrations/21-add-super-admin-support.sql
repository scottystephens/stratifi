-- =====================================================
-- Stratiri - Super Admin Support
-- Adds super admin functionality with cross-tenant access
-- =====================================================

-- =====================================================
-- STEP 1: Admin Audit Log Table
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL, -- 'tenant', 'connection', 'user', 'system'
  resource_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient admin action lookups
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_user_id ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_resource ON admin_audit_log(resource_type, resource_id);

-- =====================================================
-- STEP 2: Admin Helper Functions
-- =====================================================

-- Check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  SELECT COALESCE(
    (raw_user_meta_data->>'is_super_admin')::boolean,
    false
  ) INTO is_admin
  FROM auth.users
  WHERE id = user_id;
  
  RETURN COALESCE(is_admin, false);
END;
$$;

-- Get all tenants (admin only)
CREATE OR REPLACE FUNCTION get_all_tenants()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  plan TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  settings JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only allow if user is super admin
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Super admin access required';
  END IF;
  
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.slug,
    t.plan,
    t.created_at,
    t.updated_at,
    t.settings
  FROM tenants t
  ORDER BY t.created_at DESC;
END;
$$;

-- Get all connections across tenants (admin only)
CREATE OR REPLACE FUNCTION get_all_connections()
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  tenant_name TEXT,
  name TEXT,
  connection_type TEXT,
  provider TEXT,
  status TEXT,
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  sync_frequency TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only allow if user is super admin
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Super admin access required';
  END IF;
  
  RETURN QUERY
  SELECT 
    c.id,
    c.tenant_id,
    t.name as tenant_name,
    c.name,
    c.connection_type,
    c.provider,
    c.status,
    c.last_sync_at,
    c.next_sync_at,
    c.sync_frequency,
    c.created_at
  FROM connections c
  LEFT JOIN tenants t ON t.id = c.tenant_id
  ORDER BY c.created_at DESC;
END;
$$;

-- Log admin action
CREATE OR REPLACE FUNCTION log_admin_action(
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  log_id UUID;
BEGIN
  -- Only allow if user is super admin
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Super admin access required';
  END IF;
  
  INSERT INTO admin_audit_log (
    admin_user_id,
    action,
    resource_type,
    resource_id,
    details
  ) VALUES (
    auth.uid(),
    p_action,
    p_resource_type,
    p_resource_id,
    p_details
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;

-- =====================================================
-- STEP 3: Admin RLS Policies for Audit Log
-- =====================================================

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Super admins can view all audit logs
CREATE POLICY "Super admins can view audit logs"
ON admin_audit_log FOR SELECT
USING (is_super_admin(auth.uid()));

-- Super admins can insert audit logs (via function)
CREATE POLICY "Super admins can insert audit logs"
ON admin_audit_log FOR INSERT
WITH CHECK (is_super_admin(auth.uid()));

-- =====================================================
-- STEP 4: Grant Necessary Permissions
-- =====================================================

-- Grant execute permissions on admin functions
GRANT EXECUTE ON FUNCTION is_super_admin TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_tenants TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_connections TO authenticated;
GRANT EXECUTE ON FUNCTION log_admin_action TO authenticated;

-- =====================================================
-- Instructions for Setting Super Admin
-- =====================================================

-- To mark a user as super admin, run:
-- UPDATE auth.users 
-- SET raw_user_meta_data = raw_user_meta_data || '{"is_super_admin": true}'::jsonb
-- WHERE email = 'your-admin@email.com';

-- To remove super admin status:
-- UPDATE auth.users 
-- SET raw_user_meta_data = raw_user_meta_data - 'is_super_admin'
-- WHERE email = 'your-admin@email.com';

