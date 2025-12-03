-- ============================================================================
-- Fix Branch Settings RLS Policies
-- Migration: 20250112000001_fix_branch_settings_rls.sql
-- Description: Updates RLS policies to allow proper access to branch_settings
-- ============================================================================

-- Drop all existing policies to recreate them
DROP POLICY IF EXISTS "System admins can manage all branch settings" ON public.branch_settings;
DROP POLICY IF EXISTS "Branch system admins can manage their branch settings" ON public.branch_settings;
DROP POLICY IF EXISTS "Branch managers can manage their branch settings" ON public.branch_settings;
DROP POLICY IF EXISTS "Regional managers can view branch settings" ON public.branch_settings;
DROP POLICY IF EXISTS "Users can view branch settings" ON public.branch_settings;
DROP POLICY IF EXISTS "Doctors can view branch settings" ON public.branch_settings;

-- System admins can manage all branch settings
CREATE POLICY "System admins can manage all branch settings"
  ON public.branch_settings
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'system_admin') OR
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'system_admin'
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin') OR
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'system_admin'
    )
  );

-- Admin role can manage all branch settings (for backward compatibility)
CREATE POLICY "Admins can manage all branch settings"
  ON public.branch_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );

-- Branch system admins can manage their branch settings
CREATE POLICY "Branch system admins can manage their branch settings"
  ON public.branch_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_system_admin'
        AND ur.branch_id = branch_settings.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_system_admin'
        AND ur.branch_id = branch_settings.branch_id
    )
  );

-- Branch managers can manage their branch settings
CREATE POLICY "Branch managers can manage their branch settings"
  ON public.branch_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_manager'
        AND ur.branch_id = branch_settings.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_manager'
        AND ur.branch_id = branch_settings.branch_id
    )
  );

-- Regional managers can view and manage branch settings in their region
CREATE POLICY "Regional managers can manage regional branch settings"
  ON public.branch_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.branches b ON b.id = ur.branch_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'regional_manager'
        AND b.region = (SELECT region FROM public.branches WHERE id = branch_settings.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.branches b ON b.id = ur.branch_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'regional_manager'
        AND b.region = (SELECT region FROM public.branches WHERE id = branch_settings.branch_id)
    )
  );

-- Users can view branch settings for their branch (any role)
CREATE POLICY "Users can view branch settings"
  ON public.branch_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = branch_settings.branch_id
    )
  );

-- Doctors can view branch settings for their branch
CREATE POLICY "Doctors can view branch settings"
  ON public.branch_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'doctor'
        AND ur.branch_id = branch_settings.branch_id
    )
  );

