-- ============================================================================
-- Migration: 20251109000000_secure_branch_rls.sql
-- Purpose  : Reconcile remote database RLS and role utilities with the
--            branch-compartmentalised security model defined in docs/backend.md.
--            This script is intentionally idempotent so it can safely run on the
--            existing remote instance without dropping data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Ensure enum values exist (remote instance currently missing several)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_value TEXT;
BEGIN
  FOR v_value IN SELECT unnest(ARRAY[
    'system_admin',
    'branch_system_admin',
    'regional_manager',
    'admin',
    'branch_manager',
    'inventory_assistant',
    'dispenser',
    'doctor'
  ])
  LOOP
    BEGIN
      EXECUTE format('ALTER TYPE app_role ADD VALUE IF NOT EXISTS %L', v_value);
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Ensure supporting columns/indexes exist
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_user_roles_user_branch ON public.user_roles(user_id, branch_id);

-- Ensure downstream tables have branch references for policy enforcement
ALTER TABLE public.stock_movement_history
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.emergency_assignments
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.weekly_tasks
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE public.whatsapp_notification_queue
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE public.stock_movement_history smh
SET branch_id = COALESCE(smh.branch_id, si.branch_id)
FROM public.stock_items si
WHERE smh.branch_id IS NULL
  AND si.id = smh.stock_item_id;

UPDATE public.emergency_assignments ea
SET branch_id = COALESCE(ea.branch_id, si.branch_id)
FROM public.stock_items si
WHERE ea.branch_id IS NULL
  AND si.id = ea.stock_item_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'dispensers'
  ) THEN
    EXECUTE $upd$
      UPDATE public.weekly_tasks wt
      SET branch_id = COALESCE(wt.branch_id, d.branch_id)
      FROM public.dispensers d
      WHERE wt.branch_id IS NULL
        AND wt.assigned_to = d.id
    $upd$;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notes'
      AND column_name = 'created_by'
  ) THEN
    EXECUTE 'UPDATE public.notes SET user_id = COALESCE(user_id, created_by)';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_stock_movement_history_branch_id ON public.stock_movement_history(branch_id);
CREATE INDEX IF NOT EXISTS idx_emergency_assignments_branch_id ON public.emergency_assignments(branch_id);
CREATE INDEX IF NOT EXISTS idx_weekly_tasks_branch_id ON public.weekly_tasks(branch_id);

-- ---------------------------------------------------------------------------
-- 3. Recreate role helper to honour branch scope + elevated roles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(
  _user_id   UUID,
  _role      TEXT,
  _branch_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role    = _role::app_role
      AND (
        _branch_id IS NULL
        OR ur.branch_id = _branch_id
        OR ur.role::text IN ('system_admin', 'regional_manager')
      )
  );
$$;

COMMENT ON FUNCTION public.has_role(UUID, app_role, UUID) IS
  'Branch-aware role lookup used by RLS policies. System and regional managers bypass branch checks.';

-- ---------------------------------------------------------------------------
-- 4. Utility helper to (re)create policies safely
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._drop_policy_if_exists(
  p_policy_name TEXT,
  p_table       TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname = p_policy_name
      AND tablename  = p_table
  ) THEN
    EXECUTE format('DROP POLICY "%s" ON public.%s', p_policy_name, p_table);
  END IF;
END;
$$;

COMMENT ON FUNCTION public._drop_policy_if_exists IS
  'Internal helper to drop a policy when present.';

-- ---------------------------------------------------------------------------
-- 5. Rebuild Branch policies (branches table)
-- ---------------------------------------------------------------------------
SELECT public._drop_policy_if_exists('Admins manage branches', 'branches');
SELECT public._drop_policy_if_exists('All authenticated users can view branches', 'branches');
SELECT public._drop_policy_if_exists('Regional managers can view all branches', 'branches');
SELECT public._drop_policy_if_exists('Branch managers can view their branch', 'branches');
SELECT public._drop_policy_if_exists('Users can view their branch', 'branches');

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage branches" ON public.branches
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
  );

CREATE POLICY "All authenticated users can view branches" ON public.branches
  FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "Regional managers can view all branches" ON public.branches
  FOR SELECT
  USING (public.has_role(auth.uid(), 'regional_manager', NULL));

CREATE POLICY "Branch managers can view their branch" ON public.branches
  FOR SELECT
  USING (public.has_role(auth.uid(), 'branch_manager', id));

CREATE POLICY "Users can view their branch" ON public.branches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = public.branches.id
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Stock items + movement history (branch-aware)
-- ---------------------------------------------------------------------------
SELECT public._drop_policy_if_exists('Users can view all stock items', 'stock_items');
SELECT public._drop_policy_if_exists('Users can insert stock items', 'stock_items');
SELECT public._drop_policy_if_exists('Users can update stock items', 'stock_items');
SELECT public._drop_policy_if_exists('Users can delete stock items', 'stock_items');
SELECT public._drop_policy_if_exists('Only admins can insert stock items', 'stock_items');
SELECT public._drop_policy_if_exists('Only admins can update stock items', 'stock_items');
SELECT public._drop_policy_if_exists('Only admins can delete stock items', 'stock_items');

ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select stock items for own branch" ON public.stock_items
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'regional_manager', NULL)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = public.stock_items.branch_id
    )
  );

