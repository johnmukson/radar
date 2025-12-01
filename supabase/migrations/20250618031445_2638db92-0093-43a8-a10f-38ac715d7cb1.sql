
-- Fix permission issues on the users table
-- First, ensure RLS is enabled on the users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "System admins can manage all users" ON public.users;

-- Create proper RLS policies for the users table
CREATE POLICY "Users can view their own profile"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id);

-- System admins can view and manage all users
CREATE POLICY "System admins can view all users"
  ON public.users
  FOR SELECT
  USING (public.has_role(auth.uid(), 'system_admin'));

CREATE POLICY "System admins can manage all users"
  ON public.users
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin'));

-- Fix the user_roles table policies
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "System admins can manage all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "System admins can view all branches" ON public.branches;
DROP POLICY IF EXISTS "Branch system admins can manage their branch" ON public.branches;

-- Enable RLS on user_roles if not already enabled
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create proper policies for user_roles
CREATE POLICY "Users can view their own role"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System admins can manage all user roles"
  ON public.user_roles
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin'));

-- Fix branches table RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view branches"
  ON public.branches
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System admins can manage all branches"
  ON public.branches
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin'));

CREATE POLICY "Branch admins can view their branch"
  ON public.branches
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin', id) OR 
    public.has_role(auth.uid(), 'branch_system_admin', id)
  );

-- Fix stock_items RLS policies
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated users can view stock items" ON public.stock_items;
DROP POLICY IF EXISTS "System and branch system admins can manage stock items" ON public.stock_items;

CREATE POLICY "All authenticated users can view stock items"
  ON public.stock_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage stock items"
  ON public.stock_items
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'system_admin') OR 
    public.has_role(auth.uid(), 'regional_manager') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'branch_system_admin')
  );

-- Ensure the auth trigger for syncing users works properly
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.sync_auth_user_to_users();

-- Create a proper function to sync auth users to public users table
CREATE OR REPLACE FUNCTION public.sync_auth_user_to_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, username, name, phone, role, status, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'user', -- default role
    'active',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET
      username = COALESCE(EXCLUDED.username, users.username),
      name = COALESCE(EXCLUDED.name, users.name),
      phone = COALESCE(EXCLUDED.phone, users.phone),
      updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_to_users();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
;
