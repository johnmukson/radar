-- Migration: Fix Emergency Assignments RLS Policies
-- Description: Replace insecure RLS policies with proper branch isolation and role-based access control
-- Date: January 2025
-- Priority: Critical (Security Fix)

-- Drop existing insecure policies
DROP POLICY IF EXISTS "View emergency assignments" ON public.emergency_assignments;
DROP POLICY IF EXISTS "Admins insert emergency assignments" ON public.emergency_assignments;
DROP POLICY IF EXISTS "Admins update emergency assignments" ON public.emergency_assignments;
DROP POLICY IF EXISTS "Admins delete emergency assignments" ON public.emergency_assignments;

-- Policy 1: System Admins & Regional Managers (Full Access)
-- These roles can view and manage all emergency assignments across all branches
CREATE POLICY "System admins and regional managers can manage all emergency assignments"
  ON public.emergency_assignments
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
  );

-- Policy 2: Branch System Admins (Branch-Scoped)
-- Branch system admins can only manage emergency assignments for their assigned branches
CREATE POLICY "Branch system admins can manage emergency assignments for their branches"
  ON public.emergency_assignments
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'branch_system_admin')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'branch_system_admin'::public.app_role
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'branch_system_admin')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'branch_system_admin'::public.app_role
    )
  );

-- Policy 3: Branch Managers (Branch-Scoped)
-- Branch managers can manage emergency assignments for their assigned branches
CREATE POLICY "Branch managers can manage emergency assignments for their branches"
  ON public.emergency_assignments
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'branch_manager')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'branch_manager'::public.app_role
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'branch_manager')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'branch_manager'::public.app_role
    )
  );

-- Policy 4: Dispensers (Own Assignments Only)
-- Dispensers can view and manage only their own emergency assignments
CREATE POLICY "Dispensers can manage their own emergency assignments"
  ON public.emergency_assignments
  FOR ALL
  USING (dispenser_id = auth.uid())
  WITH CHECK (dispenser_id = auth.uid());

-- Policy 5: Inventory Assistants (View Only, Branch-Scoped)
-- Inventory assistants can view emergency assignments for their assigned branches (read-only)
CREATE POLICY "Inventory assistants can view emergency assignments for their branches"
  ON public.emergency_assignments
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'inventory_assistant')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'inventory_assistant'::public.app_role
    )
  );

-- Policy 6: Inventory Assistants (Full Management, Branch-Scoped)
-- Inventory assistants can manage emergency assignments for their assigned branches
-- Note: This is separate from Policy 5 (view-only) to allow full CRUD operations
CREATE POLICY "Inventory assistants can manage emergency assignments for their branches"
  ON public.emergency_assignments
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'inventory_assistant')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'inventory_assistant'::public.app_role
    )
  );

CREATE POLICY "Inventory assistants can update emergency assignments for their branches"
  ON public.emergency_assignments
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'inventory_assistant')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'inventory_assistant'::public.app_role
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'inventory_assistant')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'inventory_assistant'::public.app_role
    )
  );

CREATE POLICY "Inventory assistants can delete emergency assignments for their branches"
  ON public.emergency_assignments
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'inventory_assistant')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'inventory_assistant'::public.app_role
    )
  );

-- Policy 7: Doctors (View Only, Branch-Scoped)
-- Doctors can view emergency assignments for their assigned branches (read-only)
-- This allows doctors to see what emergency stock items are being handled in their branch
CREATE POLICY "Doctors can view emergency assignments for their branches"
  ON public.emergency_assignments
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'doctor')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'doctor'::public.app_role
    )
  );

-- Policy 8: Admin Role (Legacy Support)
-- Support for 'admin' role (if still in use)
CREATE POLICY "Admins can manage emergency assignments"
  ON public.emergency_assignments
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'admin'::public.app_role
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'admin'::public.app_role
    )
  );

-- Add comment explaining the security model
COMMENT ON TABLE public.emergency_assignments IS 
'Emergency assignments are secured by branch isolation. 
- System admins and regional managers: Full access to all assignments
- Branch system admins, branch managers, inventory assistants: Full access to their branch assignments
- Dispensers: Full access to their own assignments only
- Doctors: View-only access to their branch assignments
- Admin role (legacy): Full access to their branch assignments';

