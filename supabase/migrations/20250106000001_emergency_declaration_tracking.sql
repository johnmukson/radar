-- Migration: Emergency Declaration Tracking
-- Description: Add triggers to auto-set emergency_declared_by and moved_by fields
-- Date: 2025-01-06

-- ============================================================================
-- TRIGGER 1: Auto-set emergency_declared_by when emergency is declared
-- ============================================================================

-- Function to auto-set emergency_declared_by when is_emergency is set to true
CREATE OR REPLACE FUNCTION public.auto_set_emergency_declared_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If emergency is being declared (is_emergency changed from false to true)
  IF NEW.is_emergency = true AND (OLD.is_emergency IS NULL OR OLD.is_emergency = false) THEN
    -- Set emergency_declared_by if not already set
    IF NEW.emergency_declared_by IS NULL THEN
      NEW.emergency_declared_by := auth.uid();
    END IF;
    -- Set emergency_declared_at if not already set
    IF NEW.emergency_declared_at IS NULL THEN
      NEW.emergency_declared_at := NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on stock_items
DROP TRIGGER IF EXISTS trigger_auto_set_emergency_declared_by ON public.stock_items;
CREATE TRIGGER trigger_auto_set_emergency_declared_by
  BEFORE UPDATE ON public.stock_items
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_emergency_declared_by();

COMMENT ON FUNCTION public.auto_set_emergency_declared_by() IS 
'Automatically sets emergency_declared_by and emergency_declared_at when an emergency is declared on a stock item. This provides defense in depth - even if frontend forgets to set these fields, the database will ensure they are set.';

-- ============================================================================
-- TRIGGER 2: Auto-set moved_by in stock_movement_history
-- ============================================================================

-- Function to auto-set moved_by when movement history is created
CREATE OR REPLACE FUNCTION public.auto_set_moved_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Set moved_by if not already set
  IF NEW.moved_by IS NULL THEN
    NEW.moved_by := auth.uid();
  END IF;
  
  -- Set from_branch_id from stock_item if not set
  IF NEW.from_branch_id IS NULL AND NEW.stock_item_id IS NOT NULL THEN
    SELECT branch_id INTO NEW.from_branch_id
    FROM public.stock_items
    WHERE id = NEW.stock_item_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on stock_movement_history
DROP TRIGGER IF EXISTS trigger_auto_set_moved_by ON public.stock_movement_history;
CREATE TRIGGER trigger_auto_set_moved_by
  BEFORE INSERT ON public.stock_movement_history
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_moved_by();

COMMENT ON FUNCTION public.auto_set_moved_by() IS 
'Automatically sets moved_by and from_branch_id when a stock movement is recorded. This provides defense in depth - even if frontend forgets to set these fields, the database will ensure they are set.';

-- ============================================================================
-- TRIGGER 3: Auto-set assigned_by in emergency_assignments
-- ============================================================================

-- Function to auto-set assigned_by when emergency assignment is created
CREATE OR REPLACE FUNCTION public.auto_set_assigned_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Set assigned_by if not already set
  IF NEW.assigned_by IS NULL THEN
    NEW.assigned_by := auth.uid();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on emergency_assignments
DROP TRIGGER IF EXISTS trigger_auto_set_assigned_by ON public.emergency_assignments;
CREATE TRIGGER trigger_auto_set_assigned_by
  BEFORE INSERT ON public.emergency_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_assigned_by();

COMMENT ON FUNCTION public.auto_set_assigned_by() IS 
'Automatically sets assigned_by when an emergency assignment is created. This provides defense in depth - even if frontend forgets to set this field, the database will ensure it is set.';

