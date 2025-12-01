# Complete Back‑End Schema (SQL)

Below is a comprehensive SQL script that defines the database schema for your pharmacy inventory management system.  It creates tables, enumerations, functions, triggers, foreign‑key relationships and row‑level security (RLS) policies.  Run this script on an empty PostgreSQL database (Supabase uses PostgreSQL under the hood) to set up the back‑end.

> **Note:** Replace any dummy values (placeholders) with your actual project details (e.g. domain name, Twilio credentials) when deploying.  Secrets such as API keys and passwords should be stored in Supabase’s secret manager or environment variables【700840445378093†L194-L209】.

## 1. Extensions and prerequisites

Enable extensions used for UUID generation, HTTP requests and scheduled tasks:

```sql
-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable pg_net for http_post() if you plan to call webhooks from the database
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Enable pg_cron for scheduled jobs (used to automate AI notifications)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable vault (optional) for secure secret storage
CREATE EXTENSION IF NOT EXISTS vault;
```

## 2. Enumerations

Define enumerated types for roles, task priority, task status and notification types.  Enums help enforce valid values and make policies clearer.

```sql
-- Roles a user can have in the system
CREATE TYPE app_role AS ENUM (
  'system_admin',
  'branch_system_admin',
  'regional_manager',
  -- An administrator within a branch.  In the front‑end UI this is labelled
  -- “Admin” and has permissions similar to a branch manager or inventory assistant.
  'admin',
  'branch_manager',
  'inventory_assistant',
  'dispenser',
  'doctor'
);

-- Priority levels for weekly tasks
CREATE TYPE task_priority AS ENUM ('urgent','high','medium','low');

-- Status values for weekly tasks
CREATE TYPE task_status AS ENUM ('pending','in_progress','completed','overdue');

-- Types of WhatsApp notifications
CREATE TYPE notification_type AS ENUM ('weekly_task','emergency_assignment','general');

-- Status of WhatsApp notifications
CREATE TYPE notification_status AS ENUM ('pending','sent','failed');
```

## 3. Helper functions

Create helper functions used in policies and workflows.

### 3.1 Role checking function

This function checks whether the current authenticated user has a particular role.  It reads the user’s role from their JWT claims (supabase `auth.uid()` returns the `user_id` of the current session).  Adjust the field path (`role`) to match your JWT structure.

```sql
CREATE OR REPLACE FUNCTION public.has_role(uid uuid, role_to_check text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r app_role;
BEGIN
  SELECT role INTO r
  FROM public.user_roles ur
  WHERE ur.user_id = uid
  AND ur.role = role_to_check::app_role
  LIMIT 1;
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.has_role IS 'Check if a user has a specific role (used in RLS policies)';
```

### 3.2 Branch code generator

Generate a unique branch code with the format `BR0001`, `BR0002`, etc.  This function finds the highest existing code and increments it.  You can call it from your API or set it as a default in the branches table.

```sql
CREATE OR REPLACE FUNCTION public.generate_branch_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  max_code text;
  num_part integer;
BEGIN
  -- Find the highest branch code matching the BR#### pattern
  SELECT code INTO max_code
  FROM public.branches
  WHERE code ~ '^BR\\d{4}$'
  ORDER BY code DESC
  LIMIT 1;

  IF max_code IS NULL THEN
    RETURN 'BR0001';
  END IF;

  num_part := (regexp_replace(max_code, '\\D','','g'))::integer + 1;
  RETURN 'BR' || lpad(num_part::text, 4, '0');
END;
$$;
```

### 3.3 Timestamp trigger function

Many tables need to update their `updated_at` column automatically when a row changes.  This reusable function simplifies that.

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
```

## 4. Tables

### 4.1 Branches

Before defining user roles or stock items, create the `branches` table.  Other tables
reference this table via foreign keys, so defining it first avoids forward
reference errors when the script is executed.

```sql
CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  region text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Automatically update updated_at on change
CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

### 4.2 Users and roles

Supabase manages `auth.users` automatically, so you don’t create that table here.  Instead, create a mapping table to assign application roles and optionally associate users with branches.

```sql
-- Table to assign roles to users (one record per role assignment)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role, branch_id)
);

COMMENT ON TABLE public.user_roles IS 'Roles assigned to users (can be per-branch)';
```

### 4.3 Stock items and movements

