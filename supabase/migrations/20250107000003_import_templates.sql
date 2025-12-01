-- ============================================================================
-- Import Templates
-- Migration: 20250107000003_import_templates.sql
-- Date: January 2025
-- Description: Creates table for import templates functionality
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Import Templates Table
-- ----------------------------------------------------------------------------
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

-- Indexes
CREATE INDEX idx_import_templates_branch_id ON public.import_templates(branch_id);
CREATE INDEX idx_import_templates_template_type ON public.import_templates(template_type);
CREATE INDEX idx_import_templates_is_default ON public.import_templates(is_default);
CREATE INDEX idx_import_templates_is_shared ON public.import_templates(is_shared);

-- Updated at trigger
CREATE TRIGGER update_import_templates_updated_at
  BEFORE UPDATE ON public.import_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comment
COMMENT ON TABLE public.import_templates IS 'Import templates for stock items and dormant stock with column mappings and validation rules';

-- ----------------------------------------------------------------------------
-- 2. RLS Policies for Import Templates
-- ----------------------------------------------------------------------------
ALTER TABLE public.import_templates ENABLE ROW LEVEL SECURITY;

-- System admins can manage all import templates
CREATE POLICY "System admins can manage all import templates"
  ON public.import_templates
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'system_admin'));

-- Branch system admins can manage their branch templates
CREATE POLICY "Branch system admins can manage their branch templates"
  ON public.import_templates
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'branch_system_admin') AND
    (
      branch_id IS NULL OR
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.branch_id = import_templates.branch_id
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'branch_system_admin') AND
    (
      branch_id IS NULL OR
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.branch_id = import_templates.branch_id
      )
    )
  );

-- Branch managers can manage their branch templates
CREATE POLICY "Branch managers can manage their branch templates"
  ON public.import_templates
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'branch_manager') AND
    (
      branch_id IS NULL OR
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.branch_id = import_templates.branch_id
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'branch_manager') AND
    (
      branch_id IS NULL OR
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.branch_id = import_templates.branch_id
      )
    )
  );

-- Users can view their branch templates and shared templates
CREATE POLICY "Users can view templates"
  ON public.import_templates
  FOR SELECT
  USING (
    branch_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = import_templates.branch_id
    ) OR
    is_shared = true
  );

-- ----------------------------------------------------------------------------
-- 3. Function to Validate Template
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_import_template(
  p_template_id UUID,
  p_file_columns TEXT[]
)
RETURNS JSONB AS $$
DECLARE
  v_template RECORD;
  v_missing_columns TEXT[];
  v_result JSONB;
BEGIN
  SELECT * INTO v_template
  FROM public.import_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Template not found'
    );
  END IF;

  -- Check required columns
  v_missing_columns := ARRAY(
    SELECT unnest(v_template.required_columns)
    WHERE unnest(v_template.required_columns) != ALL(p_file_columns)
  );

  IF array_length(v_missing_columns, 1) > 0 THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Missing required columns',
      'missing_columns', v_missing_columns
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'template_type', v_template.template_type,
    'column_mapping', v_template.column_mapping
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment
COMMENT ON FUNCTION public.validate_import_template IS 'Validates an import file against a template by checking required columns';

-- ----------------------------------------------------------------------------
-- 4. Function to Get Default Template for Branch
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_default_template(
  p_branch_id UUID,
  p_template_type TEXT
)
RETURNS UUID AS $$
DECLARE
  v_template_id UUID;
BEGIN
  SELECT id INTO v_template_id
  FROM public.import_templates
  WHERE branch_id = p_branch_id
    AND template_type = p_template_type
    AND is_default = true
  LIMIT 1;

  -- If no default found, get any template for the branch
  IF v_template_id IS NULL THEN
    SELECT id INTO v_template_id
    FROM public.import_templates
    WHERE branch_id = p_branch_id
      AND template_type = p_template_type
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  RETURN v_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment
COMMENT ON FUNCTION public.get_default_template IS 'Gets the default template for a branch and template type';

