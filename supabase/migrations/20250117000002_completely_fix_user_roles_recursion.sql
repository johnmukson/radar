-- Migration: Completely fix infinite recursion in user_roles RLS policies
-- Description: Use more aggressive approach to bypass RLS completely
-- Date: 2025-01-17

-- Drop ALL existing policies on user_roles to start fresh
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'user_roles' AND schemaname = 'public') 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.user_roles';
    END LOOP;
END $$;

-- Drop and recreate the safe function with explicit RLS bypass
DROP FUNCTION IF EXISTS public.check_user_role_safe(uuid, text);
CREATE OR REPLACE FUNCTION public.check_user_role_safe(check_user_id uuid, role_to_check text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    result boolean;
BEGIN
    -- Explicitly set role to bypass RLS
    PERFORM set_config('row_security', 'off', false);
    
    -- Query user_roles directly without RLS
    SELECT EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE user_id = check_user_id 
          AND role::text = role_to_check
        LIMIT 1
    ) INTO result;
    
    -- Re-enable RLS
    PERFORM set_config('row_security', 'on', false);
    
    RETURN COALESCE(result, false);
END;
$$;

-- Recreate the get_user_branch_id function with RLS bypass
DROP FUNCTION IF EXISTS public.get_user_branch_id(uuid, text);
CREATE OR REPLACE FUNCTION public.get_user_branch_id(check_user_id uuid, role_to_check text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    result uuid;
BEGIN
    -- Explicitly set role to bypass RLS
    PERFORM set_config('row_security', 'off', false);
    
    -- Query user_roles directly without RLS
    SELECT branch_id
    INTO result
    FROM public.user_roles 
    WHERE user_id = check_user_id 
      AND role::text = role_to_check
    LIMIT 1;
    
    -- Re-enable RLS
    PERFORM set_config('row_security', 'on', false);
    
    RETURN result;
END;
$$;

-- Recreate the get_user_region function with RLS bypass
DROP FUNCTION IF EXISTS public.get_user_region(uuid);
CREATE OR REPLACE FUNCTION public.get_user_region(check_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    result text;
BEGIN
    -- Explicitly set role to bypass RLS
    PERFORM set_config('row_security', 'off', false);
    
    -- Query user_roles directly without RLS
    SELECT b.region
    INTO result
    FROM public.user_roles ur
    JOIN public.branches b ON b.id = ur.branch_id
    WHERE ur.user_id = check_user_id 
      AND ur.role::text = 'regional_manager'
    LIMIT 1;
    
    -- Re-enable RLS
    PERFORM set_config('row_security', 'on', false);
    
    RETURN result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_user_role_safe(uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_branch_id(uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_region(uuid) TO authenticated, anon;

-- Now create simple, non-recursive policies

-- Policy 1: Users can always view their own roles (no recursion)
CREATE POLICY "Users can view own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy 2: System admins can view all roles
CREATE POLICY "System admins can view all roles"
  ON public.user_roles
  FOR SELECT
  USING (public.check_user_role_safe(auth.uid(), 'system_admin'));

-- Policy 3: Regional managers can view roles in their region
CREATE POLICY "Regional managers can view roles in their region"
  ON public.user_roles
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR
    (
      public.check_user_role_safe(auth.uid(), 'regional_manager')
      AND (
        branch_id IS NULL
        OR EXISTS (
          SELECT 1 
          FROM public.branches b
          WHERE b.id = user_roles.branch_id
            AND b.region = public.get_user_region(auth.uid())
        )
      )
    )
  );

-- Policy 4: Branch system admins can view roles in their branch
CREATE POLICY "Branch system admins can view roles in their branch"
  ON public.user_roles
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR
    (
      public.check_user_role_safe(auth.uid(), 'branch_system_admin')
      AND (
        branch_id IS NULL
        OR branch_id = public.get_user_branch_id(auth.uid(), 'branch_system_admin')
      )
    )
  );

-- Policy 5: Users can insert their own roles
CREATE POLICY "Users can insert own roles"
  ON public.user_roles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy 6: System admins can manage all roles
CREATE POLICY "System admins can manage all roles"
  ON public.user_roles
  FOR ALL
  USING (public.check_user_role_safe(auth.uid(), 'system_admin'))
  WITH CHECK (public.check_user_role_safe(auth.uid(), 'system_admin'));

-- Ensure RLS is enabled
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