```sql
-- Stock items held at branches
CREATE TABLE public.stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  expiry_date date NOT NULL,
  -- flag to mark items reserved for emergency use
  is_emergency boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Stock movement log (sell/move)
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  from_branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  to_branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  movement_type text NOT NULL CHECK (movement_type IN ('sell','move','adjust')),
  performed_by uuid NOT NULL REFERENCES auth.users(id),
  performed_at timestamptz NOT NULL DEFAULT NOW(),
  notes text
);

CREATE INDEX idx_stock_items_branch ON public.stock_items(branch_id);
CREATE INDEX idx_stock_movements_stock_item ON public.stock_movements(stock_item_id);

-- Movement history (immutable log).  This table records every stock movement or assignment event so
-- that you can audit changes over time.  It separates the log from the live `stock_movements`
-- table.  Each entry records who performed the movement, which branch the item moved from or to,
-- the quantity moved and optional notes.  Movement date defaults to now but can be overridden
-- when backfilling historical data.
CREATE TABLE public.stock_movement_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  movement_type text,
  quantity_moved integer NOT NULL CHECK (quantity_moved > 0),
  from_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  to_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  for_dispenser uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  moved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  movement_date timestamptz NOT NULL DEFAULT NOW(),
  notes text
);

-- Helpful indexes for efficient filtering
CREATE INDEX idx_stock_movement_history_stock_item ON public.stock_movement_history(stock_item_id);
CREATE INDEX idx_stock_movement_history_from_branch ON public.stock_movement_history(from_branch_id);
CREATE INDEX idx_stock_movement_history_to_branch ON public.stock_movement_history(to_branch_id);
CREATE INDEX idx_stock_movement_history_for_dispenser ON public.stock_movement_history(for_dispenser);
CREATE INDEX idx_stock_movement_history_moved_by ON public.stock_movement_history(moved_by);
```

### 4.4 Weekly tasks

```sql
CREATE TABLE public.weekly_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  priority task_priority NOT NULL DEFAULT 'medium',
  status task_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_weekly_tasks_updated_at
  BEFORE UPDATE ON public.weekly_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for filtering by assignee and due date
CREATE INDEX idx_weekly_tasks_assignee_due ON public.weekly_tasks(assigned_to, due_date);
```

### 4.5 Dormant stock

```sql
CREATE TABLE public.dormant_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  expiry_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_dormant_stock_updated_at
  BEFORE UPDATE ON public.dormant_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

### 4.6 Notes

```sql
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

### 4.7 WhatsApp notifications

```sql
CREATE TABLE public.whatsapp_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_phone text NOT NULL,
  message_content text NOT NULL,
  message_type notification_type NOT NULL,
  related_id uuid,
  status notification_status NOT NULL DEFAULT 'pending',
  twilio_sid text,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_whatsapp_notifications_updated_at
  BEFORE UPDATE ON public.whatsapp_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

### 4.7a Notifications

In addition to WhatsApp notifications, the application tracks general notifications in a simple
`notifications` table.  Each notification is linked to a user and optionally a stock item.  Users
can mark notifications as read.  This table can be used to display in‑app alerts (e.g. when an
emergency assignment is created).

```sql
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  type text,
  stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_stock_item ON public.notifications(stock_item_id);
```
```

### 4.8 Emergency assignments

```sql
CREATE TABLE public.emergency_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  dispenser_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_quantity integer NOT NULL CHECK (assigned_quantity > 0),
  deadline timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_emergency_assignments_updated_at
  BEFORE UPDATE ON public.emergency_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_emergency_assignments_stock_item ON public.emergency_assignments(stock_item_id);
CREATE INDEX idx_emergency_assignments_dispenser ON public.emergency_assignments(dispenser_id);
CREATE INDEX idx_emergency_assignments_status ON public.emergency_assignments(status);
CREATE INDEX idx_stock_items_emergency ON public.stock_items(is_emergency);
```

### 4.9 AI recommendations log

```sql
CREATE TABLE public.ai_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispenser_id uuid NOT NULL REFERENCES auth.users(id),
  recommendation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

### 4.10 Users‑with‑roles view

The front‑end frequently needs a list of users together with their assigned role and branch name.  Rather than
joining tables on the client, this view exposes that data in one place.  Each row contains the user’s ID,
email, display name (falling back to the email if a name is not provided), their role, and the associated
branch name and code.  You can extend this view to include additional columns from `auth.users` or
`user_roles` as needed.

```sql
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
```
```

## 5. Row‑level security (RLS)

Supabase requires you to enable RLS on each table and then define policies that control which rows users can see or modify.  Policies act as additional `WHERE` clauses that must evaluate to true for the query to succeed【971104836784393†L208-L235】.  Below are example policies; adjust them to suit your organisation’s rules.

