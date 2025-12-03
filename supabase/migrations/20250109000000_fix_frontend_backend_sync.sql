-- Migration: Fix Frontend-Backend Synchronization
-- Description: Update views and ensure all frontend expectations match backend schema
-- This ensures the frontend can query all expected tables, views, and columns

-- ============================================================================
-- STEP 1: Fix users_with_roles view
-- Frontend expects: user_id, name, email, phone, status, role, branch_id, branch_name
-- Current view uses auth.users (no phone/status), should use public.users
-- ============================================================================

CREATE OR REPLACE VIEW public.users_with_roles AS
SELECT
  u.id AS user_id,
  u.name,
  u.email,
  u.phone,
  u.status,
  ur.role,
  ur.branch_id,
  b.name AS branch_name,
  b.code AS branch_code
FROM public.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
LEFT JOIN public.branches b ON ur.branch_id = b.id
ORDER BY u.name;

-- Grant permissions
GRANT SELECT ON public.users_with_roles TO authenticated;
GRANT SELECT ON public.users_with_roles TO anon;

-- ============================================================================
-- STEP 2: Create dispensers_view
-- Frontend expects this view for dispenser-related queries
-- ============================================================================

CREATE OR REPLACE VIEW public.dispensers_view AS
SELECT DISTINCT
  u.id,
  u.name AS dispenser,
  u.phone,
  u.email,
  b.name AS branch,
  u.status,
  ur.role,
  ur.branch_id,
  u.created_at,
  u.updated_at,
  COALESCE((
    SELECT 
      CASE 
        WHEN COUNT(*) = 0 THEN 0::numeric
        ELSE (COUNT(*) FILTER (WHERE si.status = 'completed')::numeric / COUNT(*)::numeric * 100)
      END
    FROM public.stock_items si
    WHERE si.assigned_to = u.id
  ), 0::numeric) AS performance_score
FROM public.users u
JOIN public.user_roles ur ON u.id = ur.user_id
LEFT JOIN public.branches b ON ur.branch_id = b.id
WHERE ur.role = 'dispenser'::app_role
ORDER BY u.name;

-- Grant permissions
GRANT SELECT ON public.dispensers_view TO authenticated;
GRANT SELECT ON public.dispensers_view TO anon;

-- ============================================================================
-- STEP 3: Create stock_items_view
-- Frontend expects this view with assigned user information
-- ============================================================================

CREATE OR REPLACE VIEW public.stock_items_view AS
SELECT
  si.id,
  si.product_name,
  si.quantity,
  si.unit_price,
  si.expiry_date,
  b.name AS branch,
  si.status,
  si.assigned_to,
  si.assignment_strategy,
  si.date_assigned,
  si.deadline,
  si.emergency_declared_at,
  si.emergency_declared_by,
  si.is_emergency,
  si.priority,
  si.priority_score,
  si.risk_level,
  si.days_to_expiry,
  si.quantity_moved,
  si.value,
  si.is_high_value,
  si.last_updated_at,
  si.last_updated_by,
  si.created_at,
  si.updated_at,
  u.name AS assigned_to_name,
  u.email AS assigned_to_email
FROM public.stock_items si
LEFT JOIN public.branches b ON si.branch_id = b.id
LEFT JOIN public.users u ON si.assigned_to = u.id;

-- Grant permissions
GRANT SELECT ON public.stock_items_view TO authenticated;
GRANT SELECT ON public.stock_items_view TO anon;

-- ============================================================================
-- STEP 4: Fix users_with_roles_and_branches view
-- Frontend expects aggregated roles and branches per user
-- ============================================================================

CREATE OR REPLACE VIEW public.users_with_roles_and_branches AS
SELECT
  u.id AS user_id,
  u.name,
  u.email,
  u.phone,
  u.status,
  u.last_login,
  STRING_AGG(DISTINCT ur.role::text, ', ' ORDER BY ur.role::text) AS roles,
  STRING_AGG(DISTINCT b.name, ', ' ORDER BY b.name) AS branches
FROM public.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
LEFT JOIN public.branches b ON ur.branch_id = b.id
GROUP BY u.id, u.name, u.email, u.phone, u.status, u.last_login
ORDER BY u.name;

-- Grant permissions
GRANT SELECT ON public.users_with_roles_and_branches TO authenticated;
GRANT SELECT ON public.users_with_roles_and_branches TO anon;

-- ============================================================================
-- STEP 5: Create user_permissions_debug view (if referenced)
-- ============================================================================

CREATE OR REPLACE VIEW public.user_permissions_debug AS
SELECT
  u.id AS user_id,
  u.name,
  u.email,
  ARRAY_AGG(ur.role::text) AS roles,
  public.has_role(u.id, 'system_admin'::app_role) AS is_system_admin,
  public.has_role(u.id, 'admin'::app_role) AS is_admin,
  public.has_role(u.id, 'regional_manager'::app_role) AS is_regional_manager
FROM public.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
GROUP BY u.id, u.name, u.email;

-- Grant permissions
GRANT SELECT ON public.user_permissions_debug TO authenticated;

