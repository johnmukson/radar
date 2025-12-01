-- Migration: Helper Functions
-- Description: Create helper functions used in policies and workflows

-- 3.1 Role checking function
-- This function checks whether the current authenticated user has a particular role
CREATE OR REPLACE FUNCTION public.has_role(uid uuid, role_to_check text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r app_role;
BEGIN
  SELECT role INTO r
  FROM public.user_roles ur
  WHERE ur.user_id = uid
  AND ur.role = role_to_check::app_role
  LIMIT 1;
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.has_role IS 'Check if a user has a specific role (used in RLS policies)';

-- Note: generate_branch_code function is created in a later migration (after branches table exists)

-- 3.3 Timestamp trigger function
-- Many tables need to update their updated_at column automatically when a row changes
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

