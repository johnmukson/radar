
-- First, add the new administrative roles to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'system_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'branch_system_admin';
;
