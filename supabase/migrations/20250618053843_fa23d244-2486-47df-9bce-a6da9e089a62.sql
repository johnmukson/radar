
-- First, let's disable RLS temporarily to clear any cached policies
ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "System admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "System admins can insert any roles" ON public.user_roles;
DROP POLICY IF EXISTS "System admins can update all roles" ON public.user_roles;
DROP POLICY IF EXISTS "System admins can delete all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can view stock items" ON public.stock_items;
DROP POLICY IF EXISTS "System admins can manage stock items" ON public.stock_items;

-- Drop the problematic function
DROP FUNCTION IF EXISTS public.get_user_role_for_policy(uuid);

-- Create a simpler, non-recursive function that bypasses RLS entirely
CREATE OR REPLACE FUNCTION public.check_user_role(user_uuid uuid, role_to_check text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = user_uuid AND role::text = role_to_check
  );
$$;

-- Re-enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies for user_roles
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "System admins can view all roles"
ON public.user_roles
FOR SELECT
USING (public.check_user_role(auth.uid(), 'system_admin'));

CREATE POLICY "Users can insert own roles"
ON public.user_roles
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "System admins can manage all roles"
ON public.user_roles
FOR ALL
USING (public.check_user_role(auth.uid(), 'system_admin'));

-- Create policies for stock_items
CREATE POLICY "All authenticated users can view stock items"
ON public.stock_items
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "System admins can manage stock items"
ON public.stock_items
FOR ALL
TO authenticated
USING (public.check_user_role(auth.uid(), 'system_admin'));

-- Ensure the system admin role exists for johnson123mukwaya@gmail.com
DO $$
DECLARE
    user_uuid uuid;
BEGIN
    SELECT id INTO user_uuid 
    FROM auth.users 
    WHERE email = 'johnson123mukwaya@gmail.com';
    
    IF user_uuid IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role, created_at)
        VALUES (user_uuid, 'system_admin', NOW())
        ON CONFLICT (user_id, role) DO NOTHING;
        
        RAISE NOTICE 'System admin role confirmed for johnson123mukwaya@gmail.com';
    ELSE
        RAISE NOTICE 'User johnson123mukwaya@gmail.com not found';
    END IF;
END $$;
;
