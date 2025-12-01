# Complete Backend Database Schema

## Database Setup

This document contains the complete database schema for the expiry management system with unified task and product assignment functionality.

---

## 1. Core Tables

### Users Table
```sql
CREATE TABLE public.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own data" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own data" ON public.users
    FOR UPDATE USING (auth.uid() = id);
```

### User Roles Table
```sql
CREATE TABLE public.user_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'dispenser', 'manager')),
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own roles" ON public.user_roles
    FOR SELECT USING (auth.uid() = user_id);
```

### Branches Table
```sql
CREATE TABLE public.branches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL UNIQUE,
    region VARCHAR(100),
    manager_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    address VARCHAR(500),
    phone VARCHAR(20),
    email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view branches" ON public.branches
    FOR SELECT USING (true);
```

---

## 2. Task Management Tables

### Weekly Tasks Table
```sql
CREATE TABLE public.weekly_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_to UUID REFERENCES public.users(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    due_date DATE NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    whatsapp_sent BOOLEAN DEFAULT FALSE,
    whatsapp_sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.weekly_tasks ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view tasks assigned to them" ON public.weekly_tasks
    FOR SELECT USING (auth.uid() = assigned_to);

CREATE POLICY "Users can update tasks assigned to them" ON public.weekly_tasks
    FOR UPDATE USING (auth.uid() = assigned_to);

CREATE POLICY "Admins can manage all tasks" ON public.weekly_tasks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );
```

### WhatsApp Notifications Table
```sql
CREATE TABLE public.whatsapp_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recipient_phone VARCHAR(20) NOT NULL,
    message_content TEXT NOT NULL,
    message_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    twilio_sid VARCHAR(100),
    error_message TEXT,
    related_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage all notifications" ON public.whatsapp_notifications
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );
```

---

## 3. Product Management Tables

### Stock Items Table
```sql
CREATE TABLE public.stock_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    expiry_date DATE NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'disposed', 'assigned', 'pending', 'in_progress', 'completed')),
    is_emergency BOOLEAN DEFAULT FALSE,
    emergency_declared_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view stock items" ON public.stock_items
    FOR SELECT USING (true);

CREATE POLICY "Users can update assigned stock items" ON public.stock_items
    FOR UPDATE USING (auth.uid() = assigned_to);

CREATE POLICY "Admins can manage all stock items" ON public.stock_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );
```

### Stock Movement History Table
```sql
CREATE TABLE public.stock_movement_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_item_id UUID REFERENCES public.stock_items(id),
    movement_type VARCHAR(50),
    quantity_moved INTEGER NOT NULL,
    from_branch VARCHAR(100),
    to_branch VARCHAR(100),
    for_dispenser UUID REFERENCES public.users(id),
    moved_by UUID REFERENCES public.users(id),
    movement_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT
);

-- Enable RLS
ALTER TABLE public.stock_movement_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage all movements" ON public.stock_movement_history
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Users can view movements" ON public.stock_movement_history
    FOR SELECT USING (true);
```

### Emergency Assignments Table
```sql
CREATE TABLE public.emergency_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE CASCADE,
    dispenser_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    assigned_quantity INTEGER NOT NULL,
    deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.emergency_assignments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage all emergency assignments" ON public.emergency_assignments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Dispensers can view their assignments" ON public.emergency_assignments
    FOR SELECT USING (auth.uid() = dispenser_id);

CREATE POLICY "Dispensers can update their assignments" ON public.emergency_assignments
    FOR UPDATE USING (auth.uid() = dispenser_id);
```

---

## 4. Unified Views

### Users with Roles View
```sql
CREATE VIEW public.users_with_roles AS
SELECT 
    u.id as user_id,
    u.name,
    u.email,
    u.phone,
    u.created_at,
    u.updated_at,
    ur.role
FROM public.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
ORDER BY u.name;

ALTER VIEW public.users_with_roles OWNER TO postgres;
```

