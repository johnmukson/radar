-- Fix RLS policy for stock_movement_history to allow dispensers to insert movement records
-- This resolves the "Partial Success" issue where stock updates work but movement history fails

-- Drop the restrictive admin-only insert policy
DROP POLICY IF EXISTS "Admins can insert stock movements" ON public.stock_movement_history;

-- Create a new policy that allows authenticated users to insert movement records
-- This enables dispensers to record their own stock adjustments
CREATE POLICY "Authenticated users can insert stock movements" 
  ON public.stock_movement_history 
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);

-- Also update the update policy to be more permissive for movement records
DROP POLICY IF EXISTS "Admins can update stock movements" ON public.stock_movement_history;

CREATE POLICY "Users can update their own movement records" 
  ON public.stock_movement_history 
  FOR UPDATE 
  TO authenticated
  USING (
    moved_by = auth.uid() OR 
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'system_admin') OR
    public.has_role(auth.uid(), 'regional_manager')
  );

-- Keep the delete policy as admin-only for data integrity
-- (No changes needed to the delete policy) 