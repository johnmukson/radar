-- ====================================================================================
-- FINAL, CONSOLIDATED SCRIPT FOR CONNECT BUDDY
-- Version: 10.0 (Definitive Version)
-- Description: Complete schema with frontend compatibility views
-- ====================================================================================

-- ============================================================================
-- STEP 1: Create app_role enum
-- ============================================================================
DROP TYPE IF EXISTS public.app_role CASCADE;
CREATE TYPE public.app_role AS ENUM ('system_admin', 'branch_system_admin', 'regional_manager', 'admin', 'dispenser');

-- ============================================================================
-- STEP 2-11: Create all tables
-- ============================================================================
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  name TEXT NOT NULL, 
  code TEXT UNIQUE NOT NULL, 
  region TEXT, 
  manager_id UUID, 
  address TEXT, 
  phone TEXT, 
  email TEXT, 
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')), 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, 
  email TEXT NOT NULL UNIQUE, 
  name TEXT, 
  phone TEXT, 
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')), 
  last_login TIMESTAMP WITH TIME ZONE, 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL, 
  role public.app_role NOT NULL, 
  branch_id UUID REFERENCES public.branches(id), 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
  UNIQUE (user_id, role)
);

CREATE TABLE public.stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  product_name TEXT NOT NULL, 
  quantity INTEGER NOT NULL DEFAULT 0, 
  unit_price NUMERIC(10,2) NOT NULL, 
  expiry_date DATE NOT NULL, 
  branch_id UUID REFERENCES public.branches(id) NOT NULL, 
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'moved', 'expired', 'disposed')), 
  assigned_to UUID REFERENCES public.users(id), 
  assignment_strategy TEXT, 
  date_assigned TIMESTAMP WITH TIME ZONE, 
  deadline TIMESTAMP WITH TIME ZONE, 
  emergency_declared_at TIMESTAMP WITH TIME ZONE, 
  emergency_declared_by UUID REFERENCES public.users(id), 
  is_emergency BOOLEAN DEFAULT false, 
  priority TEXT, 
  priority_score INTEGER, 
  risk_level TEXT, 
  days_to_expiry INTEGER, 
  quantity_moved INTEGER DEFAULT 0, 
  value NUMERIC(10,2), 
  is_high_value BOOLEAN DEFAULT false, 
  last_updated_at TIMESTAMP WITH TIME ZONE, 
  last_updated_by UUID REFERENCES public.users(id), 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.emergency_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE CASCADE NOT NULL, 
  dispenser_id UUID REFERENCES public.users(id) NOT NULL, 
  assigned_quantity INTEGER NOT NULL, 
  assigned_by UUID REFERENCES public.users(id), 
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
  deadline TIMESTAMP WITH TIME ZONE NOT NULL, 
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')), 
  completed_at TIMESTAMP WITH TIME ZONE, 
  notes TEXT, 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.weekly_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  title TEXT NOT NULL, 
  description TEXT, 
  assigned_to UUID REFERENCES public.users(id) NOT NULL, 
  assigned_by UUID REFERENCES public.users(id) NOT NULL, 
  due_date TIMESTAMP WITH TIME ZONE NOT NULL, 
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')), 
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')), 
  whatsapp_sent BOOLEAN DEFAULT false, 
  whatsapp_sent_at TIMESTAMP WITH TIME ZONE, 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.stock_movement_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  stock_item_id UUID REFERENCES public.stock_items(id), 
  movement_type TEXT, 
  quantity_moved INTEGER NOT NULL, 
  from_branch_id UUID REFERENCES public.branches(id), 
  to_branch_id UUID REFERENCES public.branches(id), 
  for_dispenser UUID REFERENCES public.users(id), 
  moved_by UUID REFERENCES public.users(id), 
  movement_date TIMESTAMP WITH TIME ZONE DEFAULT now(), 
  notes TEXT
);

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

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  user_id UUID REFERENCES public.users(id), 
  message TEXT NOT NULL, 
  type TEXT, 
  stock_item_id UUID REFERENCES public.stock_items(id), 
  is_read BOOLEAN DEFAULT false, 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

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
-- STEP 12: Create helper functions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column() 
RETURNS trigger 
LANGUAGE plpgsql AS $$ 
BEGIN 
  NEW.updated_at = now(); 
  RETURN NEW; 
