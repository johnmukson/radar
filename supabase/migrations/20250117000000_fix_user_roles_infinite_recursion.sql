-- Migration: Fix infinite recursion in user_roles RLS policies
-- Description: Replace recursive policies with SECURITY DEFINER function approach
-- Date: 2025-01-17

-- Drop all existing problematic policies on user_roles
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "System admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Branch system admins can view user roles in their branch" ON public.user_roles;
DROP POLICY IF EXISTS "Regional managers can view user roles in their region" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all users" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "System admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;
DROP POLICY IF EXISTS "System admins can insert any roles" ON public.user_roles;
DROP POLICY IF EXISTS "System admins can update all roles" ON public.user_roles;
DROP POLICY IF EXISTS "System admins can delete all roles" ON public.user_roles;

-- Create a SECURITY DEFINER function that bypasses RLS to check user roles
-- This prevents infinite recursion because it doesn't go through RLS policies
CREATE OR REPLACE FUNCTION public.check_user_role_safe(check_user_id uuid, role_to_check text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  -- This function bypasses RLS by using SECURITY DEFINER
  -- It directly queries user_roles without going through policies
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles 
    WHERE user_id = check_user_id 
      AND role::text = role_to_check
    LIMIT 1
  );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.check_user_role_safe(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_role_safe(uuid, text) TO anon;

-- Comment on function
COMMENT ON FUNCTION public.check_user_role_safe(uuid, text) IS 
'Safely checks if a user has a specific role without causing RLS recursion. Uses SECURITY DEFINER to bypass RLS policies.';

-- Now create non-recursive policies using the safe function

-- Policy 1: Users can always view their own roles (no recursion needed)
CREATE POLICY "Users can view own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy 2: System admins can view all roles (using safe function)
CREATE POLICY "System admins can view all roles"
  ON public.user_roles
  FOR SELECT
  USING (public.check_user_role_safe(auth.uid(), 'system_admin'));

-- Policy 3: Regional managers can view roles in their region
-- First check if user is regional manager, then check branch region
CREATE POLICY "Regional managers can view roles in their region"
  ON public.user_roles
  FOR SELECT
  USING (
    -- User can view their own roles
    auth.uid() = user_id
    OR
    -- Regional manager can view roles in branches in their region
    (
      public.check_user_role_safe(auth.uid(), 'regional_manager')
      AND (
        branch_id IS NULL
        OR EXISTS (
          SELECT 1 
          FROM public.branches b1
          WHERE b1.id = user_roles.branch_id
          AND EXISTS (
            SELECT 1 
            FROM public.user_roles ur
            JOIN public.branches b2 ON b2.id = ur.branch_id
            WHERE ur.user_id = auth.uid()
              AND b2.region = b1.region
            LIMIT 1
          )
        )
      )
    )
  );

-- Policy 4: Branch system admins can view roles in their branch
-- Use a helper function to get branch_id for the current user without recursion
CREATE OR REPLACE FUNCTION public.get_user_branch_id(check_user_id uuid, role_to_check text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  -- This function bypasses RLS by using SECURITY DEFINER
  SELECT branch_id
  FROM public.user_roles 
  WHERE user_id = check_user_id 
    AND role::text = role_to_check
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_branch_id(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_branch_id(uuid, text) TO anon;

CREATE POLICY "Branch system admins can view roles in their branch"
  ON public.user_roles
  FOR SELECT
  USING (
    -- User can view their own roles
    auth.uid() = user_id
    OR
    -- Branch system admin can view roles in their branch
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

-- Policy 6: System admins can manage all roles (insert, update, delete)
CREATE POLICY "System admins can manage all roles"
  ON public.user_roles
  FOR ALL
  USING (public.check_user_role_safe(auth.uid(), 'system_admin'))
  WITH CHECK (public.check_user_role_safe(auth.uid(), 'system_admin'));

-- Ensure RLS is enabled
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

COMMENT ON POLICY "Users can view own roles" ON public.user_roles IS 
'Allows users to view their own roles without recursion';

COMMENT ON POLICY "System admins can view all roles" ON public.user_roles IS 
'Allows system admins to view all roles using safe function to prevent recursion';

COMMENT ON POLICY "Regional managers can view roles in their region" ON public.user_roles IS 
'Allows regional managers to view roles in branches within their region';

COMMENT ON POLICY "Branch system admins can view roles in their branch" ON public.user_roles IS 
'Allows branch system admins to view roles in their assigned branch';

