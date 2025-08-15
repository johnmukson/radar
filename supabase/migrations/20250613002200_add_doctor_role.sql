-- Migration: Add doctor role to app_role enum
-- Date: 2025-06-13
-- Description: This migration adds the 'doctor' value to the app_role enum
-- Doctors can view everything but cannot modify data

-- Add doctor value to app_role enum if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype AND enumlabel = 'doctor') THEN
        ALTER TYPE public.app_role ADD VALUE 'doctor';
    END IF;
END $$;

-- Update the has_role function to handle doctors
-- Doctors have read-only access to everything
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role, _branch_id uuid DEFAULT NULL) 
RETURNS boolean 
LANGUAGE sql 
STABLE SECURITY DEFINER AS $$ 
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND (
      role = 'system_admin' 
      OR role = 'regional_manager' 
      OR role = 'doctor'  -- Doctors can access everything in read-only mode
      OR (role = _role AND (branch_id = _branch_id OR _branch_id IS NULL OR role IN ('regional_manager', 'system_admin')))
    )
  ) 
$$;

-- Create a new function to check if user has write access
CREATE OR REPLACE FUNCTION public.has_write_access(_user_id uuid, _branch_id uuid DEFAULT NULL) 
RETURNS boolean 
LANGUAGE sql 
STABLE SECURITY DEFINER AS $$ 
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND role IN ('admin', 'system_admin', 'regional_manager', 'branch_system_admin')
    AND (branch_id = _branch_id OR _branch_id IS NULL OR role IN ('regional_manager', 'system_admin'))
  ) 
$$; 