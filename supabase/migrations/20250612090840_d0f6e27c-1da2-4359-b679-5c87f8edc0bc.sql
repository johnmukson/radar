
-- First, let's ensure all tables have proper UUID primary keys and constraints

-- Update dispensers table structure
ALTER TABLE public.dispensers 
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

-- Create function to update updated_at column if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to update updated_at automatically for dispensers
CREATE OR REPLACE TRIGGER update_dispensers_updated_at
  BEFORE UPDATE ON public.dispensers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create enums (drop and recreate to handle existing ones)
DO $$ BEGIN
  CREATE TYPE stock_status AS ENUM ('pending', 'assigned', 'moved', 'expired', 'disposed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE risk_level_type AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE priority_type AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Update stock_items table structure
ALTER TABLE public.stock_items 
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN last_updated_at SET DEFAULT now();

-- Add trigger to update updated_at automatically for stock_items
CREATE OR REPLACE TRIGGER update_stock_items_updated_at
  BEFORE UPDATE ON public.stock_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update notifications table structure
ALTER TABLE public.notifications 
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN created_at SET DEFAULT now();

-- Update stock_movement_history table structure
ALTER TABLE public.stock_movement_history 
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN movement_date SET DEFAULT now();

-- Add foreign key constraints (with error handling)
DO $$ BEGIN
  ALTER TABLE public.stock_movement_history
    ADD CONSTRAINT fk_stock_movement_stock_item 
    FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.stock_movement_history
    ADD CONSTRAINT fk_stock_movement_dispenser 
    FOREIGN KEY (for_dispenser) REFERENCES public.dispensers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications
    ADD CONSTRAINT fk_notifications_stock_item 
    FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.stock_items
    ADD CONSTRAINT fk_stock_items_assigned_to 
    FOREIGN KEY (assigned_to) REFERENCES public.dispensers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stock_items_expiry_date ON public.stock_items(expiry_date);
CREATE INDEX IF NOT EXISTS idx_stock_items_branch ON public.stock_items(branch);
CREATE INDEX IF NOT EXISTS idx_stock_items_status ON public.stock_items(status);
CREATE INDEX IF NOT EXISTS idx_stock_items_assigned_to ON public.stock_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_dispensers_branch ON public.dispensers(branch);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);

-- Enable Row Level Security on all tables
ALTER TABLE public.dispensers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movement_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (with error handling for existing policies)
DO $$ BEGIN
  CREATE POLICY "Users can view all dispensers" ON public.dispensers
    FOR SELECT TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert dispensers" ON public.dispensers
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update dispensers" ON public.dispensers
    FOR UPDATE TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view all stock items" ON public.stock_items
    FOR SELECT TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert stock items" ON public.stock_items
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update stock items" ON public.stock_items
    FOR UPDATE TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete stock items" ON public.stock_items
    FOR DELETE TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view all notifications" ON public.notifications
    FOR SELECT TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert notifications" ON public.notifications
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update notifications" ON public.notifications
    FOR UPDATE TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view all stock movements" ON public.stock_movement_history
    FOR SELECT TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert stock movements" ON public.stock_movement_history
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view all users" ON public.users
    FOR SELECT TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert users" ON public.users
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update users" ON public.users
    FOR UPDATE TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add validation function for dates
CREATE OR REPLACE FUNCTION validate_expiry_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expiry_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Expiry date cannot be in the past';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for expiry date validation
DO $$ BEGIN
  CREATE TRIGGER validate_stock_item_expiry_date
    BEFORE INSERT OR UPDATE ON public.stock_items
    FOR EACH ROW
    EXECUTE FUNCTION validate_expiry_date();
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Function to calculate days to expiry and priority score
CREATE OR REPLACE FUNCTION calculate_stock_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate days to expiry
  NEW.days_to_expiry := (NEW.expiry_date - CURRENT_DATE);
  
  -- Calculate risk level based on days to expiry
  IF NEW.days_to_expiry <= 7 THEN
    NEW.risk_level := 'critical';
  ELSIF NEW.days_to_expiry <= 30 THEN
    NEW.risk_level := 'high';
  ELSIF NEW.days_to_expiry <= 90 THEN
    NEW.risk_level := 'medium';
  ELSE
    NEW.risk_level := 'low';
  END IF;
  
  -- Calculate priority score (higher score = higher priority)
  NEW.priority_score := (NEW.quantity * NEW.unit_price) / GREATEST(NEW.days_to_expiry, 1);
  
  -- Calculate total value
  NEW.value := NEW.quantity * NEW.unit_price;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for automatic calculations
DO $$ BEGIN
  CREATE TRIGGER calculate_stock_item_metrics
    BEFORE INSERT OR UPDATE ON public.stock_items
    FOR EACH ROW
    EXECUTE FUNCTION calculate_stock_metrics();
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
;
