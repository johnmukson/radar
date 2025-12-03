-- ============================================================================
-- Fix System Admin Access to Branch Settings
-- Migration: 20250112000003_fix_system_admin_access.sql
-- Description: Ensures system admins can always access branch_settings
-- ============================================================================

-- Drop and recreate system admin policy with direct check (no has_role function)
DROP POLICY IF EXISTS "System admins can manage all branch settings" ON public.branch_settings;

-- Create a more direct policy that checks user_roles table directly
CREATE POLICY "System admins can manage all branch settings"
  ON public.branch_settings
  FOR ALL
  USING (
    -- Direct check in user_roles table
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text = 'system_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text = 'system_admin'
    )
  );

-- Also ensure admin role works
DROP POLICY IF EXISTS "Admins can manage all branch settings" ON public.branch_settings;
CREATE POLICY "Admins can manage all branch settings"
  ON public.branch_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text = 'admin'
    )
  );

-- Add a catch-all policy for authenticated users to at least SELECT
-- This ensures even if role checks fail, authenticated users can see the table structure
DROP POLICY IF EXISTS "Authenticated users can view branch settings" ON public.branch_settings;
CREATE POLICY "Authenticated users can view branch settings"
  ON public.branch_settings
  FOR SELECT
  USING (auth.role() = 'authenticated');

