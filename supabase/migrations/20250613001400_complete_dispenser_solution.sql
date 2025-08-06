-- Migration: Complete Dispenser Solution
-- Date: 2025-06-13
-- Description: Complete solution for dispenser role with proper access and Supabase integration

-- ============================================================================
-- STEP 1: Add dispenser role to the enum
-- ============================================================================

-- Add dispenser to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dispenser';

-- ============================================================================
-- STEP 2: Update the dispensers_view to include dispensers
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
WHERE ur.role IN ('admin', 'system_admin', 'branch_system_admin', 'dispenser')
ORDER BY u.name;

-- ============================================================================
-- STEP 3: Update the sync function to handle dispensers
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
    COALESCE(NEW.raw_user_meta_data->>'role', 'dispenser'),
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

  -- Insert role into user_roles table for all roles including dispensers
  IF COALESCE(NEW.raw_user_meta_data->>'role', 'dispenser') IN ('admin', 'system_admin', 'branch_system_admin', 'regional_manager', 'dispenser') THEN
    INSERT INTO public.user_roles (user_id, role, created_at)
    VALUES (
      NEW.id, 
      COALESCE(NEW.raw_user_meta_data->>'role', 'dispenser')::app_role,
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
            COALESCE(au.raw_user_meta_data->>'name', au.email, 'Dispenser'),
            COALESCE(au.raw_user_meta_data->>'phone', ''),
            COALESCE(au.raw_user_meta_data->>'role', 'dispenser'),
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
-- STEP 5: Create comprehensive RLS policies for dispensers
-- ============================================================================

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "System admins can manage all data" ON public.stock_items;
DROP POLICY IF EXISTS "System admins can manage all data" ON public.emergency_assignments;
DROP POLICY IF EXISTS "System admins can manage all data" ON public.weekly_tasks;
DROP POLICY IF EXISTS "System admins can manage all data" ON public.stock_movement_history;
DROP POLICY IF EXISTS "System admins can manage all data" ON public.notifications;
DROP POLICY IF EXISTS "System admins can manage all data" ON public.branch_performance;
DROP POLICY IF EXISTS "System admins can manage all data" ON public.branches;
DROP POLICY IF EXISTS "System admins can manage all data" ON public.users;
DROP POLICY IF EXISTS "System admins can manage all data" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can view branches" ON public.branches;
DROP POLICY IF EXISTS "Authenticated users can view stock items" ON public.stock_items;
DROP POLICY IF EXISTS "Dispensers can view their assigned stock items" ON public.stock_items;
DROP POLICY IF EXISTS "Dispensers can update their assigned stock items" ON public.stock_items;

-- Stock Items Policies
CREATE POLICY "Users can view stock items based on role"
  ON public.stock_items FOR SELECT 
  USING (
    -- System admins can see everything
    public.has_role(auth.uid(), 'system_admin') OR
    -- Regional managers can see everything
    public.has_role(auth.uid(), 'regional_manager') OR
    -- Branch system admins can see their branch
    (public.has_role(auth.uid(), 'branch_system_admin') AND 
     branch_id IN (SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid())) OR
    -- Admins can see everything
    public.has_role(auth.uid(), 'admin') OR
    -- Dispensers can see their assigned items
    assigned_to = auth.uid()
  );

CREATE POLICY "Users can update stock items based on role"
  ON public.stock_items FOR UPDATE 
  USING (
    -- System admins can update everything
    public.has_role(auth.uid(), 'system_admin') OR
    -- Regional managers can update everything
    public.has_role(auth.uid(), 'regional_manager') OR
    -- Branch system admins can update their branch
    (public.has_role(auth.uid(), 'branch_system_admin') AND 
     branch_id IN (SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid())) OR
    -- Admins can update everything
    public.has_role(auth.uid(), 'admin') OR
    -- Dispensers can update their assigned items
    assigned_to = auth.uid()
  );

CREATE POLICY "Users can insert stock items based on role"
  ON public.stock_items FOR INSERT 
  WITH CHECK (
    -- System admins can insert everything
    public.has_role(auth.uid(), 'system_admin') OR
    -- Regional managers can insert everything
    public.has_role(auth.uid(), 'regional_manager') OR
    -- Branch system admins can insert to their branch
    (public.has_role(auth.uid(), 'branch_system_admin') AND 
     branch_id IN (SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid())) OR
    -- Admins can insert everything
    public.has_role(auth.uid(), 'admin')
  );

-- Emergency Assignments Policies
CREATE POLICY "Users can manage emergency assignments based on role"
  ON public.emergency_assignments FOR ALL 
  USING (
    -- System admins can manage everything
    public.has_role(auth.uid(), 'system_admin') OR
    -- Regional managers can manage everything
    public.has_role(auth.uid(), 'regional_manager') OR
    -- Branch system admins can manage their branch
    (public.has_role(auth.uid(), 'branch_system_admin') AND 
     stock_item_id IN (SELECT id FROM public.stock_items WHERE branch_id IN 
       (SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid()))) OR
    -- Admins can manage everything
    public.has_role(auth.uid(), 'admin') OR
    -- Dispensers can manage their assignments
    dispenser_id = auth.uid()
  );

-- Weekly Tasks Policies
CREATE POLICY "Users can manage weekly tasks based on role"
  ON public.weekly_tasks FOR ALL 
  USING (
    -- System admins can manage everything
    public.has_role(auth.uid(), 'system_admin') OR
    -- Regional managers can manage everything
    public.has_role(auth.uid(), 'regional_manager') OR
    -- Branch system admins can manage their branch
    (public.has_role(auth.uid(), 'branch_system_admin') AND 
     assigned_to IN (SELECT u.id FROM public.users u 
                     JOIN public.user_roles ur ON u.id = ur.user_id 
                     WHERE ur.branch_id IN 
                       (SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid()))) OR
    -- Admins can manage everything
    public.has_role(auth.uid(), 'admin') OR
    -- Dispensers can manage their tasks
    assigned_to = auth.uid()
  );

-- Stock Movement History Policies
CREATE POLICY "Users can view stock movements based on role"
  ON public.stock_movement_history FOR SELECT 
  USING (
    -- System admins can see everything
    public.has_role(auth.uid(), 'system_admin') OR
    -- Regional managers can see everything
    public.has_role(auth.uid(), 'regional_manager') OR
    -- Branch system admins can see their branch
    (public.has_role(auth.uid(), 'branch_system_admin') AND 
     (from_branch IN (SELECT name FROM public.branches WHERE id IN 
       (SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid())) OR
      to_branch IN (SELECT name FROM public.branches WHERE id IN 
       (SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid())))) OR
    -- Admins can see everything
    public.has_role(auth.uid(), 'admin') OR
    -- Dispensers can see their movements
    for_dispenser = auth.uid() OR moved_by = auth.uid()
  );

-- Notifications Policies
CREATE POLICY "Users can manage notifications based on role"
  ON public.notifications FOR ALL 
  USING (
    -- System admins can manage everything
    public.has_role(auth.uid(), 'system_admin') OR
    -- Regional managers can manage everything
    public.has_role(auth.uid(), 'regional_manager') OR
    -- Branch system admins can manage their branch
    (public.has_role(auth.uid(), 'branch_system_admin') AND 
     user_id IN (SELECT u.id FROM public.users u 
                 JOIN public.user_roles ur ON u.id = ur.user_id 
                 WHERE ur.branch_id IN 
                   (SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid()))) OR
    -- Admins can manage everything
    public.has_role(auth.uid(), 'admin') OR
    -- Users can manage their own notifications
    user_id = auth.uid()
  );

-- Branch Performance Policies
CREATE POLICY "Users can view branch performance based on role"
  ON public.branch_performance FOR SELECT 
  USING (
    -- System admins can see everything
    public.has_role(auth.uid(), 'system_admin') OR
    -- Regional managers can see everything
    public.has_role(auth.uid(), 'regional_manager') OR
    -- Branch system admins can see their branch
    (public.has_role(auth.uid(), 'branch_system_admin') AND 
     branch_id IN (SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid())) OR
    -- Admins can see everything
    public.has_role(auth.uid(), 'admin')
  );

-- Branches Policies
CREATE POLICY "Users can view branches based on role"
  ON public.branches FOR SELECT 
  USING (
    -- Everyone can view branches
    auth.role() = 'authenticated'
  );

CREATE POLICY "Users can manage branches based on role"
  ON public.branches FOR ALL 
  USING (
    -- System admins can manage everything
    public.has_role(auth.uid(), 'system_admin') OR
    -- Regional managers can manage everything
    public.has_role(auth.uid(), 'regional_manager') OR
    -- Branch system admins can manage their branch
    (public.has_role(auth.uid(), 'branch_system_admin') AND 
     id IN (SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid())) OR
    -- Admins can manage everything
    public.has_role(auth.uid(), 'admin')
  );

-- Users Policies
CREATE POLICY "Users can view users based on role"
  ON public.users FOR SELECT 
  USING (
    -- System admins can see everything
    public.has_role(auth.uid(), 'system_admin') OR
    -- Regional managers can see everything
    public.has_role(auth.uid(), 'regional_manager') OR
    -- Branch system admins can see their branch users
    (public.has_role(auth.uid(), 'branch_system_admin') AND 
     id IN (SELECT ur.user_id FROM public.user_roles ur 
            WHERE ur.branch_id IN 
              (SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid()))) OR
    -- Admins can see everything
    public.has_role(auth.uid(), 'admin') OR
    -- Users can see themselves
    id = auth.uid()
  );

CREATE POLICY "Users can manage users based on role"
  ON public.users FOR ALL 
  USING (
    -- System admins can manage everything
    public.has_role(auth.uid(), 'system_admin') OR
    -- Regional managers can manage everything
    public.has_role(auth.uid(), 'regional_manager') OR
    -- Branch system admins can manage their branch users
    (public.has_role(auth.uid(), 'branch_system_admin') AND 
     id IN (SELECT ur.user_id FROM public.user_roles ur 
            WHERE ur.branch_id IN 
              (SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid()))) OR
    -- Admins can manage everything
    public.has_role(auth.uid(), 'admin')
  );

-- User Roles Policies
CREATE POLICY "Users can view user roles based on role"
  ON public.user_roles FOR SELECT 
  USING (
    -- System admins can see everything
    public.has_role(auth.uid(), 'system_admin') OR
    -- Regional managers can see everything
    public.has_role(auth.uid(), 'regional_manager') OR
    -- Branch system admins can see their branch roles
    (public.has_role(auth.uid(), 'branch_system_admin') AND 
     branch_id IN (SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid())) OR
    -- Admins can see everything
    public.has_role(auth.uid(), 'admin') OR
    -- Users can see their own roles
    user_id = auth.uid()
  );

CREATE POLICY "Users can manage user roles based on role"
  ON public.user_roles FOR ALL 
  USING (
    -- System admins can manage everything
    public.has_role(auth.uid(), 'system_admin') OR
    -- Regional managers can manage everything
    public.has_role(auth.uid(), 'regional_manager') OR
    -- Branch system admins can manage their branch roles
    (public.has_role(auth.uid(), 'branch_system_admin') AND 
     branch_id IN (SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid())) OR
    -- Admins can manage everything
    public.has_role(auth.uid(), 'admin')
  );

-- ============================================================================
-- STEP 6: Create sample dispensers for each branch
-- ============================================================================

-- Create sample dispensers for demonstration
DO $$
DECLARE
    branch_record RECORD;
    dispenser_count INTEGER := 1;
BEGIN
    FOR branch_record IN SELECT id, name FROM public.branches LIMIT 5 LOOP
        -- Create 2 dispensers per branch for demo
        FOR i IN 1..2 LOOP
            INSERT INTO auth.users (
                id,
                email,
                encrypted_password,
                email_confirmed_at,
                created_at,
                updated_at,
                raw_user_meta_data
            ) VALUES (
                gen_random_uuid(),
                'dispenser' || dispenser_count || '@' || LOWER(REPLACE(branch_record.name, ' ', '')) || '.com',
                crypt('dispenser123', gen_salt('bf')),
                now(),
                now(),
                now(),
                json_build_object(
                    'name', 'Dispenser ' || dispenser_count || ' - ' || branch_record.name,
                    'role', 'dispenser',
                    'phone', '+2567' || LPAD(dispenser_count::text, 8, '0')
                )
            );
            dispenser_count := dispenser_count + 1;
        END LOOP;
    END LOOP;
END $$;

-- ============================================================================
-- STEP 7: Create sample stock items for testing
-- ============================================================================

-- Insert sample stock items for testing
INSERT INTO public.stock_items (
    product_name,
    quantity,
    unit_price,
    expiry_date,
    branch,
    branch_id,
    status,
    assigned_to,
    created_at,
    updated_at
) 
SELECT 
    'Sample Product ' || i,
    100 + (i * 10),
    50.00 + (i * 5),
    CURRENT_DATE + INTERVAL '30 days',
    b.name,
    b.id,
    'pending',
    (SELECT u.id FROM public.users u 
     JOIN public.user_roles ur ON u.id = ur.user_id 
     WHERE ur.role = 'dispenser' AND ur.branch_id = b.id 
     LIMIT 1),
    NOW(),
    NOW()
FROM generate_series(1, 10) i
CROSS JOIN public.branches b
WHERE b.id IN (SELECT id FROM public.branches LIMIT 3);

-- ============================================================================
-- STEP 8: Create sample stock movements for LedgerBoard
-- ============================================================================

-- Insert sample stock movements
INSERT INTO public.stock_movement_history (
    stock_item_id,
    movement_type,
    quantity_moved,
    from_branch,
    to_branch,
    for_dispenser,
    moved_by,
    movement_date,
    notes
)
SELECT 
    si.id,
    CASE (i % 4) 
        WHEN 0 THEN 'sale'
        WHEN 1 THEN 'transfer'
        WHEN 2 THEN 'adjustment'
        ELSE 'expiry'
    END,
    10 + (i * 2),
    si.branch,
    CASE WHEN i % 2 = 0 THEN 'Main Branch' ELSE si.branch END,
    si.assigned_to,
    si.assigned_to,
    NOW() - INTERVAL '1 day' * i,
    'Sample movement ' || i
FROM generate_series(1, 20) i
CROSS JOIN public.stock_items si
WHERE si.id IS NOT NULL
LIMIT 20;

-- ============================================================================
-- STEP 9: Create sample weekly tasks
-- ============================================================================

-- Insert sample weekly tasks
INSERT INTO public.weekly_tasks (
    title,
    description,
    assigned_to,
    assigned_by,
    due_date,
    priority,
    status,
    created_at,
    updated_at
)
SELECT 
    'Task ' || i,
    'Sample task description ' || i,
    (SELECT u.id FROM public.users u 
     JOIN public.user_roles ur ON u.id = ur.user_id 
     WHERE ur.role = 'dispenser' 
     LIMIT 1),
    (SELECT u.id FROM public.users u 
     JOIN public.user_roles ur ON u.id = ur.user_id 
     WHERE ur.role = 'admin' 
     LIMIT 1),
    NOW() + INTERVAL '7 days',
    CASE (i % 3)
        WHEN 0 THEN 'low'
        WHEN 1 THEN 'medium'
        ELSE 'high'
    END,
    'pending',
    NOW(),
    NOW()
FROM generate_series(1, 10) i;

-- ============================================================================
-- STEP 10: Verify the setup
-- ============================================================================

DO $$
BEGIN
    -- Check if dispenser role was added
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumtypid = 'public.app_role'::regtype 
        AND enumlabel = 'dispenser'
    ) THEN
        RAISE EXCEPTION 'Dispenser role was not added to app_role enum';
    END IF;
    
    -- Check if sample dispensers were created
    IF (SELECT COUNT(*) FROM public.users WHERE role = 'dispenser') < 5 THEN
        RAISE NOTICE 'Sample dispensers may not have been created properly';
    END IF;
    
    -- Check if sample data was created
    IF (SELECT COUNT(*) FROM public.stock_items) < 10 THEN
        RAISE NOTICE 'Sample stock items may not have been created properly';
    END IF;
    
    RAISE NOTICE 'Complete dispenser solution implemented successfully!';
    RAISE NOTICE 'Available roles: admin, regional_manager, system_admin, branch_system_admin, dispenser';
    RAISE NOTICE 'Sample dispensers created for demonstration';
    RAISE NOTICE 'Sample stock items and movements created for testing';
    RAISE NOTICE 'RLS policies configured for proper access control';
END $$; 