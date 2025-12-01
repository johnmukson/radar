-- Migration: Views
-- Description: Create views for commonly accessed data

-- 4.10 Users-with-roles view
-- The front-end frequently needs a list of users together with their assigned role and branch name
CREATE OR REPLACE VIEW public.users_with_roles AS
SELECT
  u.id AS user_id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'name', u.email) AS name,
  ur.role,
  ur.branch_id,
  b.name AS branch_name,
  b.code AS branch_code
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
LEFT JOIN public.branches b ON b.id = ur.branch_id;

