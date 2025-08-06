-- Migration: Consolidate dispensers table into users table with role-based filtering
-- Date: 2025-06-13
-- Description: This migration removes the dispensers table and uses user_roles for dispenser management

-- ============================================================================
-- STEP 1: Update foreign keys to reference users table instead of dispensers
-- ============================================================================

-- Update stock_items.assigned_to to reference users table
ALTER TABLE public.stock_items 
DROP CONSTRAINT IF EXISTS stock_items_assigned_to_fkey;

ALTER TABLE public.stock_items 
ADD CONSTRAINT stock_items_assigned_to_fkey 
FOREIGN KEY (assigned_to) REFERENCES auth.users(id);

-- Update emergency_assignments.dispenser_id to reference users table
ALTER TABLE public.emergency_assignments 
DROP CONSTRAINT IF EXISTS emergency_assignments_dispenser_id_fkey;

ALTER TABLE public.emergency_assignments 
ADD CONSTRAINT emergency_assignments_dispenser_id_fkey 
FOREIGN KEY (dispenser_id) REFERENCES auth.users(id);

-- Update weekly_tasks.assigned_to to reference users table  
ALTER TABLE public.weekly_tasks 
DROP CONSTRAINT IF EXISTS weekly_tasks_assigned_to_fkey;

ALTER TABLE public.weekly_tasks 
ADD CONSTRAINT weekly_tasks_assigned_to_fkey 
FOREIGN KEY (assigned_to) REFERENCES auth.users(id);

-- Update stock_movement_history.for_dispenser to reference users table
ALTER TABLE public.stock_movement_history 
DROP CONSTRAINT IF EXISTS stock_movement_history_for_dispenser_fkey;

ALTER TABLE public.stock_movement_history 
ADD CONSTRAINT stock_movement_history_for_dispenser_fkey 
FOREIGN KEY (for_dispenser) REFERENCES auth.users(id);

-- ============================================================================
-- STEP 2: Drop old dispensers table and related objects
-- ============================================================================

-- Drop views that depend on dispensers table
DROP VIEW IF EXISTS public.dispenser_management_view CASCADE;

-- Drop triggers on dispensers table
DROP TRIGGER IF EXISTS calculate_performance_trigger ON public.dispensers;
DROP TRIGGER IF EXISTS update_dispensers_updated_at ON public.dispensers;

-- Drop any triggers that might reference dispensers table
DROP TRIGGER IF EXISTS create_dispenser_on_user_insert ON public.users;
DROP TRIGGER IF EXISTS sync_user_to_dispenser ON public.users;
DROP TRIGGER IF EXISTS update_dispenser_on_user_update ON public.users;

-- Drop functions related to dispensers
DROP FUNCTION IF EXISTS public.calculate_dispenser_performance() CASCADE;
DROP FUNCTION IF EXISTS public.create_dispenser_on_user_insert() CASCADE;
DROP FUNCTION IF EXISTS public.sync_user_to_dispenser() CASCADE;
DROP FUNCTION IF EXISTS public.update_dispenser_on_user_update() CASCADE;

-- Finally drop the dispensers table
DROP TABLE IF EXISTS public.dispensers CASCADE;

-- ============================================================================
-- STEP 3: Ensure user_roles table has proper structure for dispensers
-- ============================================================================

-- Drop the unique constraint on user_id if it exists (to allow multiple roles per user)
ALTER TABLE public.user_roles 
DROP CONSTRAINT IF EXISTS user_roles_user_id_unique;

-- Add branch_id column to user_roles if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_roles' AND column_name = 'branch_id') THEN
        ALTER TABLE public.user_roles ADD COLUMN branch_id UUID REFERENCES public.branches(id);
    END IF;
END $$;

-- Add phone column to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone') THEN
        ALTER TABLE public.users ADD COLUMN phone TEXT;
    END IF;
END $$;

-- Make password column nullable if it's not already (since we're syncing from auth.users)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password' AND is_nullable = 'NO') THEN
        ALTER TABLE public.users ALTER COLUMN password DROP NOT NULL;
    END IF;
END $$;

-- ============================================================================
-- STEP 4: Create comprehensive view for dispensers
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
WHERE ur.role IN ('dispenser', 'admin', 'system_admin', 'branch_system_admin')
ORDER BY u.name;

