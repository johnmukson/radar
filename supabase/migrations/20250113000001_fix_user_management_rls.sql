-- ============================================================================
-- Fix User Management RLS Policies
-- Migration: 20250113000000_fix_user_management_rls.sql
-- Description: Adds RLS policies to allow branch_system_admin and regional_manager to view users
-- ============================================================================

-- Add policy for branch system admins to view users in their branch
DROP POLICY IF EXISTS "Branch system admins can view users in their branch" ON public.users;
CREATE POLICY "Branch system admins can view users in their branch"
  ON public.users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_system_admin'
        AND EXISTS (
          -- User must have a role in the same branch as the branch_system_admin
          SELECT 1 FROM public.user_roles ur2
          WHERE ur2.user_id = users.id
            AND ur2.branch_id = ur.branch_id
        )
    )
  );

-- Add policy for regional managers to view users in their region
DROP POLICY IF EXISTS "Regional managers can view users in their region" ON public.users;
CREATE POLICY "Regional managers can view users in their region"
  ON public.users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.branches b ON b.id = ur.branch_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'regional_manager'
        AND EXISTS (
          -- User must have a role in a branch in the same region
          SELECT 1 FROM public.user_roles ur2
          JOIN public.branches b2 ON b2.id = ur2.branch_id
          WHERE ur2.user_id = users.id
            AND b2.region = b.region
        )
    )
  );

-- Add policy for branch system admins to view user_roles in their branch
DROP POLICY IF EXISTS "Branch system admins can view user roles in their branch" ON public.user_roles;
CREATE POLICY "Branch system admins can view user roles in their branch"
  ON public.user_roles
  FOR SELECT
  USING (
    -- User can view their own roles
    auth.uid() = user_id
    OR
    -- Branch system admin can view roles in their branch
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_system_admin'
        AND ur.branch_id = user_roles.branch_id
    )
  );

-- Add policy for regional managers to view user_roles in their region
DROP POLICY IF EXISTS "Regional managers can view user roles in their region" ON public.user_roles;
CREATE POLICY "Regional managers can view user roles in their region"
  ON public.user_roles
  FOR SELECT
  USING (
    -- User can view their own roles
    auth.uid() = user_id
    OR
    -- Regional manager can view roles in branches in their region
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.branches b ON b.id = ur.branch_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'regional_manager'
        AND EXISTS (
          SELECT 1 FROM public.branches b2
          WHERE b2.id = user_roles.branch_id
            AND b2.region = b.region
        )
    )
  );

-- Also add policy for admin role (backward compatibility)
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
CREATE POLICY "Admins can view all users"
  ON public.users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'system_admin')
    )
  );