```sql
-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dormant_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;

-- Enable RLS on new tables
ALTER TABLE public.stock_movement_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Allow system and branch system admins to manage all branches
CREATE POLICY "Admins manage branches" ON public.branches
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin') OR public.has_role(auth.uid(), 'branch_system_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'system_admin') OR public.has_role(auth.uid(), 'branch_system_admin'));

-- Allow any authenticated user to read branches (for dropdown lists)
CREATE POLICY "All authenticated users can view branches" ON public.branches
  FOR SELECT
  USING (auth.role() IN ('authenticated','service_role'));

 -- Stock items: view items in your branch; branch system admins and regional managers can view all
 CREATE POLICY "Select stock items for own branch" ON public.stock_items
   FOR SELECT
   USING (
     public.has_role(auth.uid(), 'system_admin')
     OR public.has_role(auth.uid(), 'branch_system_admin')
     OR public.has_role(auth.uid(), 'regional_manager')
     OR EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.branch_id = branch_id
     )
   );

 CREATE POLICY "Manage stock items for own branch (authorised roles)" ON public.stock_items
   FOR INSERT, UPDATE, DELETE
   USING (
     public.has_role(auth.uid(), 'system_admin')
     OR public.has_role(auth.uid(), 'branch_system_admin')
     OR public.has_role(auth.uid(), 'regional_manager')
     OR public.has_role(auth.uid(), 'branch_manager')
     OR public.has_role(auth.uid(), 'inventory_assistant')
     OR public.has_role(auth.uid(), 'admin')
   )
   WITH CHECK (
     public.has_role(auth.uid(), 'system_admin')
     OR public.has_role(auth.uid(), 'branch_system_admin')
     OR public.has_role(auth.uid(), 'regional_manager')
     OR EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.branch_id = branch_id
     )
   );

-- Weekly tasks: assignees and managers can view; only creators/editors can modify
CREATE POLICY "View own tasks" ON public.weekly_tasks
  FOR SELECT
  USING (assigned_to = auth.uid());

-- Branch‑level managers (branch managers, inventory assistants and admins) can view tasks only
-- in their branch.  High‑level managers (branch system admins and regional managers) can
-- view tasks across all branches.  Dispensers always see their own tasks via the
-- "View own tasks" policy above.
CREATE POLICY "Branch‑level managers view tasks in their branch" ON public.weekly_tasks
  FOR SELECT
  USING (
    (
      public.has_role(auth.uid(), 'branch_manager')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'inventory_assistant')
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.branch_id = weekly_tasks.branch_id
    )
  );

CREATE POLICY "High‑level managers view tasks across branches" ON public.weekly_tasks
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'system_admin')
  );

CREATE POLICY "Create/update tasks (admins, managers)" ON public.weekly_tasks
  FOR INSERT, UPDATE, DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'regional_manager')
  );

-- Dormant stock: view/update only within your branch for authorised roles
CREATE POLICY "View dormant stock for own branch" ON public.dormant_stock
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.branch_id = dormant_stock.branch_id
    )
  );

CREATE POLICY "Manage dormant stock (authorised roles)" ON public.dormant_stock
  FOR INSERT, UPDATE, DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'inventory_assistant')
    OR public.has_role(auth.uid(), 'admin')
  );

-- Notes: authors can manage their own notes; admins and managers can view branch notes
CREATE POLICY "Authors manage their notes" ON public.notes
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Branch‑level managers (branch managers, inventory assistants and admins) can view notes only
-- for their branch.  High‑level managers (branch system admins and regional managers) can
-- view notes across all branches.
CREATE POLICY "Branch‑level managers view notes in their branch" ON public.notes
  FOR SELECT
  USING (
    (
      public.has_role(auth.uid(), 'branch_manager')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'inventory_assistant')
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.branch_id = notes.branch_id
    )
  );

CREATE POLICY "High‑level managers view notes across branches" ON public.notes
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'system_admin')
  );

-- WhatsApp notifications: only system admins and service roles can read/write
CREATE POLICY "Manage WhatsApp notifications (system admins only)" ON public.whatsapp_notifications
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin') OR auth.role() = 'service_role')
  WITH CHECK (public.has_role(auth.uid(), 'system_admin') OR auth.role() = 'service_role');

-- Emergency assignments: allow anyone to view; only admins can create/update
CREATE POLICY "View emergency assignments" ON public.emergency_assignments
  FOR SELECT
  USING (TRUE);

CREATE POLICY "Admins manage emergency assignments" ON public.emergency_assignments
  FOR INSERT, UPDATE, DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'admin')
  );

-- AI recommendations: users can view their own recommendations
CREATE POLICY "View own AI recommendations" ON public.ai_recommendations
  FOR SELECT
  USING (dispenser_id = auth.uid());

-- Only service role can insert AI recommendations (Edge function uses service role key)
CREATE POLICY "Service role inserts AI recommendations" ON public.ai_recommendations
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Stock movement history: viewable by authorised users and participants.  High‑level managers
-- can view all; branch‑level users can view records for their branch; individual dispensers and
-- movers can view their own records.  Insertions are restricted to authorised roles and
-- must match the user’s branch.  Updates and deletes are limited to system and branch
-- administrators.
CREATE POLICY "Select stock movement history" ON public.stock_movement_history
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR for_dispenser = auth.uid()
    OR moved_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (ur.branch_id = from_branch_id OR ur.branch_id = to_branch_id)
    )
  );

CREATE POLICY "Insert stock movement history" ON public.stock_movement_history
  FOR INSERT
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'system_admin')
      OR public.has_role(auth.uid(), 'branch_system_admin')
      OR public.has_role(auth.uid(), 'regional_manager')
      OR public.has_role(auth.uid(), 'branch_manager')
      OR public.has_role(auth.uid(), 'inventory_assistant')
      OR public.has_role(auth.uid(), 'dispenser')
      OR public.has_role(auth.uid(), 'admin')
    )
    AND (
      NEW.from_branch_id IS NULL OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.branch_id = NEW.from_branch_id
      )
    )
    AND (
      NEW.to_branch_id IS NULL OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.branch_id = NEW.to_branch_id
      )
    )
  );

CREATE POLICY "Admins manage stock movement history" ON public.stock_movement_history
  FOR UPDATE, DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
  );

-- Notifications: users can view and update their own notifications.  System admins and
-- service role can insert notifications (e.g. generated by Edge functions).
CREATE POLICY "Users view their notifications" ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users mark notifications as read" ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "System/service inserts notifications" ON public.notifications
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin')
    OR auth.role() = 'service_role'
  );

-- Stock movements: authorised users can view and create movement records
CREATE POLICY "Select stock movements for own branch" ON public.stock_movements
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (ur.branch_id = stock_movements.from_branch_id OR ur.branch_id = stock_movements.to_branch_id)
    )
  );

CREATE POLICY "Insert stock movements (authorised roles)" ON public.stock_movements
  FOR INSERT
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'system_admin')
      OR public.has_role(auth.uid(), 'branch_system_admin')
      OR public.has_role(auth.uid(), 'regional_manager')
      OR public.has_role(auth.uid(), 'branch_manager')
      OR public.has_role(auth.uid(), 'inventory_assistant')
      OR public.has_role(auth.uid(), 'dispenser')
      OR public.has_role(auth.uid(), 'admin')
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.branch_id = NEW.from_branch_id
    )
  );

CREATE POLICY "Admins manage stock movements" ON public.stock_movements
  FOR UPDATE, DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
  );

-- Grant privileges to anon and authenticated roles (for public tables)
-- These grants define baseline access; policies further restrict row access
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
```

