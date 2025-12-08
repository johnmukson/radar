-- Migration: Fix remaining recursion in regional manager policy
-- Description: Replace recursive query in regional manager policy with safe function
-- Date: 2025-01-17

-- Drop the problematic policy
DROP POLICY IF EXISTS "Regional managers can view roles in their region" ON public.user_roles;

-- Create a helper function to get user's region without recursion
CREATE OR REPLACE FUNCTION public.get_user_region(check_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  -- This function bypasses RLS by using SECURITY DEFINER
  SELECT b.region
  FROM public.user_roles ur
  JOIN public.branches b ON b.id = ur.branch_id
  WHERE ur.user_id = check_user_id 
    AND ur.role::text = 'regional_manager'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_region(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_region(uuid) TO anon;

-- Recreate the policy without recursion
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
          FROM public.branches b
          WHERE b.id = user_roles.branch_id
            AND b.region = public.get_user_region(auth.uid())
        )
      )
    )
  );

COMMENT ON FUNCTION public.get_user_region(uuid) IS 
'Gets the region for a regional manager user without causing RLS recursion. Uses SECURITY DEFINER to bypass RLS policies.';

COMMENT ON POLICY "Regional managers can view roles in their region" ON public.user_roles IS 
'Allows regional managers to view roles in branches within their region using safe functions to prevent recursion';

