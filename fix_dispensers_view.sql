-- Fix Dispensers View and Data
-- This script will check and fix the dispensers display issue

-- 1. Check if users_with_roles view exists and has data
SELECT 
  'Checking users_with_roles view' as info,
  COUNT(*) as total_users,
  COUNT(CASE WHEN role = 'dispenser' THEN 1 END) as dispensers_count
FROM public.users_with_roles;

-- 2. Check individual users and their roles
SELECT 
  u.id,
  u.name,
  u.email,
  u.phone,
  ur.role,
  ur.branch_id,
  b.name as branch_name
FROM public.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
LEFT JOIN public.branches b ON ur.branch_id = b.id
ORDER BY u.name;

-- 3. Check the users_with_roles view definition
SELECT 
  schemaname,
  viewname,
  definition
FROM pg_views 
WHERE viewname = 'users_with_roles';

-- 4. If the view doesn't exist or is incorrect, recreate it
DROP VIEW IF EXISTS public.users_with_roles;

CREATE VIEW public.users_with_roles AS
SELECT 
  u.id as user_id,
  u.name,
  u.email,
  u.phone,
  u.status as user_status,
  ur.role,
  ur.branch_id,
  b.name as branch_name,
  u.created_at,
  u.updated_at
FROM public.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
LEFT JOIN public.branches b ON ur.branch_id = b.id;

-- 5. Grant permissions on the view
GRANT SELECT ON public.users_with_roles TO authenticated;
GRANT SELECT ON public.users_with_roles TO anon;

-- 6. Check dispensers specifically
SELECT 
  'Dispensers in users_with_roles view:' as info,
  COUNT(*) as dispensers_count
FROM public.users_with_roles
WHERE role = 'dispenser';

-- 7. Show all dispensers with their details
SELECT 
  user_id,
  name,
  email,
  phone,
  role,
  branch_name,
  user_status
FROM public.users_with_roles
WHERE role = 'dispenser'
ORDER BY name;

-- 8. If no dispensers found, check if we need to assign roles
SELECT 
  'Users without roles:' as info,
  COUNT(*) as users_without_roles
FROM public.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
WHERE ur.user_id IS NULL;

-- 9. Show users that might be dispensers but don't have roles assigned
SELECT 
  u.id,
  u.name,
  u.email,
  u.phone,
  'No role assigned' as role_status
FROM public.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
WHERE ur.user_id IS NULL
ORDER BY u.name;

-- 10. Create a test dispenser if none exist
INSERT INTO public.user_roles (user_id, role, created_at)
SELECT 
  u.id,
  'dispenser' as role,
  NOW() as created_at
FROM public.users u
WHERE u.email = 'johnmukson25@gmail.com'
AND NOT EXISTS (
  SELECT 1 FROM public.user_roles ur 
  WHERE ur.user_id = u.id AND ur.role = 'dispenser'
);

-- 11. Final check of dispensers
SELECT 
  'Final dispensers count:' as info,
  COUNT(*) as dispensers_count
FROM public.users_with_roles
WHERE role = 'dispenser';

-- 12. Show the final list of dispensers
SELECT 
  user_id,
  name,
  email,
  phone,
  role,
  branch_name
FROM public.users_with_roles
WHERE role = 'dispenser'
ORDER BY name; 