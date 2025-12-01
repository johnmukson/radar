-- Migration: Row-Level Security (RLS) Policies
-- Description: Enable RLS and create policies for all tables

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dormant_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movement_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Allow system and branch system admins to manage all branches
CREATE POLICY "Admins manage branches" ON public.branches
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin') OR public.has_role(auth.uid(), 'branch_system_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'system_admin') OR public.has_role(auth.uid(), 'branch_system_admin'));

-- Allow any authenticated user to read branches (for dropdown lists)
CREATE POLICY "All authenticated users can view branches" ON public.branches
  FOR SELECT
  USING (auth.role() IN ('authenticated','service_role'));

-- Stock items: view items in your branch; branch system admins and regional managers can view all
CREATE POLICY "Select stock items for own branch" ON public.stock_items
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = branch_id
    )
  );

CREATE POLICY "Insert stock items for own branch (authorised roles)" ON public.stock_items
  FOR INSERT
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'system_admin')
      OR public.has_role(auth.uid(), 'branch_system_admin')
      OR public.has_role(auth.uid(), 'regional_manager')
      OR public.has_role(auth.uid(), 'branch_manager')
      OR public.has_role(auth.uid(), 'inventory_assistant')
      OR public.has_role(auth.uid(), 'admin')
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.branch_id = branch_id
    )
  );

CREATE POLICY "Update stock items for own branch (authorised roles)" ON public.stock_items
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'inventory_assistant')
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.branch_id = branch_id
    )
  );

CREATE POLICY "Delete stock items for own branch (authorised roles)" ON public.stock_items
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'inventory_assistant')
    OR public.has_role(auth.uid(), 'admin')
  );

-- Weekly tasks: assignees and managers can view; only creators/editors can modify
CREATE POLICY "View own tasks" ON public.weekly_tasks
  FOR SELECT
  USING (assigned_to = auth.uid());

-- Branch-level managers can view tasks in their branch
CREATE POLICY "Branch-level managers view tasks in their branch" ON public.weekly_tasks
  FOR SELECT
  USING (
    (
      public.has_role(auth.uid(), 'branch_manager')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'inventory_assistant')
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.branch_id = weekly_tasks.branch_id
    )
  );

-- High-level managers can view tasks across all branches
CREATE POLICY "High-level managers view tasks across branches" ON public.weekly_tasks
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'system_admin')
  );

CREATE POLICY "Create tasks (admins, managers)" ON public.weekly_tasks
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'regional_manager')
  );

CREATE POLICY "Update tasks (admins, managers)" ON public.weekly_tasks
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'regional_manager')
  );

CREATE POLICY "Delete tasks (admins, managers)" ON public.weekly_tasks
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'regional_manager')
  );

-- Dormant stock: view/update only within your branch for authorised roles
CREATE POLICY "View dormant stock for own branch" ON public.dormant_stock
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.branch_id = dormant_stock.branch_id
    )
  );

CREATE POLICY "Insert dormant stock (authorised roles)" ON public.dormant_stock
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'inventory_assistant')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Update dormant stock (authorised roles)" ON public.dormant_stock
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'inventory_assistant')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Delete dormant stock (authorised roles)" ON public.dormant_stock
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'inventory_assistant')
    OR public.has_role(auth.uid(), 'admin')
  );

-- Notes: authors can manage their own notes; admins and managers can view branch notes
CREATE POLICY "Authors manage their notes" ON public.notes
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Branch-level managers can view notes in their branch
CREATE POLICY "Branch-level managers view notes in their branch" ON public.notes
  FOR SELECT
  USING (
    (
      public.has_role(auth.uid(), 'branch_manager')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'inventory_assistant')
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.branch_id = notes.branch_id
    )
  );

-- High-level managers can view notes across all branches
CREATE POLICY "High-level managers view notes across branches" ON public.notes
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'system_admin')
  );

-- WhatsApp notifications: only system admins and service roles can read/write
CREATE POLICY "Manage WhatsApp notifications (system admins only)" ON public.whatsapp_notifications
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin') OR auth.role() = 'service_role')
  WITH CHECK (public.has_role(auth.uid(), 'system_admin') OR auth.role() = 'service_role');

-- Emergency assignments: allow anyone to view; only admins can create/update
CREATE POLICY "View emergency assignments" ON public.emergency_assignments
  FOR SELECT
  USING (TRUE);

CREATE POLICY "Admins insert emergency assignments" ON public.emergency_assignments
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins update emergency assignments" ON public.emergency_assignments
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins delete emergency assignments" ON public.emergency_assignments
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'admin')
  );

-- AI recommendations: users can view their own recommendations
CREATE POLICY "View own AI recommendations" ON public.ai_recommendations
  FOR SELECT
  USING (dispenser_id = auth.uid());

-- Only service role can insert AI recommendations (Edge function uses service role key)
CREATE POLICY "Service role inserts AI recommendations" ON public.ai_recommendations
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Stock movement history: viewable by authorised users and participants
CREATE POLICY "Select stock movement history" ON public.stock_movement_history
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR for_dispenser = auth.uid()
    OR moved_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (ur.branch_id = from_branch_id OR ur.branch_id = to_branch_id)
    )
  );

CREATE POLICY "Insert stock movement history" ON public.stock_movement_history
  FOR INSERT
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'system_admin')
      OR public.has_role(auth.uid(), 'branch_system_admin')
      OR public.has_role(auth.uid(), 'regional_manager')
      OR public.has_role(auth.uid(), 'branch_manager')
      OR public.has_role(auth.uid(), 'inventory_assistant')
      OR public.has_role(auth.uid(), 'dispenser')
      OR public.has_role(auth.uid(), 'admin')
    )
    AND (
      from_branch_id IS NULL OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.branch_id = from_branch_id
      )
    )
    AND (
      to_branch_id IS NULL OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.branch_id = to_branch_id
      )
    )
  );

CREATE POLICY "Admins update stock movement history" ON public.stock_movement_history
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
  );

CREATE POLICY "Admins delete stock movement history" ON public.stock_movement_history
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
  );

-- Notifications: users can view and update their own notifications
CREATE POLICY "Users view their notifications" ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users mark notifications as read" ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "System/service inserts notifications" ON public.notifications
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin')
    OR auth.role() = 'service_role'
  );

-- Stock movements: authorised users can view and create movement records
CREATE POLICY "Select stock movements for own branch" ON public.stock_movements
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (ur.branch_id = stock_movements.from_branch_id OR ur.branch_id = stock_movements.to_branch_id)
    )
  );

CREATE POLICY "Insert stock movements (authorised roles)" ON public.stock_movements
  FOR INSERT
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'system_admin')
      OR public.has_role(auth.uid(), 'branch_system_admin')
      OR public.has_role(auth.uid(), 'regional_manager')
      OR public.has_role(auth.uid(), 'branch_manager')
      OR public.has_role(auth.uid(), 'inventory_assistant')
      OR public.has_role(auth.uid(), 'dispenser')
      OR public.has_role(auth.uid(), 'admin')
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.branch_id = from_branch_id
    )
  );

CREATE POLICY "Admins update stock movements" ON public.stock_movements
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
  );

CREATE POLICY "Admins delete stock movements" ON public.stock_movements
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
  );

-- Grant privileges to anon and authenticated roles (for public tables)
-- These grants define baseline access; policies further restrict row access
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;

