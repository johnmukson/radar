
-- First, let's drop any existing problematic policies on user_roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can update their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can delete their own roles" ON public.user_roles;

-- Create a security definer function to check user roles without recursion
CREATE OR REPLACE FUNCTION public.get_user_role_for_policy(check_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role::text FROM public.user_roles WHERE user_id = check_user_id LIMIT 1;
$$;

-- Create safe RLS policies for user_roles table
CREATE POLICY "Users can view their own roles" 
ON public.user_roles 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "System admins can view all roles" 
ON public.user_roles 
FOR SELECT 
USING (public.get_user_role_for_policy(auth.uid()) = 'system_admin');

CREATE POLICY "Users can insert their own roles" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "System admins can insert any roles" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (public.get_user_role_for_policy(auth.uid()) = 'system_admin');

CREATE POLICY "System admins can update all roles" 
ON public.user_roles 
FOR UPDATE 
USING (public.get_user_role_for_policy(auth.uid()) = 'system_admin');

CREATE POLICY "System admins can delete all roles" 
ON public.user_roles 
FOR DELETE 
USING (public.get_user_role_for_policy(auth.uid()) = 'system_admin');

-- Add basic RLS policies for stock_items table
CREATE POLICY "Authenticated users can view stock items" 
ON public.stock_items 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "System admins can manage stock items" 
ON public.stock_items 
FOR ALL 
TO authenticated 
USING (public.get_user_role_for_policy(auth.uid()) = 'system_admin');

-- Find and assign system_admin role to johnson123mukwaya@gmail.com
DO $$
DECLARE
    user_uuid uuid;
BEGIN
    -- Find the user ID for johnson123mukwaya@gmail.com
    SELECT id INTO user_uuid 
    FROM auth.users 
    WHERE email = 'johnson123mukwaya@gmail.com';
    
    IF user_uuid IS NOT NULL THEN
        -- Insert the system_admin role
        INSERT INTO public.user_roles (user_id, role, created_at)
        VALUES (user_uuid, 'system_admin', NOW())
        ON CONFLICT (user_id, role) DO NOTHING;
        
        RAISE NOTICE 'System admin role assigned to johnson123mukwaya@gmail.com';
    ELSE
        RAISE NOTICE 'User johnson123mukwaya@gmail.com not found in auth.users';
    END IF;
END $$;
;
