-- ============================================================================
-- Fix Branch Settings Permissions - More Permissive Policies
-- Migration: 20250112000002_fix_branch_settings_permissions.sql
-- Description: Makes RLS policies more permissive and adds table grants
-- ============================================================================

-- Grant table permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_settings TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Drop all existing policies
DROP POLICY IF EXISTS "System admins can manage all branch settings" ON public.branch_settings;
DROP POLICY IF EXISTS "Admins can manage all branch settings" ON public.branch_settings;
DROP POLICY IF EXISTS "Branch system admins can manage their branch settings" ON public.branch_settings;
DROP POLICY IF EXISTS "Branch managers can manage their branch settings" ON public.branch_settings;
DROP POLICY IF EXISTS "Regional managers can manage regional branch settings" ON public.branch_settings;
DROP POLICY IF EXISTS "Users can view branch settings" ON public.branch_settings;
DROP POLICY IF EXISTS "Doctors can view branch settings" ON public.branch_settings;

-- Policy 1: System admins can do everything
CREATE POLICY "System admins can manage all branch settings"
  ON public.branch_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'system_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'system_admin'
    )
  );

-- Policy 2: Admin role can do everything (backward compatibility)
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

-- Policy 3: Regional managers can manage settings in their region
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

-- Policy 4: Branch system admins can manage their branch
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

-- Policy 5: Branch managers can manage their branch
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

-- Policy 6: ANY authenticated user with ANY role for the branch can VIEW
-- This is the most permissive read policy
CREATE POLICY "Users can view branch settings for their branch"
  ON public.branch_settings
  FOR SELECT
  USING (
    -- Allow if user has ANY role for this branch
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = branch_settings.branch_id
    )
    -- OR if user is system admin or admin (they can see everything)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('system_admin', 'admin')
    )
  );

-- Policy 7: Allow authenticated users to insert/update if they have branch access
-- This allows users to create settings for their branch
CREATE POLICY "Users can manage settings for their branch"
  ON public.branch_settings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = branch_settings.branch_id
        AND ur.role IN ('branch_manager', 'branch_system_admin', 'admin', 'system_admin')
    )
  );

CREATE POLICY "Users can update settings for their branch"
  ON public.branch_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = branch_settings.branch_id
        AND ur.role IN ('branch_manager', 'branch_system_admin', 'admin', 'system_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = branch_settings.branch_id
        AND ur.role IN ('branch_manager', 'branch_system_admin', 'admin', 'system_admin')
    )
  );