## 6. Scheduling AI notifications

To run your AI notification function automatically (e.g. daily at 08:00 UTC), use the `pg_cron` extension to call your Edge function via `pg_net` as shown below.  Replace `<project-url>` and `<anon-key>` with your Supabase project URL and anon key.

```sql
SELECT cron.schedule(
  'daily_ai_notifications',      -- job name
  '0 8 * * *',                  -- cron expression: 08:00 UTC daily
  $$
  SELECT net.http_post(
    url := '<project-url>/functions/v1/ai-alert',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer <anon-key>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

This schedules a daily job that makes an HTTP POST request to your `ai-alert` Edge function to generate and send recommendations automatically.

## 7. Final remarks

This SQL script defines a robust back‑end architecture with role‑based access control, comprehensive RLS policies and helper functions.  It lays the foundation for a feature‑rich inventory management system that supports dynamic branches, role assignments, stock tracking, task assignments, dormant stock management, emergency handling and AI recommendations.  Policies have been tuned to reflect your business rules: system and branch system administrators can manage everything; regional managers and branch managers have expanded viewing and editing privileges; dispensers and doctors have limited access scoped to their branch.  When deploying to Supabase, always store your API keys and secrets securely using the built‑in secret manager or Vault.  For example, you can store your Twilio and OpenAI keys securely with:

```sql
-- Store secrets in the Vault (see Supabase docs for details)
select vault.create_secret('twilio_account_sid', 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
select vault.create_secret('twilio_auth_token', 'your-auth-token');
select vault.create_secret('twilio_whatsapp_number', 'whatsapp:+14155238886');
select vault.create_secret('openai_api_key', 'sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
```

These secrets can then be retrieved in your Edge functions or Postgres functions, ensuring that sensitive values are never exposed in your code【700840445378093†L194-L209】.