-- ============================================================================
-- STEP 5: Create performance calculation function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_dispenser_performance(user_id UUID)
RETURNS NUMERIC
LANGUAGE SQL
STABLE
AS $$
    SELECT COALESCE(
        (SELECT 
            CASE 
                WHEN COUNT(*) = 0 THEN 0
                ELSE (COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / COUNT(*)::NUMERIC) * 100
            END
        FROM public.stock_items 
        WHERE assigned_to = user_id), 0
    );
$$;

-- ============================================================================
-- STEP 6: Create sync function for auth.users to users table
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
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
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

  -- Insert role into user_roles table if it's a dispenser-related role
  IF COALESCE(NEW.raw_user_meta_data->>'role', 'user') IN ('dispenser', 'admin', 'system_admin', 'branch_system_admin') THEN
    INSERT INTO public.user_roles (user_id, role, created_at)
    VALUES (
      NEW.id, 
      COALESCE(NEW.raw_user_meta_data->>'role', 'user')::app_role,
      NOW()
    )
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- STEP 7: Create trigger for automatic sync
-- ============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_to_users();

-- ============================================================================
-- STEP 8: Backfill existing auth.users data to users table (carefully)
-- ============================================================================

-- Only insert auth.users that don't already exist in public.users (by ID or username)
INSERT INTO public.users (id, username, name, phone, role, status, created_at, updated_at)
SELECT 
  au.id,
  COALESCE(au.email, ''),
  COALESCE(au.raw_user_meta_data->>'name', au.email, 'User'),
  COALESCE(au.raw_user_meta_data->>'phone', ''),
  COALESCE(au.raw_user_meta_data->>'role', 'user'),
  CASE WHEN au.email_confirmed_at IS NOT NULL THEN 'active' ELSE 'inactive' END,
  COALESCE(au.created_at, NOW()),
  NOW()
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u WHERE u.id = au.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.users u WHERE u.username = COALESCE(au.email, '')
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- STEP 9: Backfill roles to user_roles table
-- ============================================================================

INSERT INTO public.user_roles (user_id, role, created_at)
SELECT 
  au.id,
  COALESCE(au.raw_user_meta_data->>'role', 'user')::app_role,
  NOW()
FROM auth.users au
WHERE COALESCE(au.raw_user_meta_data->>'role', 'user') IN ('dispenser', 'admin', 'system_admin', 'branch_system_admin', 'user')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = au.id AND ur.role = COALESCE(au.raw_user_meta_data->>'role', 'user')::app_role
  )
ON CONFLICT (user_id, role) DO NOTHING;

-- ============================================================================
-- STEP 10: Set up RLS and permissions for the view
-- ============================================================================

-- Enable security barrier for the view
ALTER VIEW public.dispensers_view SET (security_barrier = true);

-- Grant appropriate permissions
GRANT SELECT ON public.dispensers_view TO authenticated;
GRANT SELECT ON public.dispensers_view TO anon;

-- ============================================================================
-- STEP 11: Create indexes for performance
-- ============================================================================

-- Index for stock_items performance calculation
CREATE INDEX IF NOT EXISTS idx_stock_items_assigned_to_status 
ON public.stock_items(assigned_to, status);

-- Index for user_roles filtering
CREATE INDEX IF NOT EXISTS idx_user_roles_role 
ON public.user_roles(role);

-- Index for user_roles user_id
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id 
ON public.user_roles(user_id);

-- ============================================================================
-- STEP 12: Add comments for documentation
-- ============================================================================

COMMENT ON VIEW public.dispensers_view IS 'Comprehensive view of dispensers with performance metrics, combining users, roles, and branches';
COMMENT ON FUNCTION public.get_dispenser_performance(UUID) IS 'Calculate performance score for a dispenser based on completed stock items';
COMMENT ON FUNCTION public.sync_auth_user_to_users() IS 'Sync auth.users data to public.users and user_roles tables';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify the migration
DO $$
BEGIN
    -- Check if view exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'dispensers_view') THEN
        RAISE EXCEPTION 'dispensers_view was not created successfully';
    END IF;
    
    -- Check if trigger exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'on_auth_user_created') THEN
        RAISE EXCEPTION 'on_auth_user_created trigger was not created successfully';
    END IF;
    
    RAISE NOTICE 'Migration completed successfully!';
END $$; 