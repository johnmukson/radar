-- ============================================================================
-- Ensure AI Recommendations Table Exists
-- Migration: 20250110000000_ensure_ai_recommendations_table.sql
-- Description: Creates ai_recommendations table if it doesn't exist
-- ============================================================================

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN (
    'stock_optimization',
    'expiry_warning',
    'low_stock_alert',
    'reorder_suggestion',
    'cost_reduction',
    'inventory_analysis',
    'custom'
  )),
  title TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  status TEXT NOT NULL CHECK (status IN ('pending', 'reviewed', 'implemented', 'dismissed')) DEFAULT 'pending',
  metadata JSONB DEFAULT '{}'::jsonb,
  impact_score DECIMAL(5,2) DEFAULT 0,
  estimated_savings DECIMAL(10,2),
  estimated_time_savings INTEGER,
  related_stock_items UUID[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  implemented_at TIMESTAMPTZ,
  implemented_by UUID REFERENCES auth.users(id)
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_branch_id ON public.ai_recommendations(branch_id);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_recommendation_type ON public.ai_recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_status ON public.ai_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_priority ON public.ai_recommendations(priority);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_created_at ON public.ai_recommendations(created_at DESC);

-- Create or replace updated_at trigger
DROP TRIGGER IF EXISTS update_ai_recommendations_updated_at ON public.ai_recommendations;
CREATE TRIGGER update_ai_recommendations_updated_at
  BEFORE UPDATE ON public.ai_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "System admins can manage all AI recommendations" ON public.ai_recommendations;
CREATE POLICY "System admins can manage all AI recommendations"
  ON public.ai_recommendations
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'system_admin'));

DROP POLICY IF EXISTS "Regional managers can manage regional recommendations" ON public.ai_recommendations;
CREATE POLICY "Regional managers can manage regional recommendations"
  ON public.ai_recommendations
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'regional_manager') AND
    (
      branch_id IS NULL OR
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.branches b ON b.id = ur.branch_id
        WHERE ur.user_id = auth.uid()
        AND b.region = (SELECT region FROM public.branches WHERE id = ai_recommendations.branch_id)
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'regional_manager') AND
    (
      branch_id IS NULL OR
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.branches b ON b.id = ur.branch_id
        WHERE ur.user_id = auth.uid()
        AND b.region = (SELECT region FROM public.branches WHERE id = ai_recommendations.branch_id)
      )
    )
  );

DROP POLICY IF EXISTS "Branch system admins can manage branch recommendations" ON public.ai_recommendations;
CREATE POLICY "Branch system admins can manage branch recommendations"
  ON public.ai_recommendations
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'branch_system_admin') AND
    (
      branch_id IS NULL OR
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.branch_id = ai_recommendations.branch_id
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
        AND ur.branch_id = ai_recommendations.branch_id
      )
    )
  );

DROP POLICY IF EXISTS "Branch managers can manage branch recommendations" ON public.ai_recommendations;
CREATE POLICY "Branch managers can manage branch recommendations"
  ON public.ai_recommendations
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'branch_manager') AND
    (
      branch_id IS NULL OR
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.branch_id = ai_recommendations.branch_id
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
        AND ur.branch_id = ai_recommendations.branch_id
      )
    )
  );

DROP POLICY IF EXISTS "Users can view branch recommendations" ON public.ai_recommendations;
CREATE POLICY "Users can view branch recommendations"
  ON public.ai_recommendations
  FOR SELECT
  USING (
    branch_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = ai_recommendations.branch_id
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_recommendations TO authenticated;
GRANT SELECT ON public.ai_recommendations TO anon;

-- Comment
COMMENT ON TABLE public.ai_recommendations IS 'AI-powered recommendations for inventory management, stock optimization, and cost reduction';