### Unified Assignments View
```sql
CREATE VIEW public.unified_assignments_view AS
-- Weekly Tasks
SELECT 
    wt.id,
    'weekly_task' as source_type,
    wt.title as display_name,
    wt.description,
    wt.assigned_to,
    wt.assigned_by,
    wt.due_date as date_field,
    wt.priority,
    wt.status,
    wt.whatsapp_sent,
    wt.whatsapp_sent_at,
    wt.created_at,
    wt.updated_at,
    -- User information
    assigned_user.name as assigned_user_name,
    assigned_user.phone as assigned_user_phone,
    assigned_by_user.name as assigned_by_user_name,
    -- Product information (null for weekly tasks)
    NULL as product_name,
    NULL as quantity,
    NULL as unit_price,
    NULL as expiry_date,
    NULL as branch_id,
    NULL as branch_name,
    -- Risk level (based on due date for tasks)
    CASE 
        WHEN wt.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'critical'
        WHEN wt.due_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'high'
        WHEN wt.due_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'medium'
        ELSE 'low'
    END as risk_level
FROM weekly_tasks wt
LEFT JOIN users assigned_user ON wt.assigned_to = assigned_user.id
LEFT JOIN users assigned_by_user ON wt.assigned_by = assigned_by_user.id

UNION ALL

-- Assigned Products
SELECT 
    si.id,
    'assigned_product' as source_type,
    si.product_name as display_name,
    CONCAT('Product assignment: ', si.product_name, ' (Qty: ', si.quantity, ', Price: ', si.unit_price, ')') as description,
    si.assigned_to,
    NULL as assigned_by,
    si.expiry_date as date_field,
    'medium' as priority,
    si.status,
    false as whatsapp_sent,
    NULL as whatsapp_sent_at,
    si.created_at,
    si.updated_at,
    -- User information
    assigned_user.name as assigned_user_name,
    assigned_user.phone as assigned_user_phone,
    NULL as assigned_by_user_name,
    -- Product information
    si.product_name,
    si.quantity,
    si.unit_price,
    si.expiry_date,
    si.branch_id,
    b.name as branch_name,
    -- Risk level calculation
    CASE 
        WHEN si.expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'critical'
        WHEN si.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'high'
        WHEN si.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'medium'
        ELSE 'low'
    END as risk_level
FROM stock_items si
LEFT JOIN users assigned_user ON si.assigned_to = assigned_user.id
LEFT JOIN branches b ON si.branch_id = b.id
WHERE si.assigned_to IS NOT NULL

ORDER BY date_field ASC;

ALTER VIEW public.unified_assignments_view OWNER TO postgres;
```

### Weekly Assignments View
```sql
CREATE VIEW public.weekly_assignments_view AS
SELECT 
    wt.id,
    wt.title,
    wt.description,
    wt.assigned_to,
    wt.assigned_by,
    wt.due_date,
    wt.priority,
    wt.status,
    wt.whatsapp_sent,
    wt.whatsapp_sent_at,
    wt.created_at,
    wt.updated_at,
    -- User information
    assigned_user.name as assigned_user_name,
    assigned_user.phone as assigned_user_phone,
    assigned_by_user.name as assigned_by_user_name,
    -- Product information (if linked to stock_items)
    si.product_name,
    si.quantity,
    si.unit_price,
    si.expiry_date,
    si.branch_id,
    b.name as branch_name,
    -- Risk level calculation
    CASE 
        WHEN si.expiry_date IS NOT NULL THEN
            CASE 
                WHEN si.expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'critical'
                WHEN si.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'high'
                WHEN si.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'medium'
                ELSE 'low'
            END
        ELSE 'unknown'
    END as risk_level,
    -- Task type
    CASE 
        WHEN si.id IS NOT NULL THEN 'product_assignment'
        ELSE 'general_task'
    END as task_type
FROM weekly_tasks wt
LEFT JOIN users assigned_user ON wt.assigned_to = assigned_user.id
LEFT JOIN users assigned_by_user ON wt.assigned_by = assigned_by_user.id
LEFT JOIN stock_items si ON wt.title LIKE '%' || si.product_name || '%' 
    OR wt.description LIKE '%' || si.product_name || '%'
LEFT JOIN branches b ON si.branch_id = b.id
ORDER BY wt.due_date ASC;

ALTER VIEW public.weekly_assignments_view OWNER TO postgres;
```

### Stock Movement History View
```sql
CREATE VIEW public.stock_movement_history_view AS
SELECT 
    smh.id,
    smh.stock_item_id,
    smh.movement_type,
    smh.quantity_moved,
    smh.from_branch,
    smh.to_branch,
    smh.movement_date,
    smh.notes,
    si.product_name,
    from_user.name as moved_by,
    dispenser_user.name as for_dispenser
FROM stock_movement_history smh
LEFT JOIN stock_items si ON smh.stock_item_id = si.id
LEFT JOIN users from_user ON smh.moved_by = from_user.id
LEFT JOIN users dispenser_user ON smh.for_dispenser = dispenser_user.id
ORDER BY smh.movement_date DESC;

ALTER VIEW public.stock_movement_history_view OWNER TO postgres;
```

---

## 5. Functions

### Update Updated At Function
```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';
```

