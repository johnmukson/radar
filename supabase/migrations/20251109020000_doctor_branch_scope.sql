-- ============================================================================
-- Migration: 20251109020000_doctor_branch_scope.sql
-- Purpose  : Restrict the doctor role to branch-scoped, read-only access.
-- ============================================================================

-- 1. Branch visibility (only assigned branches)
DROP POLICY IF EXISTS "Doctors can view branches" ON public.branches;
CREATE POLICY "Doctors can view branches" ON public.branches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'doctor'::app_role
        AND ur.branch_id = public.branches.id
    )
  );

-- 2. Stock items
DROP POLICY IF EXISTS "Doctors can view stock items" ON public.stock_items;
CREATE POLICY "Doctors can view stock items" ON public.stock_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'doctor'::app_role
        AND ur.branch_id = public.stock_items.branch_id
    )
  );

-- 3. Stock movement history
DROP POLICY IF EXISTS "Doctors can view stock movement history" ON public.stock_movement_history;
CREATE POLICY "Doctors can view stock movement history" ON public.stock_movement_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'doctor'::app_role
        AND ur.branch_id = public.stock_movement_history.branch_id
    )
  );

-- 4. Weekly tasks
DROP POLICY IF EXISTS "Doctors can view weekly tasks" ON public.weekly_tasks;
CREATE POLICY "Doctors can view weekly tasks" ON public.weekly_tasks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'doctor'::app_role
        AND ur.branch_id = public.weekly_tasks.branch_id
    )
  );

-- 5. Dormant stock
DROP POLICY IF EXISTS "Doctors can view dormant stock" ON public.dormant_stock;
CREATE POLICY "Doctors can view dormant stock" ON public.dormant_stock
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'doctor'::app_role
        AND ur.branch_id = public.dormant_stock.branch_id
    )
  );

-- 6. Emergency assignments
DROP POLICY IF EXISTS "Doctors can view emergency assignments" ON public.emergency_assignments;
CREATE POLICY "Doctors can view emergency assignments" ON public.emergency_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'doctor'::app_role
        AND ur.branch_id = public.emergency_assignments.branch_id
    )
  );

-- 7. Branch activity logs (if table exists)
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
        USING (
          EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = ''doctor''::app_role
              AND ur.branch_id = public.branch_activity_logs.branch_id
          )
        )
    ';
  END IF;
END
$$;

-- 8. WhatsApp notification queue (branch-scoped or self-owned)
DROP POLICY IF EXISTS "Doctors can view WhatsApp queue" ON public.whatsapp_notification_queue;
CREATE POLICY "Doctors can view WhatsApp queue" ON public.whatsapp_notification_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'doctor'::app_role
        AND (
          ur.branch_id = public.whatsapp_notification_queue.branch_id
          OR public.whatsapp_notification_queue.user_id = auth.uid()
        )
    )
  );