CREATE POLICY "Insert stock items for own branch (authorised roles)" ON public.stock_items
  FOR INSERT
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'system_admin', NULL)
      OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
      OR public.has_role(auth.uid(), 'regional_manager', NULL)
      OR public.has_role(auth.uid(), 'branch_manager', NULL)
      OR public.has_role(auth.uid(), 'inventory_assistant', NULL)
      OR public.has_role(auth.uid(), 'admin', NULL)
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = public.stock_items.branch_id
    )
  );

CREATE POLICY "Update stock items for own branch (authorised roles)" ON public.stock_items
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'regional_manager', NULL)
    OR public.has_role(auth.uid(), 'branch_manager', NULL)
    OR public.has_role(auth.uid(), 'inventory_assistant', NULL)
    OR public.has_role(auth.uid(), 'admin', NULL)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'regional_manager', NULL)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = public.stock_items.branch_id
    )
  );

CREATE POLICY "Delete stock items for own branch (authorised roles)" ON public.stock_items
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'regional_manager', NULL)
    OR public.has_role(auth.uid(), 'branch_manager', NULL)
    OR public.has_role(auth.uid(), 'inventory_assistant', NULL)
    OR public.has_role(auth.uid(), 'admin', NULL)
  );

-- Stock movement history policies
SELECT public._drop_policy_if_exists('Users can view all stock movements', 'stock_movement_history');
SELECT public._drop_policy_if_exists('Users can insert stock movements', 'stock_movement_history');

ALTER TABLE public.stock_movement_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View stock movement history for branch" ON public.stock_movement_history
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'regional_manager', NULL)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = public.stock_movement_history.branch_id
    )
  );

CREATE POLICY "Insert stock movement history (authorised roles)" ON public.stock_movement_history
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'regional_manager', NULL)
    OR public.has_role(auth.uid(), 'branch_manager', NULL)
    OR public.has_role(auth.uid(), 'inventory_assistant', NULL)
    OR public.has_role(auth.uid(), 'admin', NULL)
  );

-- ---------------------------------------------------------------------------
-- 7. Weekly tasks, dormant stock, notes
-- ---------------------------------------------------------------------------
SELECT public._drop_policy_if_exists('View own tasks', 'weekly_tasks');
SELECT public._drop_policy_if_exists('Branch-level managers view tasks in their branch', 'weekly_tasks');
SELECT public._drop_policy_if_exists('High-level managers view tasks across branches', 'weekly_tasks');
SELECT public._drop_policy_if_exists('Create tasks (admins, managers)', 'weekly_tasks');
SELECT public._drop_policy_if_exists('Update tasks (admins, managers)', 'weekly_tasks');
SELECT public._drop_policy_if_exists('Delete tasks (admins, managers)', 'weekly_tasks');
SELECT public._drop_policy_if_exists('Admin can manage all weekly tasks', 'weekly_tasks');

ALTER TABLE public.weekly_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own tasks" ON public.weekly_tasks
  FOR SELECT
  USING (public.weekly_tasks.assigned_to = auth.uid());

CREATE POLICY "Branch-level managers view tasks in their branch" ON public.weekly_tasks
  FOR SELECT
  USING (
    (
      public.has_role(auth.uid(), 'branch_manager', NULL)
      OR public.has_role(auth.uid(), 'admin', NULL)
      OR public.has_role(auth.uid(), 'inventory_assistant', NULL)
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = public.weekly_tasks.branch_id
    )
  );

CREATE POLICY "High-level managers view tasks across branches" ON public.weekly_tasks
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'regional_manager', NULL)
    OR public.has_role(auth.uid(), 'system_admin', NULL)
  );

CREATE POLICY "Create tasks (admins, managers)" ON public.weekly_tasks
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_manager', NULL)
    OR public.has_role(auth.uid(), 'admin', NULL)
    OR public.has_role(auth.uid(), 'regional_manager', NULL)
  );

CREATE POLICY "Update tasks (admins, managers)" ON public.weekly_tasks
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_manager', NULL)
    OR public.has_role(auth.uid(), 'admin', NULL)
    OR public.has_role(auth.uid(), 'regional_manager', NULL)
  );

CREATE POLICY "Delete tasks (admins, managers)" ON public.weekly_tasks
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_manager', NULL)
    OR public.has_role(auth.uid(), 'admin', NULL)
    OR public.has_role(auth.uid(), 'regional_manager', NULL)
  );

