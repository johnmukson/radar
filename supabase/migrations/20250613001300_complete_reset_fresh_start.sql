-- Migration: Complete Database Reset - Fresh Start
-- Date: 2025-06-13
-- Description: This migration completely resets the database and creates a fresh start with admin-only roles

-- ============================================================================
-- STEP 1: Drop all existing tables, views, functions, and triggers
-- ============================================================================

-- Disable triggers temporarily
SET session_replication_role = replica;

-- Drop all views first
DROP VIEW IF EXISTS public.dispensers_view CASCADE;
DROP VIEW IF EXISTS public.user_with_roles CASCADE;

-- Drop all triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_weekly_tasks_updated_at ON public.weekly_tasks;
DROP TRIGGER IF EXISTS update_stock_items_updated_at ON public.stock_items;

-- Drop all functions
DROP FUNCTION IF EXISTS public.sync_auth_user_to_users() CASCADE;
DROP FUNCTION IF EXISTS public.assign_user_role(UUID, app_role, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_dispenser_performance(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- Drop all tables in reverse dependency order
DROP TABLE IF EXISTS public.stock_movement_history CASCADE;
DROP TABLE IF EXISTS public.emergency_assignments CASCADE;
DROP TABLE IF EXISTS public.weekly_tasks CASCADE;
DROP TABLE IF EXISTS public.stock_items CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.branch_performance CASCADE;
DROP TABLE IF EXISTS public.whatsapp_notifications CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.branches CASCADE;

-- Drop the enum
DROP TYPE IF EXISTS public.app_role CASCADE;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- ============================================================================
-- STEP 2: Create fresh app_role enum (admin-only)
-- ============================================================================

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'regional_manager',
    'system_admin',
    'branch_system_admin'
);

-- ============================================================================
-- STEP 3: Create fresh branches table
-- ============================================================================

CREATE TABLE public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    region TEXT,
    manager_id UUID REFERENCES auth.users(id),
    address TEXT,
    phone TEXT,
    email TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- STEP 4: Create fresh users table
-- ============================================================================

CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'admin',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- STEP 5: Create fresh user_roles table
-- ============================================================================

CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'admin',
    branch_id UUID REFERENCES public.branches(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id, role)
);

-- ============================================================================
-- STEP 6: Create fresh stock_items table
-- ============================================================================

CREATE TABLE public.stock_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_price NUMERIC(10,2) NOT NULL,
    expiry_date DATE NOT NULL,
    branch TEXT NOT NULL,
    branch_id UUID REFERENCES public.branches(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'moved', 'expired', 'disposed')),
    assigned_to UUID REFERENCES auth.users(id),
    assignment_strategy TEXT,
    date_assigned TIMESTAMP WITH TIME ZONE,
    deadline TIMESTAMP WITH TIME ZONE,
    emergency_declared_at TIMESTAMP WITH TIME ZONE,
    emergency_declared_by UUID REFERENCES auth.users(id),
    is_emergency BOOLEAN DEFAULT false,
    priority TEXT,
    priority_score INTEGER,
    risk_level TEXT,
    days_to_expiry INTEGER,
    quantity_moved INTEGER DEFAULT 0,
    value NUMERIC(10,2),
    last_updated_at TIMESTAMP WITH TIME ZONE,
    last_updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- STEP 7: Create fresh emergency_assignments table
-- ============================================================================

CREATE TABLE public.emergency_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE CASCADE NOT NULL,
    dispenser_id UUID REFERENCES auth.users(id) NOT NULL,
    assigned_quantity INTEGER NOT NULL,
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- STEP 8: Create fresh weekly_tasks table
-- ============================================================================

CREATE TABLE public.weekly_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID REFERENCES auth.users(id) NOT NULL,
    assigned_by UUID REFERENCES auth.users(id) NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    whatsapp_sent BOOLEAN DEFAULT false,
    whatsapp_sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- STEP 9: Create fresh stock_movement_history table
-- ============================================================================

CREATE TABLE public.stock_movement_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_item_id UUID REFERENCES public.stock_items(id),
    movement_type TEXT,
    quantity_moved INTEGER NOT NULL,
    from_branch TEXT,
    to_branch TEXT,
    for_dispenser UUID REFERENCES auth.users(id),
    moved_by UUID REFERENCES auth.users(id),
    movement_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
    notes TEXT
);

-- ============================================================================
-- STEP 10: Create fresh whatsapp_notifications table
-- ============================================================================

CREATE TABLE public.whatsapp_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_phone TEXT NOT NULL,
    message_content TEXT NOT NULL,
    message_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    twilio_sid TEXT,
    error_message TEXT,
    related_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    sent_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================================
-- STEP 11: Create fresh notifications table
-- ============================================================================

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    message TEXT NOT NULL,
    type TEXT,
    stock_item_id UUID REFERENCES public.stock_items(id),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- STEP 12: Create fresh branch_performance table
-- ============================================================================

CREATE TABLE public.branch_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_stock_value NUMERIC(10,2) DEFAULT 0,
    items_expired INTEGER DEFAULT 0,
    items_near_expiry INTEGER DEFAULT 0,
    emergency_assignments INTEGER DEFAULT 0,
    tasks_completed INTEGER DEFAULT 0,
    dispensers_active INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(branch_id, period_start, period_end)
);

