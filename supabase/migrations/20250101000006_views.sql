-- Migration: Views
-- Description: Create views for commonly accessed data

-- 4.10 Users-with-roles view
-- The front-end frequently needs a list of users together with their assigned role and branch name
-- NOTE: This view will be updated in a later migration to use public.users table
-- For now, this is a placeholder that will be replaced by 20250109000000_fix_frontend_backend_sync.sql
CREATE OR REPLACE VIEW public.users_with_roles AS
SELECT
  u.id AS user_id,
  COALESCE(u.raw_user_meta_data->>'name', u.email) AS name,
  u.email,
  u.raw_user_meta_data->>'phone' AS phone,
  'active'::text AS status,
  ur.role,
  ur.branch_id,
  b.name AS branch_name,
  b.code AS branch_code
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
LEFT JOIN public.branches b ON b.id = ur.branch_id;