END; 
$$;

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
      OR (role = _role AND (branch_id = _branch_id OR _branch_id IS NULL OR role IN ('regional_manager', 'system_admin')))
    )
  ) 
$$;

CREATE OR REPLACE FUNCTION public.assign_user_role(p_user_id UUID, p_role public.app_role, p_branch_id UUID DEFAULT NULL) 
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER AS $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN 
    INSERT INTO public.users (id, email, name, phone, status) 
    SELECT au.id, au.email, au.raw_user_meta_data->>'name', au.raw_user_meta_data->>'phone', 'active' 
    FROM auth.users au WHERE au.id = p_user_id; 
  END IF; 
  
  INSERT INTO public.user_roles (user_id, role, branch_id) 
  VALUES (p_user_id, p_role, p_branch_id) 
  ON CONFLICT (user_id, role) DO UPDATE SET branch_id = EXCLUDED.branch_id; 
  
  RETURN TRUE; 
EXCEPTION WHEN OTHERS THEN 
  RETURN FALSE; 
END; 
$$;

CREATE OR REPLACE FUNCTION public.sync_auth_user_to_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  user_name TEXT;
  user_phone TEXT;
  user_role public.app_role;
  user_branch_id UUID;
  branch_id_text TEXT;
BEGIN
  user_name := NEW.raw_user_meta_data ->> 'name';
  user_phone := NEW.raw_user_meta_data ->> 'phone';
  user_role := (NEW.raw_user_meta_data ->> 'role')::public.app_role;
  branch_id_text := NEW.raw_user_meta_data ->> 'branch_id';

  INSERT INTO public.users (id, email, name, phone)
  VALUES (NEW.id, NEW.email, user_name, user_phone)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      name = COALESCE(EXCLUDED.name, public.users.name),
      phone = COALESCE(EXCLUDED.phone, public.users.phone);

  IF user_role IS NOT NULL THEN
    IF user_role IN ('system_admin', 'regional_manager') THEN
      user_branch_id := NULL;
    ELSE
      IF branch_id_text IS NULL OR branch_id_text = '' THEN
        RAISE EXCEPTION 'A branch is required for the role of "%", but was not provided.', user_role;
      END IF;
      user_branch_id := branch_id_text::uuid;
    END IF;

    INSERT INTO public.user_roles (user_id, role, branch_id)
    VALUES (NEW.id, user_role, user_branch_id)
    ON CONFLICT (user_id, role) DO UPDATE
    SET branch_id = EXCLUDED.branch_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_stock_item_attributes() 
RETURNS TRIGGER 
LANGUAGE plpgsql AS $$ 
BEGIN 
  NEW.days_to_expiry := EXTRACT(DAY FROM (NEW.expiry_date - NOW())); 
  NEW.value := NEW.quantity * NEW.unit_price; 
  IF NEW.days_to_expiry <= 30 THEN 
    NEW.risk_level := 'high'; 
  ELSIF NEW.days_to_expiry <= 90 THEN 
    NEW.risk_level := 'medium'; 
  ELSE 
    NEW.risk_level := 'low'; 
  END IF; 
  RETURN NEW; 
END; 
$$;

-- ============================================================================
-- STEP 13: Create triggers
-- ============================================================================
CREATE TRIGGER on_auth_user_created 
  AFTER INSERT ON auth.users 
  FOR EACH ROW 
  EXECUTE FUNCTION public.sync_auth_user_to_users();