-- ============================================================================
-- STEP 13: Create helper functions
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role, _branch_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        -- System admin has access to everything
        role = 'system_admin' OR
        -- Exact role match with branch consideration
        (role = _role AND (branch_id = _branch_id OR _branch_id IS NULL OR role IN ('regional_manager', 'system_admin')))
      )
  )
$$;

-- Function to assign user roles safely
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

-- Function to sync auth.users to public.users
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
-- STEP 14: Create triggers
-- ============================================================================

-- Trigger for auth.users sync
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_to_users();

-- Triggers for updated_at
CREATE TRIGGER update_stock_items_updated_at
  BEFORE UPDATE ON public.stock_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_weekly_tasks_updated_at
  BEFORE UPDATE ON public.weekly_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- STEP 15: Create fresh dispensers_view
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
-- STEP 16: Insert fresh branch data
-- ============================================================================

INSERT INTO public.branches (name, code, region, status) VALUES
('Gayaza', 'GAY001', 'Central', 'active'),
('Kira', 'KIR002', 'Central', 'active'),
('Burton Street', 'BUR003', 'Central', 'active'),
('Gulu', 'GUL004', 'Northern', 'active'),
('Jinja 1', 'JIN005', 'Eastern', 'active'),
('Jinja 2', 'JIN006', 'Eastern', 'active'),
('Kabalagala', 'KAB007', 'Central', 'active'),
('Kansanga', 'KAN008', 'Central', 'active'),
('Kiruddu', 'KIR009', 'Central', 'active'),
('Kisementi', 'KIS010', 'Central', 'active'),
('Kintintale', 'KIN011', 'Central', 'active'),
('Mbale', 'MBA012', 'Eastern', 'active'),
('Mbarara', 'MBR013', 'Western', 'active'),
('Naalya', 'NAA014', 'Central', 'active'),
('Mukono', 'MUK015', 'Central', 'active'),
('Munyonyo', 'MUN016', 'Central', 'active'),
('Najjera', 'NAJ017', 'Central', 'active'),
('Ntinda', 'NTI018', 'Central', 'active'),
('Wandegeya', 'WAN019', 'Central', 'active'),
('Bbunga', 'BBU020', 'Central', 'active');

-- ============================================================================
-- STEP 17: Create fresh system admin user
-- ============================================================================

-- Create system admin in auth.users
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@bbunga.com') THEN
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
            'admin@bbunga.com',
            crypt('admin123', gen_salt('bf')),
            now(),
            now(),
            now(),
            '{"name": "System Administrator", "role": "system_admin", "phone": "+256700000000"}'
        );
    END IF;
END $$;

-- ============================================================================
-- STEP 18: Set up RLS policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movement_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_performance ENABLE ROW LEVEL SECURITY;

-- Create comprehensive RLS policies
CREATE POLICY "System admins can manage all data"
  ON public.branches FOR ALL USING (public.has_role(auth.uid(), 'system_admin'));

CREATE POLICY "System admins can manage all data"
  ON public.users FOR ALL USING (public.has_role(auth.uid(), 'system_admin'));

CREATE POLICY "System admins can manage all data"
  ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'system_admin'));

CREATE POLICY "System admins can manage all data"
  ON public.stock_items FOR ALL USING (public.has_role(auth.uid(), 'system_admin'));

CREATE POLICY "System admins can manage all data"
  ON public.emergency_assignments FOR ALL USING (public.has_role(auth.uid(), 'system_admin'));

CREATE POLICY "System admins can manage all data"
  ON public.weekly_tasks FOR ALL USING (public.has_role(auth.uid(), 'system_admin'));

CREATE POLICY "System admins can manage all data"
  ON public.stock_movement_history FOR ALL USING (public.has_role(auth.uid(), 'system_admin'));

CREATE POLICY "System admins can manage all data"
  ON public.whatsapp_notifications FOR ALL USING (public.has_role(auth.uid(), 'system_admin'));

CREATE POLICY "System admins can manage all data"
  ON public.notifications FOR ALL USING (public.has_role(auth.uid(), 'system_admin'));

CREATE POLICY "System admins can manage all data"
  ON public.branch_performance FOR ALL USING (public.has_role(auth.uid(), 'system_admin'));

-- Allow authenticated users to view basic data
CREATE POLICY "Authenticated users can view branches"
  ON public.branches FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view stock items"
  ON public.stock_items FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================================
-- STEP 19: Grant permissions
-- ============================================================================

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ============================================================================
-- STEP 20: Verify the setup
-- ============================================================================

DO $$
BEGIN
    -- Check if branches were created
    IF (SELECT COUNT(*) FROM public.branches) < 20 THEN
        RAISE EXCEPTION 'Not all branches were created';
    END IF;
    
    -- Check if system admin exists
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE role = 'system_admin') THEN
        RAISE EXCEPTION 'System admin was not created';
    END IF;
    
    -- Check if the enum only contains admin roles
    IF EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumtypid = 'public.app_role'::regtype 
        AND enumlabel IN ('user', 'dispenser')
    ) THEN
        RAISE EXCEPTION 'User or dispenser still exist in app_role enum';
    END IF;
    
    RAISE NOTICE 'Fresh setup completed successfully!';
    RAISE NOTICE 'System Admin: admin@bbunga.com / admin123';
    RAISE NOTICE 'Available roles: admin, regional_manager, system_admin, branch_system_admin';
END $$; 