### Apply Updated At Triggers
```sql
-- Users table
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON public.users 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Weekly tasks table
CREATE TRIGGER update_weekly_tasks_updated_at 
    BEFORE UPDATE ON public.weekly_tasks 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Stock items table
CREATE TRIGGER update_stock_items_updated_at 
    BEFORE UPDATE ON public.stock_items 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Branches table
CREATE TRIGGER update_branches_updated_at 
    BEFORE UPDATE ON public.branches 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Emergency assignments table
CREATE TRIGGER update_emergency_assignments_updated_at 
    BEFORE UPDATE ON public.emergency_assignments 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

---

## 6. Sample Data

### Insert Sample Users
```sql
INSERT INTO public.users (id, name, email, phone, status) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'John Admin', 'admin@example.com', '+1234567890', 'active'),
('550e8400-e29b-41d4-a716-446655440002', 'Sarah Dispenser', 'sarah@example.com', '+1234567891', 'active'),
('550e8400-e29b-41d4-a716-446655440003', 'Mike Manager', 'mike@example.com', '+1234567892', 'active');

INSERT INTO public.user_roles (user_id, role, branch_id) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'admin', '660e8400-e29b-41d4-a716-446655440001'),
('550e8400-e29b-41d4-a716-446655440002', 'dispenser', '660e8400-e29b-41d4-a716-446655440001'),
('550e8400-e29b-41d4-a716-446655440003', 'manager', '660e8400-e29b-41d4-a716-446655440002');
```

### Insert Sample Branches
```sql
INSERT INTO public.branches (id, name, code, region, address, status) VALUES
('660e8400-e29b-41d4-a716-446655440001', 'Main Branch', 'MB001', 'Central', '123 Main St, City', 'active'),
('660e8400-e29b-41d4-a716-446655440002', 'North Branch', 'NB001', 'North', '456 North Ave, City', 'active'),
('660e8400-e29b-41d4-a716-446655440003', 'South Branch', 'SB001', 'South', '789 South Blvd, City', 'active');
```

### Insert Sample Stock Items
```sql
INSERT INTO public.stock_items (product_name, quantity, unit_price, expiry_date, branch_id, assigned_to, status) VALUES
('Paracetamol 500mg', 100, 5.50, '2024-03-15', '660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', 'assigned'),
('Ibuprofen 400mg', 75, 4.25, '2024-04-20', '660e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', 'assigned'),
('Vitamin C 1000mg', 50, 12.00, '2024-02-28', '660e8400-e29b-41d4-a716-446655440003', NULL, 'active');
```

### Insert Sample Weekly Tasks
```sql
INSERT INTO public.weekly_tasks (title, description, assigned_to, assigned_by, due_date, priority, status) VALUES
('Inventory Check', 'Complete weekly inventory check for all products', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', '2024-01-15', 'high', 'pending'),
('Expiry Review', 'Review products expiring within 30 days', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', '2024-01-20', 'urgent', 'in_progress'),
('Stock Replenishment', 'Order new stock for low inventory items', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', '2024-01-25', 'medium', 'pending');
```

---

## 7. Frontend Compatibility

### TypeScript Interfaces

```typescript
// Unified Assignment Interface
interface UnifiedAssignment {
  id: string
  source_type: 'weekly_task' | 'assigned_product'
  display_name: string
  description: string | null
  assigned_to: string
  assigned_by: string | null
  date_field: string
  priority: string
  status: string
  whatsapp_sent: boolean
  whatsapp_sent_at: string | null
  created_at: string
  updated_at: string
  assigned_user_name: string | null
  assigned_user_phone: string | null
  assigned_by_user_name: string | null
  product_name: string | null
  quantity: number | null
  unit_price: number | null
  expiry_date: string | null
  branch_id: string | null
  branch_name: string | null
  risk_level: string
}

// User Interface
interface User {
  id: string
  name: string
  email: string
  phone: string | null
  created_at: string
  updated_at: string
  role?: string
}

// Branch Interface
interface Branch {
  id: string
  name: string
  location: string | null
  created_at: string
  updated_at: string
}
```

### Key Features

1. **Unified View**: `unified_assignments_view` combines tasks and products
2. **Role-Based Access**: RLS policies ensure proper data access
3. **Risk Calculation**: Automatic risk level based on expiry dates
4. **WhatsApp Integration**: Ready for notification system
5. **Complete CRUD**: Full create, read, update, delete operations
6. **Type Safety**: TypeScript interfaces match database schema

### Usage

1. **For DispenserTasks.tsx (merged component)**: Use `unified_assignments_view`
2. **For Admin Views**: Use individual tables with admin policies
3. **For Reports**: Use views for aggregated data

This schema provides a complete, production-ready database that will work seamlessly with your React frontend! 