CREATE TRIGGER update_stock_items_updated_at 
  BEFORE UPDATE ON public.stock_items 
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_weekly_tasks_updated_at 
  BEFORE UPDATE ON public.weekly_tasks 
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_emergency_assignments_updated_at 
  BEFORE UPDATE ON public.emergency_assignments 
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_update_stock_item_attributes 
  BEFORE INSERT OR UPDATE OF expiry_date, quantity, unit_price ON public.stock_items 
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_stock_item_attributes();

-- ============================================================================
-- STEP 14: Create views for frontend compatibility
-- ============================================================================

-- View for stock items with branch names
CREATE OR REPLACE VIEW public.stock_items_view AS
SELECT
  si.id,
  si.product_name,
  si.quantity,
  si.unit_price,
  si.expiry_date,
  b.name AS branch,
  si.status,
  si.assigned_to,
  si.assignment_strategy,
  si.date_assigned,
  si.deadline,
  si.emergency_declared_at,
  si.emergency_declared_by,
  si.is_emergency,
  si.priority,
  si.priority_score,
  si.risk_level,
  si.days_to_expiry,
  si.quantity_moved,
  si.value,
  si.is_high_value,
  si.last_updated_at,
  si.last_updated_by,
  si.created_at,
  si.updated_at
FROM public.stock_items si
LEFT JOIN public.branches b ON si.branch_id = b.id;

-- View for stock movement history with branch names
CREATE OR REPLACE VIEW public.stock_movement_history_view AS
SELECT
  smh.id,
  smh.movement_date,
  smh.stock_item_id,
  smh.movement_type,
  f_branch.name AS from_branch,
  t_branch.name AS to_branch,
  smh.quantity_moved,
  smh.for_dispenser,
  smh.moved_by,
  smh.notes,
  si.product_name
FROM public.stock_movement_history smh
LEFT JOIN public.branches f_branch ON smh.from_branch_id = f_branch.id
LEFT JOIN public.branches t_branch ON smh.to_branch_id = t_branch.id
LEFT JOIN public.stock_items si ON smh.stock_item_id = si.id;

-- View for users with their roles
CREATE OR REPLACE VIEW public.users_with_roles AS
SELECT
  u.id AS user_id,
  u.name,
  u.email,
  u.phone,
  u.status,
  ur.role,
  ur.branch_id,
  b.name AS branch_name
FROM public.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
LEFT JOIN public.branches b ON ur.branch_id = b.id
ORDER BY u.name;

-- View for users with roles and branch details
CREATE OR REPLACE VIEW public.users_with_roles_and_branches AS
SELECT
  u.id,
  u.name,
  u.email,
  u.phone,
  u.status,
  u.last_login,
  u.created_at,
  u.updated_at,
  ur.role,
  ur.branch_id,
  b.name AS branch_name,
  b.code AS branch_code,
  b.region AS branch_region
FROM public.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
LEFT JOIN public.branches b ON ur.branch_id = b.id
ORDER BY u.name;

-- View for dispensers with performance metrics
CREATE OR REPLACE VIEW public.dispensers_view AS
SELECT DISTINCT
  u.id,
  u.name as dispenser,
  u.phone,
  u.email,
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
WHERE ur.role IN ('system_admin', 'branch_system_admin', 'regional_manager', 'admin', 'dispenser')
ORDER BY u.name;

-- High value items monthly summary view
CREATE OR REPLACE VIEW public.high_value_items_monthly_summary AS
SELECT
  TO_CHAR(si.expiry_date, 'YYYY-MM') AS expiry_month,
  si.branch_id,
  b.name AS branch_name,
  SUM(si.value) AS total_high_value,
  COUNT(si.id) AS number_of_high_value_items
FROM public.stock_items si
JOIN public.branches b ON si.branch_id = b.id
WHERE si.is_high_value = TRUE
GROUP BY 1, si.branch_id, b.name
ORDER BY expiry_month, branch_name;

-- ============================================================================
-- STEP 15: Insert branch data
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
-- STEP 16: Create default system admin users
-- ============================================================================
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'johnson123mukwaya@gmail.com') THEN 
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data) 
    VALUES (gen_random_uuid(), 'johnson123mukwaya@gmail.com', crypt('xavier123', gen_salt('bf')), now(), '{"name": "Mukwaya Johnson", "role": "system_admin", "phone": "+256700000000"}'); 
  END IF; 
