-- Promote johnmukson25@gmail.com to system administrator
-- This script will update the user's role in the user_roles table

-- First, let's find the user ID for johnmukson25@gmail.com
SELECT 
  u.id,
  u.name,
  u.email,
  u.phone,
  ur.role as current_role
FROM public.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
WHERE u.email = 'johnmukson25@gmail.com';

-- Update the user's role to system_admin
-- First, remove any existing roles
DELETE FROM public.user_roles 
WHERE user_id = (
  SELECT id FROM public.users WHERE email = 'johnmukson25@gmail.com'
);

-- Then insert the system_admin role
INSERT INTO public.user_roles (user_id, role, created_at)
SELECT 
  id,
  'system_admin',
  NOW()
FROM public.users 
WHERE email = 'johnmukson25@gmail.com';

-- Verify the change
SELECT 
  u.id,
  u.name,
  u.email,
  u.phone,
  array_agg(ur.role) as roles
FROM public.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
WHERE u.email = 'johnmukson25@gmail.com'
GROUP BY u.id, u.name, u.email, u.phone;

-- Show all users with their roles for verification
SELECT 
  u.id,
  u.name,
  u.email,
  u.phone,
  array_agg(ur.role) as roles
FROM public.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
GROUP BY u.id, u.name, u.email, u.phone
ORDER BY u.name; 