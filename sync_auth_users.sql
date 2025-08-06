-- Sync auth.users to public.users table
-- This script sets up automatic synchronization between auth.users and public.users

-- 1. Create the function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, phone, status, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    'active',
    NEW.created_at,
    NEW.updated_at
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the trigger to automatically sync new users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Sync existing users from auth.users to public.users
INSERT INTO public.users (id, name, email, phone, status, created_at, updated_at)
SELECT 
  au.id,
  COALESCE(au.raw_user_meta_data->>'name', au.email) as name,
  au.email,
  COALESCE(au.raw_user_meta_data->>'phone', NULL) as phone,
  'active' as status,
  au.created_at,
  au.updated_at
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.id = au.id
);

-- 4. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.user_roles TO authenticated;

-- 5. Create a function to update user roles
CREATE OR REPLACE FUNCTION public.assign_default_role(user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Insert default role if user doesn't have any roles
  INSERT INTO public.user_roles (user_id, role, created_at)
  VALUES (user_id, 'dispenser', NOW())
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Update the handle_new_user function to also assign default role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into public.users
  INSERT INTO public.users (id, name, email, phone, status, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    'active',
    NEW.created_at,
    NEW.updated_at
  );
  
  -- Assign default role
  PERFORM public.assign_default_role(NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Verify the setup
SELECT 'Auth users count:' as info, COUNT(*) as count FROM auth.users
UNION ALL
SELECT 'Public users count:', COUNT(*) FROM public.users
UNION ALL
SELECT 'User roles count:', COUNT(*) FROM public.user_roles;

-- 8. Show current users
SELECT 
  u.id,
  u.name,
  u.email,
  u.phone,
  u.status,
  array_agg(ur.role) as roles
FROM public.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
GROUP BY u.id, u.name, u.email, u.phone, u.status
ORDER BY u.created_at DESC; 