END $$;

DO $$ 
BEGIN 
  DELETE FROM auth.users WHERE email = 'harvardgenuis23@gmail.com'; 
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data) 
  VALUES (gen_random_uuid(), 'harvardgenuis23@gmail.com', crypt('xavier123', gen_salt('bf')), now(), '{"name": "Harvard Genuis", "role": "system_admin", "phone": "0756143126"}'); 
END $$;

-- ============================================================================
-- STEP 17: Set up RLS policies
-- ============================================================================
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

-- Branch policies
CREATE POLICY "System admins can manage all branches" ON public.branches FOR ALL USING (public.has_role(auth.uid(), 'system_admin'));
CREATE POLICY "Regional managers can view all branches" ON public.branches FOR SELECT USING (public.has_role(auth.uid(), 'regional_manager'));
CREATE POLICY "Branch system admins can manage their branch" ON public.branches FOR ALL USING (public.has_role(auth.uid(), 'branch_system_admin', id));
CREATE POLICY "Admins can view all branches" ON public.branches FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Dispensers can view their branch" ON public.branches FOR SELECT USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'dispenser' AND ur.branch_id = branches.id));

-- User policies
CREATE POLICY "System admins can manage all users" ON public.users FOR ALL USING (public.has_role(auth.uid(), 'system_admin'));
CREATE POLICY "Admins and managers can view users" ON public.users FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'regional_manager'));
CREATE POLICY "Allow users to insert their own user record" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Allow users to view their own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Allow users to update their own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- User role policies
CREATE POLICY "System admins can manage all user roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'system_admin'));
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can view all user roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Branch system admins can manage roles in their branch" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'branch_system_admin', user_roles.branch_id));

-- Stock item policies
CREATE POLICY "System admins can manage all stock items" ON public.stock_items FOR ALL USING (public.has_role(auth.uid(), 'system_admin'));
CREATE POLICY "Users with roles can view items in their branch" ON public.stock_items FOR SELECT USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND branch_id = stock_items.branch_id));
CREATE POLICY "Dispensers can update their assigned items" ON public.stock_items FOR UPDATE USING (assigned_to = auth.uid());

-- ============================================================================
-- STEP 18: Grant permissions
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Grant permissions on views
GRANT SELECT ON public.stock_items_view TO authenticated;
GRANT SELECT ON public.stock_movement_history_view TO authenticated;
GRANT SELECT ON public.users_with_roles TO authenticated;
GRANT SELECT ON public.users_with_roles_and_branches TO authenticated;
GRANT SELECT ON public.dispensers_view TO authenticated;
GRANT SELECT ON public.high_value_items_monthly_summary TO authenticated;

-- ============================================================================
-- STEP 19: Verify the setup
-- ============================================================================
DO $$
BEGIN
    IF (SELECT COUNT(*) FROM public.branches) < 20 THEN
        RAISE EXCEPTION 'Not all branches were created';
    END IF;
    
    RAISE NOTICE 'Clean setup completed successfully!';
    RAISE NOTICE 'System Admin 1: johnson123mukwaya@gmail.com / xavier123';
    RAISE NOTICE 'System Admin 2: harvardgenuis23@gmail.com / xavier123';
    RAISE NOTICE 'Available roles: system_admin, branch_system_admin, regional_manager, admin, dispenser';
END $$;

-- Drop the view completely
DROP VIEW IF EXISTS public.users_with_roles_and_branches CASCADE;

-- Create the new view
CREATE VIEW public.users_with_roles_and_branches AS
SELECT
    u.id AS user_id,
    u.name,
    u.email,
    u.phone,
    u.status,
    u.last_login,
    string_agg(ur.role::text, ', ') AS roles,
    string_agg(b.name, ', ') AS branches
FROM
    public.users u