-- ============================================================================
-- STEP 6: Ensure branches table has all expected columns
-- Frontend may expect: address, email, phone, manager_id
-- ============================================================================

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================================
-- STEP 7: Ensure weekly_tasks has all expected columns
-- Frontend expects: product_name, expiry_date, risk_level, quantity, task_date, week_number, month_year
-- ============================================================================

ALTER TABLE public.weekly_tasks
  ADD COLUMN IF NOT EXISTS product_name TEXT,
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS risk_level TEXT,
  ADD COLUMN IF NOT EXISTS quantity INTEGER,
  ADD COLUMN IF NOT EXISTS task_date DATE,
  ADD COLUMN IF NOT EXISTS week_number INTEGER,
  ADD COLUMN IF NOT EXISTS month_year TEXT;

-- ============================================================================
-- STEP 8: Ensure dormant_stock matches frontend expectations
-- Frontend may expect: product_id, product_name, excess_value, excess_qty, sales, days, classification, uploaded_by
-- ============================================================================

-- Check if columns exist, add if missing
DO $$
BEGIN
  -- Add product_name if missing (frontend may use this)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dormant_stock' 
    AND column_name = 'product_name'
  ) THEN
    ALTER TABLE public.dormant_stock ADD COLUMN product_name TEXT;
  END IF;

  -- Add excess_value if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dormant_stock' 
    AND column_name = 'excess_value'
  ) THEN
    ALTER TABLE public.dormant_stock ADD COLUMN excess_value NUMERIC(10,2);
  END IF;

  -- Add excess_qty if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dormant_stock' 
    AND column_name = 'excess_qty'
  ) THEN
    ALTER TABLE public.dormant_stock ADD COLUMN excess_qty INTEGER;
  END IF;

  -- Add sales if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dormant_stock' 
    AND column_name = 'sales'
  ) THEN
    ALTER TABLE public.dormant_stock ADD COLUMN sales INTEGER DEFAULT 0;
  END IF;

  -- Add days if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dormant_stock' 
    AND column_name = 'days'
  ) THEN
    ALTER TABLE public.dormant_stock ADD COLUMN days INTEGER;
  END IF;

  -- Add classification if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dormant_stock' 
    AND column_name = 'classification'
  ) THEN
    ALTER TABLE public.dormant_stock ADD COLUMN classification TEXT CHECK (classification IN ('OTC', 'POM', 'POM/OTC'));
  END IF;

  -- Add uploaded_by if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dormant_stock' 
    AND column_name = 'uploaded_by'
  ) THEN
    ALTER TABLE public.dormant_stock ADD COLUMN uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  -- Add product_id if missing (may be used instead of stock_item_id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dormant_stock' 
    AND column_name = 'product_id'
  ) THEN
    ALTER TABLE public.dormant_stock ADD COLUMN product_id INTEGER;
  END IF;
END $$;

-- ============================================================================
-- STEP 9: Ensure stock_movement_history has branch_id column
-- Frontend may filter by branch_id
-- ============================================================================

ALTER TABLE public.stock_movement_history
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_stock_movement_history_branch_id ON public.stock_movement_history(branch_id);

-- ============================================================================
-- STEP 10: Ensure emergency_assignments has branch_id column
-- Frontend may filter by branch_id
-- ============================================================================

ALTER TABLE public.emergency_assignments
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_emergency_assignments_branch_id ON public.emergency_assignments(branch_id);

-- ============================================================================
-- STEP 11: Create stock_movement_history_view if referenced
-- ============================================================================

-- Drop the view first if it exists to avoid column order conflicts
DROP VIEW IF EXISTS public.stock_movement_history_view;

CREATE VIEW public.stock_movement_history_view AS
SELECT
  smh.id,
  smh.movement_date,
  smh.stock_item_id,
  smh.movement_type,
  f_branch.name AS from_branch,
  t_branch.name AS to_branch,
  smh.quantity_moved,
  smh.for_dispenser,
  smh.moved_by,
  smh.notes,
  si.product_name
FROM public.stock_movement_history smh
LEFT JOIN public.branches f_branch ON smh.from_branch_id = f_branch.id
LEFT JOIN public.branches t_branch ON smh.to_branch_id = t_branch.id
LEFT JOIN public.stock_items si ON smh.stock_item_id = si.id;

-- Grant permissions
GRANT SELECT ON public.stock_movement_history_view TO authenticated;
GRANT SELECT ON public.stock_movement_history_view TO anon;

-- ============================================================================
-- STEP 12: whatsapp_notification_queue is already a table (not a view)
-- The table was created/renamed in migration 20251108000000_unified_whatsapp_notifications.sql
-- No view creation needed - frontend queries the table directly
-- ============================================================================

-- ============================================================================
-- STEP 13: Comments for documentation
-- ============================================================================

COMMENT ON VIEW public.users_with_roles IS 'Users with their roles and branch information. Used by frontend for user management and dispenser selection.';
COMMENT ON VIEW public.dispensers_view IS 'Dispensers with performance metrics. Used by frontend for dispenser management.';
COMMENT ON VIEW public.stock_items_view IS 'Stock items with assigned user information. Used by frontend for stock management.';
COMMENT ON VIEW public.users_with_roles_and_branches IS 'Users with aggregated roles and branches. Used by frontend for user overview.';
-- whatsapp_notification_queue is a table, not a view (see migration 20251108000000_unified_whatsapp_notifications.sql)

