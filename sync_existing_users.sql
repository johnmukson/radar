-- Simple script to sync existing users from auth.users to public.users
-- Run this first to sync existing users

-- Sync existing users from auth.users to public.users
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

-- Assign default roles to users who don't have any
INSERT INTO public.user_roles (user_id, role, created_at)
SELECT 
  u.id,
  'dispenser' as role,
  NOW() as created_at
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id
);

-- Show results
SELECT 'Sync completed!' as status;
SELECT 'Auth users:' as info, COUNT(*) as count FROM auth.users
UNION ALL
SELECT 'Public users:', COUNT(*) FROM public.users
UNION ALL
SELECT 'User roles:', COUNT(*) FROM public.user_roles;

-- Show synced users
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