LEFT JOIN
    public.user_roles ur ON u.id = ur.user_id
LEFT JOIN
    public.branches b ON ur.branch_id = b.id
GROUP BY
    u.id;

    -- Enable RLS on the tables if not already enabled
ALTER TABLE public.stock_movement_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

-- Drop any conflicting policies to ensure a clean slate
DROP POLICY IF EXISTS "Allow all authenticated users to view stock movements" ON public.stock_movement_history;
DROP POLICY IF EXISTS "Allow admin and manager access to all stock movements" ON public.stock_movement_history;
DROP POLICY IF EXISTS "Allow dispensers to see their own movements" ON public.stock_movement_history;
DROP POLICY IF EXISTS "Allow authenticated users to read stock items" ON public.stock_items;

-- Create a single policy on stock_movement_history to grant view access to all authenticated users
CREATE POLICY "Allow all authenticated users to view stock movements"
ON public.stock_movement_history
FOR SELECT
USING (auth.role() = 'authenticated');

-- Create a policy on stock_items to grant view access to all authenticated users
CREATE POLICY "Allow authenticated users to read stock items"
ON public.stock_items
FOR SELECT
USING (auth.role() = 'authenticated');

-- Step 1: Revoke permissions
REVOKE SELECT ON public.stock_movement_history_view FROM authenticated;

-- Step 2: Drop the view
DROP VIEW IF EXISTS public.stock_movement_history_view CASCADE;

-- Step 3: Create the new view
CREATE VIEW public.stock_movement_history_view AS
SELECT
  smh.id,
  smh.movement_date,
  smh.movement_type,
  smh.quantity_moved,
  smh.notes,
  si.product_name,
  from_b.name AS from_branch,
  to_b.name AS to_branch,
  u_moved.name AS moved_by,
  u_disp.name AS for_dispenser
FROM
  public.stock_movement_history smh
LEFT JOIN public.stock_items si ON smh.stock_item_id = si.id
LEFT JOIN public.branches from_b ON smh.from_branch_id = from_b.id
LEFT JOIN public.branches to_b ON smh.to_branch_id = to_b.id
LEFT JOIN public.users u_moved ON smh.moved_by = u_moved.id
LEFT JOIN public.users u_disp ON smh.for_dispenser = u_disp.id;

-- Step 4: Grant permissions
GRANT SELECT ON public.stock_movement_history_view TO authenticated;

-- View to get users with their roles
CREATE OR REPLACE VIEW public.users_with_roles AS
SELECT
    u.id as user_id,
    u.name,
    u.email,
    ur.role
FROM
    public.users u
JOIN
    public.user_roles ur ON u.id = ur.user_id;

-- View to get detailed stock item info
CREATE OR REPLACE VIEW public.stock_items_details AS
SELECT 
    si.id,
    si.product_name,
    si.quantity,
    si.risk_level,
    si.status,
    si.assigned_to,
    b.name as branch_name,
    u.name as user_name
FROM 
    public.stock_items si
LEFT JOIN 
    public.branches b ON si.branch_id = b.id
LEFT JOIN 
    public.users u ON si.assigned_to = u.id;

-- Grant permissions for the app to use these views
GRANT SELECT ON public.users_with_roles TO authenticated;
GRANT SELECT ON public.stock_items_details TO authenticated;

-- This creates an index to speed up fetching tasks for a specific user within a date range.
CREATE INDEX IF NOT EXISTS idx_weekly_tasks_assigned_to_due_date ON public.weekly_tasks (assigned_to, due_date);
-- Index for stock items by branch and expiry date (very common query)
CREATE INDEX IF NOT EXISTS idx_stock_items_branch_expiry ON public.stock_items (branch_id, expiry_date);

-- Index for stock items by assigned user
CREATE INDEX IF NOT EXISTS idx_stock_items_assigned_to ON public.stock_items (assigned_to);

-- Index for emergency assignments by dispenser and status
CREATE INDEX IF NOT EXISTS idx_emergency_assignments_dispenser_status ON public.emergency_assignments (dispenser_id, status);

