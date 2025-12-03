-- ============================================================================
-- Monthly History Tracking System
-- Migration: 20250112000007_monthly_history_tracking.sql
-- Description: Creates functions to capture and track monthly performance history
-- ============================================================================

-- Ensure branch_performance table exists with all necessary columns
CREATE TABLE IF NOT EXISTS public.branch_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_stock_value NUMERIC(10,2) DEFAULT 0,
  items_expired INTEGER DEFAULT 0,
  items_near_expiry INTEGER DEFAULT 0,
  emergency_assignments INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  dispensers_active INTEGER DEFAULT 0,
  items_sold INTEGER DEFAULT 0,
  items_moved INTEGER DEFAULT 0,
  total_movement_value NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, period_start, period_end)
);

-- Add new columns if they don't exist
ALTER TABLE public.branch_performance 
  ADD COLUMN IF NOT EXISTS items_sold INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items_moved INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_movement_value NUMERIC(10,2) DEFAULT 0;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_branch_performance_branch_id ON public.branch_performance(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_performance_period_start ON public.branch_performance(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_branch_performance_period_end ON public.branch_performance(period_end DESC);

-- Function to capture monthly snapshot for a branch
CREATE OR REPLACE FUNCTION public.capture_monthly_snapshot(
  p_branch_id UUID,
  p_month DATE DEFAULT NULL -- If NULL, captures current month
)
RETURNS UUID AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
  v_snapshot_id UUID;
  v_total_stock_value NUMERIC(10,2);
  v_items_expired INTEGER;
  v_items_near_expiry INTEGER;
  v_emergency_assignments INTEGER;
  v_tasks_completed INTEGER;
  v_dispensers_active INTEGER;
  v_items_sold INTEGER;
  v_items_moved INTEGER;
  v_total_movement_value NUMERIC(10,2);
BEGIN
  -- Determine period (first and last day of month)
  IF p_month IS NULL THEN
    v_period_start := DATE_TRUNC('month', CURRENT_DATE);
    v_period_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
  ELSE
    v_period_start := DATE_TRUNC('month', p_month);
    v_period_end := (DATE_TRUNC('month', p_month) + INTERVAL '1 month - 1 day')::DATE;
  END IF;

  -- Check if snapshot already exists
  SELECT id INTO v_snapshot_id
  FROM public.branch_performance
  WHERE branch_id = p_branch_id
    AND period_start = v_period_start
    AND period_end = v_period_end;

  -- Calculate total stock value
  SELECT COALESCE(SUM(quantity * unit_price), 0) INTO v_total_stock_value
  FROM public.stock_items
  WHERE branch_id = p_branch_id
    AND status = 'active';

  -- Calculate expired items
  SELECT COUNT(*) INTO v_items_expired
  FROM public.stock_items
  WHERE branch_id = p_branch_id
    AND expiry_date < CURRENT_DATE
    AND status = 'active';

  -- Calculate items near expiry (within 30 days)
  SELECT COUNT(*) INTO v_items_near_expiry
  FROM public.stock_items
  WHERE branch_id = p_branch_id
    AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    AND status = 'active';

  -- Calculate emergency assignments
  SELECT COUNT(*) INTO v_emergency_assignments
  FROM public.emergency_assignments
  WHERE branch_id = p_branch_id
    AND status = 'pending';

  -- Calculate tasks completed in the period
  SELECT COUNT(*) INTO v_tasks_completed
  FROM public.weekly_tasks
  WHERE branch_id = p_branch_id
    AND status = 'completed'
    AND updated_at >= v_period_start
    AND updated_at <= v_period_end + INTERVAL '1 day';

  -- Calculate active dispensers
  SELECT COUNT(DISTINCT assigned_to) INTO v_dispensers_active
  FROM public.stock_items
  WHERE branch_id = p_branch_id
    AND assigned_to IS NOT NULL
    AND status = 'active';

  -- Calculate items sold in the period
  SELECT 
    COUNT(*),
    COALESCE(SUM(quantity_moved), 0),
    COALESCE(SUM(quantity_moved * (SELECT unit_price FROM public.stock_items WHERE id = stock_item_id)), 0)
  INTO v_items_sold, v_items_moved, v_total_movement_value
  FROM public.stock_movement_history
  WHERE branch_id = p_branch_id
    AND movement_type IN ('sell', 'used', 'disposed')
    AND movement_date >= v_period_start
    AND movement_date <= v_period_end + INTERVAL '1 day';

  -- Insert or update snapshot
  IF v_snapshot_id IS NOT NULL THEN
    UPDATE public.branch_performance
    SET
      total_stock_value = v_total_stock_value,
      items_expired = v_items_expired,
      items_near_expiry = v_items_near_expiry,
      emergency_assignments = v_emergency_assignments,
      tasks_completed = v_tasks_completed,
      dispensers_active = v_dispensers_active,
      items_sold = v_items_sold,
      items_moved = v_items_moved,
      total_movement_value = v_total_movement_value
    WHERE id = v_snapshot_id;
    RETURN v_snapshot_id;
  ELSE
    INSERT INTO public.branch_performance (
      branch_id,
      period_start,
      period_end,
      total_stock_value,
      items_expired,
      items_near_expiry,
      emergency_assignments,
      tasks_completed,
      dispensers_active,
      items_sold,
      items_moved,
      total_movement_value
    ) VALUES (
      p_branch_id,
      v_period_start,
      v_period_end,
      v_total_stock_value,
      v_items_expired,
      v_items_near_expiry,
      v_emergency_assignments,
      v_tasks_completed,
      v_dispensers_active,
      v_items_sold,
      v_items_moved,
      v_total_movement_value
    ) RETURNING id INTO v_snapshot_id;
    RETURN v_snapshot_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to capture monthly snapshots for all branches
CREATE OR REPLACE FUNCTION public.capture_all_branches_monthly_snapshot(
  p_month DATE DEFAULT NULL
)
RETURNS TABLE (
  branch_id UUID,
  branch_name TEXT,
  snapshot_id UUID,
  period_start DATE,
  period_end DATE
) AS $$
DECLARE
  v_branch RECORD;
  v_snapshot_id UUID;
BEGIN
  FOR v_branch IN SELECT id, name FROM public.branches
  LOOP
    SELECT public.capture_monthly_snapshot(v_branch.id, p_month) INTO v_snapshot_id;
    
    RETURN QUERY SELECT 
      v_branch.id,
      v_branch.name,
      v_snapshot_id,
      DATE_TRUNC('month', COALESCE(p_month, CURRENT_DATE))::DATE,
      (DATE_TRUNC('month', COALESCE(p_month, CURRENT_DATE)) + INTERVAL '1 month - 1 day')::DATE;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get monthly history for a branch
CREATE OR REPLACE FUNCTION public.get_monthly_history(
  p_branch_id UUID,
  p_months_back INTEGER DEFAULT 12
)
RETURNS TABLE (
  period_start DATE,
  period_end DATE,
  total_stock_value NUMERIC(10,2),
  items_expired INTEGER,
  items_near_expiry INTEGER,
  emergency_assignments INTEGER,
  tasks_completed INTEGER,
  dispensers_active INTEGER,
  items_sold INTEGER,
  items_moved INTEGER,
  total_movement_value NUMERIC(10,2),
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bp.period_start,
    bp.period_end,
    bp.total_stock_value,
    bp.items_expired,
    bp.items_near_expiry,
    bp.emergency_assignments,
    bp.tasks_completed,
    bp.dispensers_active,
    bp.items_sold,
    bp.items_moved,
    bp.total_movement_value,
    bp.created_at
  FROM public.branch_performance bp
  WHERE bp.branch_id = p_branch_id
  ORDER BY bp.period_start DESC
  LIMIT p_months_back;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.branch_performance TO authenticated;
GRANT EXECUTE ON FUNCTION public.capture_monthly_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION public.capture_all_branches_monthly_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_history TO authenticated;

-- Enable RLS
ALTER TABLE public.branch_performance ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view branch performance for their branch" ON public.branch_performance;
DROP POLICY IF EXISTS "System admins can manage all branch performance" ON public.branch_performance;
DROP POLICY IF EXISTS "Admins can manage all branch performance" ON public.branch_performance;
DROP POLICY IF EXISTS "Authenticated users can view branch performance" ON public.branch_performance;

-- Users can view branch performance for their branch
CREATE POLICY "Users can view branch performance for their branch"
  ON public.branch_performance
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = branch_performance.branch_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('system_admin', 'admin', 'regional_manager')
    )
  );

-- System admins can manage all branch performance
CREATE POLICY "System admins can manage all branch performance"
  ON public.branch_performance
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

-- Authenticated users can view (catch-all)
CREATE POLICY "Authenticated users can view branch performance"
  ON public.branch_performance
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Comments
COMMENT ON FUNCTION public.capture_monthly_snapshot IS 'Captures a monthly snapshot of branch performance metrics';
COMMENT ON FUNCTION public.capture_all_branches_monthly_snapshot IS 'Captures monthly snapshots for all branches';
COMMENT ON FUNCTION public.get_monthly_history IS 'Retrieves monthly history for a branch (default: last 12 months)';

