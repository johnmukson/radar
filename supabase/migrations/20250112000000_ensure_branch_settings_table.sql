-- ============================================================================
-- Ensure Branch Settings Table Exists
-- Migration: 20250112000000_ensure_branch_settings_table.sql
-- Description: Creates branch_settings table if it doesn't exist (fix for missing table)
-- ============================================================================

-- Create branch_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.branch_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(branch_id, setting_key)
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_branch_settings_branch_id ON public.branch_settings(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_settings_key ON public.branch_settings(setting_key);

-- Create or replace updated_at trigger
DROP TRIGGER IF EXISTS update_branch_settings_updated_at ON public.branch_settings;
CREATE TRIGGER update_branch_settings_updated_at
  BEFORE UPDATE ON public.branch_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comment
COMMENT ON TABLE public.branch_settings IS 'Per-branch configuration settings including custom fields, workflows, and notification rules';

-- Enable RLS
ALTER TABLE public.branch_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "System admins can manage all branch settings" ON public.branch_settings;
DROP POLICY IF EXISTS "Branch system admins can manage their branch settings" ON public.branch_settings;
DROP POLICY IF EXISTS "Branch managers can manage their branch settings" ON public.branch_settings;
DROP POLICY IF EXISTS "Regional managers can view branch settings" ON public.branch_settings;
DROP POLICY IF EXISTS "Users can view branch settings" ON public.branch_settings;

-- System admins can manage all branch settings
CREATE POLICY "System admins can manage all branch settings"
  ON public.branch_settings
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'system_admin'));

-- Branch system admins can manage their branch settings
CREATE POLICY "Branch system admins can manage their branch settings"
  ON public.branch_settings
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'branch_system_admin') AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_system_admin'
        AND ur.branch_id = branch_settings.branch_id
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'branch_system_admin') AND
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
    public.has_role(auth.uid(), 'branch_manager') AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_manager'
        AND ur.branch_id = branch_settings.branch_id
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'branch_manager') AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_manager'
        AND ur.branch_id = branch_settings.branch_id
    )
  );

-- Regional managers can view branch settings
CREATE POLICY "Regional managers can view branch settings"
  ON public.branch_settings
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'regional_manager') AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.branches b ON b.id = ur.branch_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'regional_manager'
        AND b.region = (SELECT region FROM public.branches WHERE id = branch_settings.branch_id)
    )
  );

-- Users can view branch settings for their branch
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