-- Index for user roles by user and role
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles (user_id, role);

CREATE OR REPLACE VIEW public.dispensers_view AS
SELECT DISTINCT
  u.id,
  u.name as dispenser,
  u.phone,
  u.email,
  b.name as branch,
  u.status,
  ur.role,
  ur.branch_id,
  u.created_at,
  u.updated_at,
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
WHERE ur.role = 'dispenser'
ORDER BY u.name;

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS is_high_value BOOLEAN DEFAULT FALSE;

CREATE OR REPLACE FUNCTION set_is_high_value()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_high_value := (NEW.unit_price * NEW.quantity) >= 100000;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_is_high_value ON stock_items;
CREATE TRIGGER trg_set_is_high_value
BEFORE INSERT OR UPDATE ON stock_items
FOR EACH ROW
EXECUTE FUNCTION set_is_high_value();

  UPDATE stock_items
  SET is_high_value = (unit_price * quantity) >= 100000;

       SELECT * FROM user_roles WHERE role = 'dispenser' AND (branch_id IS NULL OR branch_id = '');

          SELECT * FROM stock_items WHERE is_high_value = true;
          CREATE OR REPLACE VIEW public.stock_items_view AS
SELECT
  si.id,
  si.product_name,
  si.quantity,
  si.unit_price,
  si.expiry_date,
  b.name AS branch,
  si.status,
  si.assigned_to,
  si.assignment_strategy,
  si.date_assigned,
  si.deadline,
  si.emergency_declared_at,
  si.emergency_declared_by,
  si.is_emergency,
  si.priority,
  si.priority_score,
  si.risk_level,
  si.days_to_expiry,
  si.quantity_moved,
  si.value,
  si.is_high_value,
  si.last_updated_at,
  si.last_updated_by,
  si.created_at,
  si.updated_at,
  u.name AS assigned_to_name,         -- <-- Add new column here
  u.email AS assigned_to_email        -- <-- (Optional) Add new column here
FROM public.stock_items si
LEFT JOIN public.branches b ON si.branch_id = b.id
LEFT JOIN public.users u ON si.assigned_to = u.id;

-- Assign existing dispensers to Munyonyo branch
UPDATE user_roles 
SET branch_id = (SELECT id FROM branches WHERE name = 'Munyonyo')
WHERE user_id IN (
  '316a5db4-8168-4c30-a10f-0d377fd0e70b',  -- NAMUKOSE SANDRA
  '3bcde0d1-46d5-4496-817b-f9725b516d97'   -- Omakada john paul
)
AND role = 'dispenser';
-- Add DELETE policy for stock_items table
-- This allows system admins, regional managers, branch system admins, and admins to delete stock items

-- Drop existing DELETE policy if it exists
DROP POLICY IF EXISTS "Users can delete stock items based on role" ON public.stock_items;

-- Create DELETE policy for stock_items
CREATE POLICY "Users can delete stock items based on role"
  ON public.stock_items FOR DELETE 
  USING (
    -- System admins can delete everything
    public.has_role(auth.uid(), 'system_admin') OR
    -- Regional managers can delete everything
    public.has_role(auth.uid(), 'regional_manager') OR
    -- Branch system admins can delete their branch items
    (public.has_role(auth.uid(), 'branch_system_admin') AND 
     branch_id IN (SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid())) OR
    -- Admins can delete everything
    public.has_role(auth.uid(), 'admin')
  );

-- Add comment for documentation
COMMENT ON POLICY "Users can delete stock items based on role" ON public.stock_items IS 
'Allows authorized users (system_admin, regional_manager, branch_system_admin, admin) to delete stock items. Branch system admins can only delete items from their assigned branches.';


-- This will show the full CREATE VIEW statement
SELECT 'CREATE OR REPLACE VIEW ' || viewname || ' AS ' || definition AS create_view_sql
FROM pg_views
WHERE viewname = 'stock_items_view';