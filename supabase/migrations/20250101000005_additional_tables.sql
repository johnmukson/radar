-- Migration: Additional Tables
-- Description: Create weekly_tasks, dormant_stock, notes, notifications, whatsapp_notifications, emergency_assignments, ai_recommendations

-- 4.4 Weekly tasks
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

-- 4.5 Dormant stock
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

-- 4.6 Notes
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

-- 4.7 WhatsApp notifications
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

-- 4.7a Notifications
-- General notifications table for in-app alerts
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

-- 4.8 Emergency assignments
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

-- 4.9 AI recommendations log
CREATE TABLE public.ai_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispenser_id uuid NOT NULL REFERENCES auth.users(id),
  recommendation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

