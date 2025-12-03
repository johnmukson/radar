-- ============================================================================
-- Ensure Import Templates Table Exists
-- Migration: 20250112000005_ensure_import_templates.sql
-- Description: Creates import_templates table if it doesn't exist
-- ============================================================================

-- Create import_templates table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.import_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL CHECK (template_type IN ('stock_items', 'dormant_stock', 'custom')),
  file_format TEXT NOT NULL CHECK (file_format IN ('csv', 'xlsx', 'xls', 'tsv')),
  column_mapping JSONB NOT NULL, -- Maps template columns to database fields
  default_values JSONB DEFAULT '{}'::jsonb, -- Default values for fields
  validation_rules JSONB DEFAULT '{}'::jsonb, -- Validation rules for template
  required_columns TEXT[] DEFAULT '{}', -- Required columns for this template
  optional_columns TEXT[] DEFAULT '{}', -- Optional columns
  sample_data JSONB, -- Sample data for preview
  is_shared BOOLEAN DEFAULT false, -- Allow sharing with other branches
  is_default BOOLEAN DEFAULT false, -- Default template for branch
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(branch_id, name, template_type)
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_import_templates_branch_id ON public.import_templates(branch_id);
CREATE INDEX IF NOT EXISTS idx_import_templates_template_type ON public.import_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_import_templates_is_default ON public.import_templates(is_default);
CREATE INDEX IF NOT EXISTS idx_import_templates_is_shared ON public.import_templates(is_shared);

-- Create or replace updated_at trigger
DROP TRIGGER IF EXISTS update_import_templates_updated_at ON public.import_templates;
CREATE TRIGGER update_import_templates_updated_at
  BEFORE UPDATE ON public.import_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comment
COMMENT ON TABLE public.import_templates IS 'Import templates for stock items and dormant stock with column mappings and validation rules';

-- Enable RLS
ALTER TABLE public.import_templates ENABLE ROW LEVEL SECURITY;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_templates TO authenticated;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "System admins can manage all import templates" ON public.import_templates;
DROP POLICY IF EXISTS "Admins can manage all import templates" ON public.import_templates;
DROP POLICY IF EXISTS "Branch system admins can manage their branch templates" ON public.import_templates;
DROP POLICY IF EXISTS "Branch managers can manage their branch templates" ON public.import_templates;
DROP POLICY IF EXISTS "Users can view their branch templates" ON public.import_templates;
DROP POLICY IF EXISTS "Authenticated users can view import templates" ON public.import_templates;

-- System admins can manage all import templates
CREATE POLICY "System admins can manage all import templates"
  ON public.import_templates
  FOR ALL
  USING (
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

-- Admins can manage all import templates
CREATE POLICY "Admins can manage all import templates"
  ON public.import_templates
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

-- Branch system admins can manage their branch templates
CREATE POLICY "Branch system admins can manage their branch templates"
  ON public.import_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_system_admin'
        AND (import_templates.branch_id IS NULL OR ur.branch_id = import_templates.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_system_admin'
        AND (import_templates.branch_id IS NULL OR ur.branch_id = import_templates.branch_id)
    )
  );

-- Branch managers can manage their branch templates
CREATE POLICY "Branch managers can manage their branch templates"
  ON public.import_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_manager'
        AND (import_templates.branch_id IS NULL OR ur.branch_id = import_templates.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_manager'
        AND (import_templates.branch_id IS NULL OR ur.branch_id = import_templates.branch_id)
    )
  );

-- Users can view their branch templates and shared templates
CREATE POLICY "Users can view their branch templates"
  ON public.import_templates
  FOR SELECT
  USING (
    -- User's branch templates
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = import_templates.branch_id
    )
    -- OR shared templates
    OR import_templates.is_shared = true
    -- OR user is system admin/admin
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('system_admin', 'admin')
    )
  );

-- Authenticated users can view (catch-all)
CREATE POLICY "Authenticated users can view import templates"
  ON public.import_templates
  FOR SELECT
  USING (auth.role() = 'authenticated');