-- Dormant stock
SELECT public._drop_policy_if_exists('View dormant stock for own branch', 'dormant_stock');
SELECT public._drop_policy_if_exists('Insert dormant stock (authorised roles)', 'dormant_stock');
SELECT public._drop_policy_if_exists('Update dormant stock (authorised roles)', 'dormant_stock');
SELECT public._drop_policy_if_exists('Delete dormant stock (authorised roles)', 'dormant_stock');

ALTER TABLE public.dormant_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View dormant stock for own branch" ON public.dormant_stock
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'regional_manager', NULL)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = public.dormant_stock.branch_id
    )
  );

CREATE POLICY "Insert dormant stock (authorised roles)" ON public.dormant_stock
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'regional_manager', NULL)
    OR public.has_role(auth.uid(), 'branch_manager', NULL)
    OR public.has_role(auth.uid(), 'inventory_assistant', NULL)
    OR public.has_role(auth.uid(), 'admin', NULL)
  );

CREATE POLICY "Update dormant stock (authorised roles)" ON public.dormant_stock
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'regional_manager', NULL)
    OR public.has_role(auth.uid(), 'branch_manager', NULL)
    OR public.has_role(auth.uid(), 'inventory_assistant', NULL)
    OR public.has_role(auth.uid(), 'admin', NULL)
  );

CREATE POLICY "Delete dormant stock (authorised roles)" ON public.dormant_stock
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'regional_manager', NULL)
    OR public.has_role(auth.uid(), 'branch_manager', NULL)
    OR public.has_role(auth.uid(), 'inventory_assistant', NULL)
    OR public.has_role(auth.uid(), 'admin', NULL)
  );

-- Notes
SELECT public._drop_policy_if_exists('Authors manage their notes', 'notes');

CREATE POLICY "Authors manage their notes" ON public.notes
  FOR ALL
  USING (public.notes.user_id = auth.uid())
  WITH CHECK (public.notes.user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 8. Notifications (in-app + WhatsApp queue)
-- ---------------------------------------------------------------------------
SELECT public._drop_policy_if_exists('Users can view all notifications', 'notifications');
SELECT public._drop_policy_if_exists('Users can insert notifications', 'notifications');
SELECT public._drop_policy_if_exists('Users can update notifications', 'notifications');

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their notifications" ON public.notifications
  FOR SELECT
  USING (public.notifications.user_id = auth.uid());

CREATE POLICY "Users insert their notifications" ON public.notifications
  FOR INSERT
  WITH CHECK (
    public.notifications.user_id = auth.uid()
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users mark notifications as read" ON public.notifications
  FOR UPDATE
  USING (public.notifications.user_id = auth.uid())
  WITH CHECK (public.notifications.user_id = auth.uid());

-- WhatsApp queue / event log
SELECT public._drop_policy_if_exists('Users can view all WhatsApp notifications', 'whatsapp_notification_queue');
SELECT public._drop_policy_if_exists('Users can view own WhatsApp notifications', 'whatsapp_notification_queue');

ALTER TABLE IF EXISTS public.whatsapp_notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own WhatsApp queue entries" ON public.whatsapp_notification_queue
  FOR SELECT
  TO authenticated
  USING (public.whatsapp_notification_queue.user_id = auth.uid());

CREATE POLICY "Authenticated users enqueue WhatsApp notifications" ON public.whatsapp_notification_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (public.whatsapp_notification_queue.user_id = auth.uid());

CREATE POLICY "Service role enqueues WhatsApp notifications" ON public.whatsapp_notification_queue
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role updates WhatsApp queue status" ON public.whatsapp_notification_queue
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages WhatsApp events" ON public.whatsapp_notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 9. Emergency assignments
-- ---------------------------------------------------------------------------
SELECT public._drop_policy_if_exists('Users can view emergency assignments', 'emergency_assignments');
SELECT public._drop_policy_if_exists('Only admins can create emergency assignments', 'emergency_assignments');
SELECT public._drop_policy_if_exists('Only admins can update emergency assignments', 'emergency_assignments');
SELECT public._drop_policy_if_exists('Only admins can delete emergency assignments', 'emergency_assignments');

ALTER TABLE public.emergency_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View emergency assignments by branch" ON public.emergency_assignments
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'regional_manager', NULL)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = public.emergency_assignments.branch_id
    )
  );

CREATE POLICY "Manage emergency assignments (branch roles)" ON public.emergency_assignments
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_manager', NULL)
    OR public.has_role(auth.uid(), 'admin', NULL)
    OR public.has_role(auth.uid(), 'inventory_assistant', NULL)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin', NULL)
    OR public.has_role(auth.uid(), 'branch_system_admin', NULL)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = public.emergency_assignments.branch_id
    )
  );

-- ---------------------------------------------------------------------------
-- 10. Cleanup helper function
-- ---------------------------------------------------------------------------
DROP FUNCTION public._drop_policy_if_exists;

-- ============================================================================

