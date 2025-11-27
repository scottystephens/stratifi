-- Test migration to verify CLI connection
CREATE TABLE IF NOT EXISTS test_cli_connection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    message TEXT
);

COMMENT ON TABLE test_cli_connection IS 'Temporary table to verify Supabase CLI connection';

