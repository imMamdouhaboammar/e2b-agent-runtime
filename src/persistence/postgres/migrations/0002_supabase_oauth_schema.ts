// Phase 9 Supabase OAuth Schema Migration Definition

export const SUPABASE_OAUTH_SCHEMA_SQL = `
-- Enable pgcrypto for UUID helpers
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;

-- Create private schema for mcp configuration and audit logs
CREATE SCHEMA IF NOT EXISTS mcp_private;

-- Create public runtime_profiles
CREATE TABLE IF NOT EXISTS public.runtime_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create public runtime_memberships
CREATE TABLE IF NOT EXISTS public.runtime_memberships (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'developer', 'viewer')),
  status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ
);

-- Create private mcp_client_policies
CREATE TABLE IF NOT EXISTS mcp_private.mcp_client_policies (
  client_id TEXT PRIMARY KEY,
  display_name TEXT,
  trust_state TEXT NOT NULL CHECK (trust_state IN ('unknown', 'allowed', 'blocked')),
  maximum_role TEXT NOT NULL CHECK (maximum_role IN ('owner', 'admin', 'developer', 'viewer')),
  allow_read_tools BOOLEAN NOT NULL DEFAULT TRUE,
  allow_worker_writes BOOLEAN NOT NULL DEFAULT TRUE,
  allow_external_writes BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create public mcp_user_client_grants
CREATE TABLE IF NOT EXISTS public.mcp_user_client_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'denied', 'revoked')),
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  CONSTRAINT unique_user_client_grant UNIQUE (user_id, client_id)
);

-- Create private mcp_auth_audit_events
CREATE TABLE IF NOT EXISTS mcp_private.mcp_auth_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id TEXT,
  event_type TEXT NOT NULL,
  result TEXT NOT NULL,
  request_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Enablement
ALTER TABLE public.runtime_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_user_client_grants ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist (to ensure idempotency)
DROP POLICY IF EXISTS "profiles_select_own" ON public.runtime_profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.runtime_profiles;
DROP POLICY IF EXISTS "memberships_select_own" ON public.runtime_memberships;
DROP POLICY IF EXISTS "grants_select_own" ON public.mcp_user_client_grants;
DROP POLICY IF EXISTS "grants_update_own" ON public.mcp_user_client_grants;

-- Create explicit RLS policies
CREATE POLICY "profiles_select_own" ON public.runtime_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "profiles_update_own" ON public.runtime_profiles
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "memberships_select_own" ON public.runtime_memberships
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "grants_select_own" ON public.mcp_user_client_grants
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "grants_update_own" ON public.mcp_user_client_grants
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Explicit indexes
CREATE INDEX IF NOT EXISTS idx_runtime_profiles_user_id ON public.runtime_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_runtime_memberships_user_id ON public.runtime_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_user_client_grants_user_id ON public.mcp_user_client_grants (user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_user_client_grants_client_id ON public.mcp_user_client_grants (client_id);
CREATE INDEX IF NOT EXISTS idx_mcp_auth_audit_events_user_id ON mcp_private.mcp_auth_audit_events (user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_auth_audit_events_client_id ON mcp_private.mcp_auth_audit_events (client_id);

-- Functions
CREATE OR REPLACE FUNCTION public.get_current_runtime_membership()
RETURNS TABLE (
  user_id UUID,
  role TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT rm.user_id, rm.role, rm.status
  FROM public.runtime_memberships rm
  WHERE rm.user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.is_runtime_member()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.runtime_memberships rm
    WHERE rm.user_id = auth.uid() AND rm.status = 'active'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_current_user_client_grant(target_client_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE public.mcp_user_client_grants
  SET status = 'revoked', revoked_at = NOW()
  WHERE user_id = auth.uid() AND client_id = target_client_id;
  RETURN FOUND;
END;
$$;

-- Revoke default public execute
REVOKE EXECUTE ON FUNCTION public.get_current_runtime_membership FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_runtime_member FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_current_user_client_grant FROM PUBLIC;

-- Grant execution to authenticated role
GRANT EXECUTE ON FUNCTION public.get_current_runtime_membership TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_runtime_member TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_current_user_client_grant TO authenticated;

-- Comment for security
COMMENT ON SCHEMA mcp_private IS 'Private schemas for mcp controller configurations and audit logs, hidden from public APIs.';
`;
