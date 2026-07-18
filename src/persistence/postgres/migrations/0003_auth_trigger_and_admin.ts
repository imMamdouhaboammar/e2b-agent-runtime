// Phase 9 Auth Trigger and Admin Schema Definition

export const AUTH_TRIGGER_AND_ADMIN_SQL = `
-- Create profile and membership triggers on auth.users inserts
CREATE OR REPLACE FUNCTION public.handle_new_user_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog, pg_temp
AS $$
DECLARE
  is_first_user BOOLEAN;
  default_display_name TEXT;
BEGIN
  -- Determine if this is the very first registered user
  SELECT NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id <> NEW.id
  ) INTO is_first_user;

  -- Build default display name
  default_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  -- 1. Create Profile
  INSERT INTO public.runtime_profiles (user_id, display_name, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id,
    default_display_name,
    NEW.raw_user_meta_data->>'avatar_url',
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url,
      updated_at = NOW();

  -- 2. Create Membership with appropriate permissions
  IF is_first_user THEN
    -- First user is elevated to owner and set to active immediately
    INSERT INTO public.runtime_memberships (user_id, role, status, created_at, updated_at, created_by, revoked_at)
    VALUES (NEW.id, 'owner', 'active', NOW(), NOW(), NEW.id, NULL)
    ON CONFLICT (user_id) DO UPDATE
    SET role = 'owner',
        status = 'active',
        updated_at = NOW();
  ELSE
    -- Subsequent users default to viewer role and invited status
    INSERT INTO public.runtime_memberships (user_id, role, status, created_at, updated_at, created_by, revoked_at)
    VALUES (NEW.id, 'viewer', 'invited', NOW(), NOW(), NULL, NULL)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Bind handle_new_user_registration trigger safely
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_registration();
`;
