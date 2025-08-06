-- Migration: Fix roles - Remove 'user' and 'dispenser' options
-- Date: 2025-06-13
-- Description: This migration removes the 'user' and 'dispenser' roles from the system

-- ============================================================================
-- STEP 1: Remove 'user' and 'dispenser' roles from user_roles table
-- ============================================================================

-- Delete all user and dispenser role assignments
DELETE FROM public.user_roles 
WHERE role IN ('user', 'dispenser');

-- ============================================================================
-- STEP 2: Update the app_role enum to remove 'user' and 'dispenser'
-- ============================================================================

-- Create a new enum without 'user' and 'dispenser'
CREATE TYPE public.app_role_new AS ENUM (
    'admin',
    'regional_manager', 
    'system_admin',
    'branch_system_admin'
);

-- Update the user_roles table to use the new enum
ALTER TABLE public.user_roles 
ALTER COLUMN role TYPE public.app_role_new 
USING role::text::public.app_role_new;

-- Drop the old enum
DROP TYPE public.app_role;

-- Rename the new enum to the original name
ALTER TYPE public.app_role_new RENAME TO app_role;

-- ============================================================================
-- STEP 3: Update the sync function to remove user and dispenser handling
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_auth_user_to_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert or update in users table
  INSERT INTO public.users (id, username, name, phone, role, status, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'admin'),
    CASE WHEN NEW.email_confirmed_at IS NOT NULL THEN 'active' ELSE 'inactive' END,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET
      username = COALESCE(EXCLUDED.username, users.username),
      name = COALESCE(EXCLUDED.name, users.name),
      phone = COALESCE(EXCLUDED.phone, users.phone),
      role = COALESCE(EXCLUDED.role, users.role),
      status = EXCLUDED.status,
      updated_at = NOW();

  -- Insert role into user_roles table for admin-related roles only
  IF COALESCE(NEW.raw_user_meta_data->>'role', 'admin') IN ('admin', 'system_admin', 'branch_system_admin', 'regional_manager') THEN
    INSERT INTO public.user_roles (user_id, role, created_at)
    VALUES (
      NEW.id, 
      COALESCE(NEW.raw_user_meta_data->>'role', 'admin')::app_role,
      NOW()
    )
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- STEP 4: Update the assign_user_role function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assign_user_role(
    p_user_id UUID,
    p_role app_role,
    p_branch_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- First, ensure the user exists in the users table
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
        -- Try to sync from auth.users
        INSERT INTO public.users (id, username, name, phone, role, status, created_at, updated_at)
        SELECT 
            au.id,
            COALESCE(au.email, ''),
            COALESCE(au.raw_user_meta_data->>'name', au.email, 'Admin User'),
            COALESCE(au.raw_user_meta_data->>'phone', ''),
            COALESCE(au.raw_user_meta_data->>'role', 'admin'),
            CASE WHEN au.email_confirmed_at IS NOT NULL THEN 'active' ELSE 'inactive' END,
            COALESCE(au.created_at, NOW()),
            NOW()
        FROM auth.users au
        WHERE au.id = p_user_id
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Now assign the role
    INSERT INTO public.user_roles (user_id, role, branch_id, created_at)
    VALUES (p_user_id, p_role, p_branch_id, NOW())
    ON CONFLICT (user_id, role) 
    DO UPDATE SET 
        branch_id = COALESCE(EXCLUDED.branch_id, user_roles.branch_id),
        created_at = NOW();

    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error assigning role: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- ============================================================================
-- STEP 5: Update the dispensers_view to only show admin users
-- ============================================================================

CREATE OR REPLACE VIEW public.dispensers_view AS
SELECT DISTINCT
    u.id,
    u.name as dispenser,
    u.phone,
    u.username as email,
    b.name as branch,
    u.status,
    ur.role,
    ur.branch_id,
    u.created_at,
    u.updated_at,
    -- Calculate performance score based on completed stock items
    COALESCE(
        (SELECT 
            CASE 
                WHEN COUNT(*) = 0 THEN 0
                ELSE (COUNT(*) FILTER (WHERE si.status = 'completed')::NUMERIC / COUNT(*)::NUMERIC) * 100
            END
        FROM public.stock_items si 
        WHERE si.assigned_to = u.id), 0
    ) as performance_score
FROM public.users u
INNER JOIN public.user_roles ur ON u.id = ur.user_id
LEFT JOIN public.branches b ON ur.branch_id = b.id
WHERE ur.role IN ('admin', 'system_admin', 'branch_system_admin')
ORDER BY u.name;

-- ============================================================================
-- STEP 6: Update types file reference (for frontend)
-- ============================================================================

-- Update the types.ts file to reflect the new enum values
-- This will be done in the frontend types file

-- ============================================================================
-- STEP 7: Clean up any remaining references
-- ============================================================================

-- Update any users that might have 'user' or 'dispenser' role to 'admin'
UPDATE public.users 
SET role = 'admin' 
WHERE role IN ('user', 'dispenser');

-- ============================================================================
-- STEP 8: Verify the changes
-- ============================================================================

DO $$
BEGIN
    -- Check that no user or dispenser roles remain
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE role IN ('user', 'dispenser')) THEN
        RAISE EXCEPTION 'User or dispenser roles still exist in user_roles table';
    END IF;
    
    -- Check that the enum only contains admin roles
    IF EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumtypid = 'public.app_role'::regtype 
        AND enumlabel IN ('user', 'dispenser')
    ) THEN
        RAISE EXCEPTION 'User or dispenser still exist in app_role enum';
    END IF;
    
    RAISE NOTICE 'Successfully removed user and dispenser roles!';
    RAISE NOTICE 'Available roles: admin, regional_manager, system_admin, branch_system_admin';
END $$; 