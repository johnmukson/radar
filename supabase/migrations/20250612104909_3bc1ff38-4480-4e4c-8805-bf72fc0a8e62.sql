
-- First, drop all policies that depend on the has_role function
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can insert stock items" ON public.stock_items;
DROP POLICY IF EXISTS "Only admins can update stock items" ON public.stock_items;
DROP POLICY IF EXISTS "Only admins can delete stock items" ON public.stock_items;
DROP POLICY IF EXISTS "Only admins can create emergency assignments" ON public.emergency_assignments;
DROP POLICY IF EXISTS "Only admins can update emergency assignments" ON public.emergency_assignments;
DROP POLICY IF EXISTS "Only admins can delete emergency assignments" ON public.emergency_assignments;
DROP POLICY IF EXISTS "Admin can manage all weekly tasks" ON public.weekly_tasks;
DROP POLICY IF EXISTS "Admin can manage all WhatsApp notifications" ON public.whatsapp_notifications;

-- Now drop the existing has_role function
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);

-- Create branches table to manage the 20 branches
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    region TEXT,
    manager_id UUID REFERENCES auth.users(id),
    address TEXT,
    phone TEXT,
    email TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add branch_id to user_roles table to associate roles with specific branches
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

-- Create the new has_role function with branch support
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role, _branch_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (branch_id = _branch_id OR _branch_id IS NULL OR role = 'regional_manager')
  )
$$;

-- Create branch performance tracking table
CREATE TABLE IF NOT EXISTS public.branch_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_stock_value NUMERIC DEFAULT 0,
    items_expired INTEGER DEFAULT 0,
    items_near_expiry INTEGER DEFAULT 0,
    emergency_assignments INTEGER DEFAULT 0,
    tasks_completed INTEGER DEFAULT 0,
    dispensers_active INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(branch_id, period_start, period_end)
);

-- Add branch_id to existing tables to make them branch-specific
ALTER TABLE public.stock_items 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

ALTER TABLE public.dispensers 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

-- Recreate the original policies with the new function signature
CREATE POLICY "Admins can manage all roles"
  ON public.user_roles
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can insert stock items"
  ON public.stock_items
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update stock items"
  ON public.stock_items
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete stock items"
  ON public.stock_items
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can create emergency assignments"
  ON public.emergency_assignments
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update emergency assignments"
  ON public.emergency_assignments
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete emergency assignments"
  ON public.emergency_assignments
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can manage all weekly tasks"
  ON public.weekly_tasks
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can manage all WhatsApp notifications"
  ON public.whatsapp_notifications
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Add new RLS policies for branch-based access
CREATE POLICY "Regional managers can view all branches"
  ON public.branches
  FOR SELECT
  USING (public.has_role(auth.uid(), 'regional_manager'));

CREATE POLICY "Branch managers can view their branch"
  ON public.branches
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin', id));

CREATE POLICY "Users can view their branch"
  ON public.branches
  FOR SELECT
  USING (public.has_role(auth.uid(), 'user', id));

-- Enable RLS on branches table
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Insert sample branches (you can modify these)
INSERT INTO public.branches (name, code, region) VALUES
('Main Branch', 'MB001', 'Central'),
('North Branch', 'NB002', 'North'),
('South Branch', 'SB003', 'South'),
('East Branch', 'EB004', 'East'),
('West Branch', 'WB005', 'West'),
('Downtown Branch', 'DB006', 'Central'),
('Airport Branch', 'AB007', 'Central'),
('Mall Branch', 'ML008', 'Central'),
('University Branch', 'UB009', 'North'),
('Hospital Branch', 'HB010', 'South'),
('Industrial Branch', 'IB011', 'East'),
('Coastal Branch', 'CB012', 'West'),
('Mountain Branch', 'MT013', 'North'),
('Valley Branch', 'VB014', 'South'),
('Plaza Branch', 'PB015', 'East'),
('Garden Branch', 'GB016', 'West'),
('Station Branch', 'ST017', 'Central'),
('Market Branch', 'MK018', 'North'),
('Bridge Branch', 'BR019', 'South'),
('Tower Branch', 'TB020', 'East')
ON CONFLICT (code) DO NOTHING;
;
