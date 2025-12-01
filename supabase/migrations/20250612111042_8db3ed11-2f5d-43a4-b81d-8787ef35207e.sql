
-- Enable Row Level Security on branch_performance table
ALTER TABLE public.branch_performance ENABLE ROW LEVEL SECURITY;

-- Create policies for branch_performance table based on user roles and branch access

-- Policy for system admins and regional managers to view all branch performance data
CREATE POLICY "System admins and regional managers can view all branch performance"
  ON public.branch_performance
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'system_admin') OR 
    public.has_role(auth.uid(), 'regional_manager')
  );

-- Policy for branch admins to view their own branch performance
CREATE POLICY "Branch admins can view their branch performance"
  ON public.branch_performance
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin', branch_id) OR
    public.has_role(auth.uid(), 'branch_system_admin', branch_id)
  );

-- Policy for system admins to insert branch performance data
CREATE POLICY "System admins can insert branch performance"
  ON public.branch_performance
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin')
  );

-- Policy for system admins to update branch performance data
CREATE POLICY "System admins can update branch performance"
  ON public.branch_performance
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'system_admin')
  );

-- Policy for system admins to delete branch performance data
CREATE POLICY "System admins can delete branch performance"
  ON public.branch_performance
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin')
  );
;
