-- Migration: Update RLS policies for doctor role
-- Date: 2025-06-13
-- Description: Update RLS policies to allow doctors to view everything but not modify data

-- ============================================================================
-- STEP 1: Update stock_items RLS policies to allow doctors to view everything
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view stock items" ON public.stock_items;
DROP POLICY IF EXISTS "Users can update assigned stock items" ON public.stock_items;
DROP POLICY IF EXISTS "Admins can manage all stock items" ON public.stock_items;

-- Create new policies that allow doctors to view everything
CREATE POLICY "All authenticated users can view stock items" 
  ON public.stock_items 
  FOR SELECT 
  TO authenticated
  USING (true);

-- Only users with write access can update stock items
CREATE POLICY "Users with write access can update stock items" 
  ON public.stock_items 
  FOR UPDATE 
  TO authenticated
  USING (public.has_write_access(auth.uid(), branch_id));

-- Only users with write access can insert stock items
CREATE POLICY "Users with write access can insert stock items" 
  ON public.stock_items 
  FOR INSERT 
  TO authenticated
  WITH CHECK (public.has_write_access(auth.uid(), branch_id));

-- Only users with write access can delete stock items
CREATE POLICY "Users with write access can delete stock items" 
  ON public.stock_items 
  FOR DELETE 
  TO authenticated
  USING (public.has_write_access(auth.uid(), branch_id));

-- ============================================================================
-- STEP 2: Update stock_movement_history RLS policies
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "All authenticated users can view stock movements" ON public.stock_movement_history;
DROP POLICY IF EXISTS "Authenticated users can insert stock movements" ON public.stock_movement_history;
DROP POLICY IF EXISTS "Users can update their own movement records" ON public.stock_movement_history;
DROP POLICY IF EXISTS "Admins can delete stock movements" ON public.stock_movement_history;

-- Create new policies
CREATE POLICY "All authenticated users can view stock movements" 
  ON public.stock_movement_history 
  FOR SELECT 
  TO authenticated
  USING (true);

-- Only users with write access can insert movement records
CREATE POLICY "Users with write access can insert stock movements" 
  ON public.stock_movement_history 
  FOR INSERT 
  TO authenticated
  WITH CHECK (public.has_write_access(auth.uid()));

-- Only users with write access can update movement records
CREATE POLICY "Users with write access can update stock movements" 
  ON public.stock_movement_history 
  FOR UPDATE 
  TO authenticated
  USING (public.has_write_access(auth.uid()));

-- Only users with write access can delete movement records
CREATE POLICY "Users with write access can delete stock movements" 
  ON public.stock_movement_history 
  FOR DELETE 
  TO authenticated
  USING (public.has_write_access(auth.uid()));

-- ============================================================================
-- STEP 3: Update other table policies to allow doctors to view everything
-- ============================================================================

-- Update branches table policies
DROP POLICY IF EXISTS "Users can view branches" ON public.branches;
CREATE POLICY "All authenticated users can view branches" 
  ON public.branches 
  FOR SELECT 
  TO authenticated
  USING (true);

-- Update users table policies
DROP POLICY IF EXISTS "Users can view users" ON public.users;
CREATE POLICY "All authenticated users can view users" 
  ON public.users 
  FOR SELECT 
  TO authenticated
  USING (true);

-- Update user_roles table policies
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "All authenticated users can view user roles" 
  ON public.user_roles 
  FOR SELECT 
  TO authenticated
  USING (true);

-- Update weekly_tasks table policies
DROP POLICY IF EXISTS "Users can view weekly tasks" ON public.weekly_tasks;
CREATE POLICY "All authenticated users can view weekly tasks" 
  ON public.weekly_tasks 
  FOR SELECT 
  TO authenticated
  USING (true);

-- Update emergency_assignments table policies
DROP POLICY IF EXISTS "Users can view emergency assignments" ON public.emergency_assignments;
CREATE POLICY "All authenticated users can view emergency assignments" 
  ON public.emergency_assignments 
  FOR SELECT 
  TO authenticated
  USING (true);

-- Update notifications table policies
DROP POLICY IF EXISTS "Users can view notifications" ON public.notifications;
CREATE POLICY "All authenticated users can view notifications" 
  ON public.notifications 
  FOR SELECT 
  TO authenticated
  USING (true);

-- Update whatsapp_notifications table policies
DROP POLICY IF EXISTS "Users can view whatsapp notifications" ON public.whatsapp_notifications;
CREATE POLICY "All authenticated users can view whatsapp notifications" 
  ON public.whatsapp_notifications 
  FOR SELECT 
  TO authenticated
  USING (true);

-- Update branch_performance table policies
DROP POLICY IF EXISTS "Users can view branch performance" ON public.branch_performance;
CREATE POLICY "All authenticated users can view branch performance" 
  ON public.branch_performance 
  FOR SELECT 
  TO authenticated
  USING (true); 