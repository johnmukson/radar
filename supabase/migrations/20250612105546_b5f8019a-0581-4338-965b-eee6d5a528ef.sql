
-- Update the has_role function to handle system admin's extreme control
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role, _branch_id uuid DEFAULT NULL::uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        -- System admin has access to everything
        role = 'system_admin' OR
        -- Exact role match with branch consideration
        (role = _role AND (branch_id = _branch_id OR _branch_id IS NULL OR role IN ('regional_manager', 'system_admin')))
      )
  )
$$;

-- Add new RLS policies for system admin access
CREATE POLICY "System admins can manage all user roles"
  ON public.user_roles
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin'));

CREATE POLICY "System admins can view all branches"
  ON public.branches
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin'));

CREATE POLICY "Branch system admins can manage their branch"
  ON public.branches
  FOR ALL
  USING (public.has_role(auth.uid(), 'branch_system_admin', id));

-- Update stock items policies for new admin roles
CREATE POLICY "System and branch system admins can manage stock items"
  ON public.stock_items
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'system_admin') OR 
    public.has_role(auth.uid(), 'branch_system_admin', branch_id)
  );
;
