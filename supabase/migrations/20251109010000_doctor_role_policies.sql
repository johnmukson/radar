-- ============================================================================
-- Migration: 20251109010000_doctor_role_policies.sql
-- Purpose  : Reintroduce the doctor role as a read-only persona across the app.
--            Doctors can view branch-scoped resources but cannot mutate data.
-- ============================================================================

-- Ensure doctor enum value exists (safe to run multiple times)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role'
      AND e.enumlabel = 'doctor'
  ) THEN
    ALTER TYPE app_role ADD VALUE 'doctor';
  END IF;
END
$$;

-- Branch list visibility
DROP POLICY IF EXISTS "Doctors can view branches" ON public.branches;
CREATE POLICY "Doctors can view branches" ON public.branches
  FOR SELECT
  USING (public.has_role(auth.uid(), 'doctor', NULL));

-- Stock items visibility (all branches)
DROP POLICY IF EXISTS "Doctors can view stock items" ON public.stock_items;
CREATE POLICY "Doctors can view stock items" ON public.stock_items
  FOR SELECT
  USING (public.has_role(auth.uid(), 'doctor', NULL));

-- Stock movement history visibility
DROP POLICY IF EXISTS "Doctors can view stock movement history" ON public.stock_movement_history;
CREATE POLICY "Doctors can view stock movement history" ON public.stock_movement_history
  FOR SELECT
  USING (public.has_role(auth.uid(), 'doctor', NULL));

-- Weekly tasks visibility
DROP POLICY IF EXISTS "Doctors can view weekly tasks" ON public.weekly_tasks;
CREATE POLICY "Doctors can view weekly tasks" ON public.weekly_tasks
  FOR SELECT
  USING (public.has_role(auth.uid(), 'doctor', NULL));

-- Dormant stock visibility
DROP POLICY IF EXISTS "Doctors can view dormant stock" ON public.dormant_stock;
CREATE POLICY "Doctors can view dormant stock" ON public.dormant_stock
  FOR SELECT
  USING (public.has_role(auth.uid(), 'doctor', NULL));

-- Emergency assignments visibility
DROP POLICY IF EXISTS "Doctors can view emergency assignments" ON public.emergency_assignments;
CREATE POLICY "Doctors can view emergency assignments" ON public.emergency_assignments
  FOR SELECT
  USING (public.has_role(auth.uid(), 'doctor', NULL));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'branch_activity_logs'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Doctors can view branch activity logs" ON public.branch_activity_logs';
    EXECUTE '
      CREATE POLICY "Doctors can view branch activity logs" ON public.branch_activity_logs
        FOR SELECT
        USING (public.has_role(auth.uid(), ''doctor'', NULL))
    ';
  END IF;
END
$$;

-- WhatsApp notifications queue visibility (optional read-only access)
DROP POLICY IF EXISTS "Doctors can view WhatsApp queue" ON public.whatsapp_notification_queue;
CREATE POLICY "Doctors can view WhatsApp queue" ON public.whatsapp_notification_queue
  FOR SELECT
  USING (public.has_role(auth.uid(), 'doctor', NULL));

