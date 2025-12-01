-- Migration: Compatibility Fixes for Frontend
-- Description: Add missing fields and tables that the frontend expects
-- This bridges the gap between the clean backend.md schema and the existing frontend code

-- ============================================================================
-- STEP 0: Add missing helper function
-- Frontend RLS policies use has_write_access function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_write_access(_user_id uuid, _branch_id uuid DEFAULT NULL) 
RETURNS boolean 
LANGUAGE sql 
STABLE SECURITY DEFINER AS $$ 
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND role IN ('admin', 'system_admin', 'regional_manager', 'branch_system_admin', 'branch_manager', 'inventory_assistant', 'dispenser')
    AND (_branch_id IS NULL OR branch_id = _branch_id OR role IN ('regional_manager', 'system_admin'))
  ) 
$$;

-- Alternative function name used in some policies
CREATE OR REPLACE FUNCTION public.can_modify_data(_user_id uuid, _branch_id uuid DEFAULT NULL) 
RETURNS boolean 
LANGUAGE sql 
STABLE SECURITY DEFINER AS $$ 
  SELECT public.has_write_access(_user_id, _branch_id)
$$;

-- ============================================================================
-- STEP 1: Create users table (separate from auth.users)
-- Frontend expects a users table for user management
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- RLS policies for users (from existing remote schema)
CREATE POLICY "Allow users to view their own profile" ON public.users
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Allow users to update their own profile" ON public.users
  FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Allow users to insert their own user record" ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins and managers can view users" ON public.users
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'regional_manager')
  );

CREATE POLICY "System admins can manage all users" ON public.users
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin'));

-- ============================================================================
-- STEP 2: Add missing columns to stock_items table
-- Frontend expects many additional fields for stock management
-- ============================================================================

ALTER TABLE public.stock_items 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'moved', 'expired', 'disposed')),
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_strategy TEXT,
  ADD COLUMN IF NOT EXISTS date_assigned TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS emergency_declared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS emergency_declared_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority TEXT,
  ADD COLUMN IF NOT EXISTS priority_score INTEGER,
  ADD COLUMN IF NOT EXISTS risk_level TEXT,
  ADD COLUMN IF NOT EXISTS days_to_expiry INTEGER,
  ADD COLUMN IF NOT EXISTS quantity_moved INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS is_high_value BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_stock_items_status ON public.stock_items(status);
CREATE INDEX IF NOT EXISTS idx_stock_items_assigned_to ON public.stock_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_stock_items_priority ON public.stock_items(priority);
CREATE INDEX IF NOT EXISTS idx_stock_items_risk_level ON public.stock_items(risk_level);

-- ============================================================================
-- STEP 3: Update weekly_tasks table for frontend compatibility
-- Frontend expects TEXT priority/status (not ENUMs) and no branch_id
-- ============================================================================

-- Note: We can't easily remove branch_id if it's already used, so we'll keep it
-- but make it nullable. Frontend doesn't use it, so it won't cause issues.

-- Change ENUMs to TEXT (if they exist as ENUMs)
-- First, check if we need to convert
DO $$
BEGIN
  -- If priority is an ENUM, convert to TEXT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'weekly_tasks' 
    AND column_name = 'priority'
    AND data_type = 'USER-DEFINED'
  ) THEN
    -- Convert ENUM to TEXT
    ALTER TABLE public.weekly_tasks 
    ALTER COLUMN priority TYPE TEXT USING priority::TEXT;
  END IF;

  -- If status is an ENUM, convert to TEXT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'weekly_tasks' 
    AND column_name = 'status'
    AND data_type = 'USER-DEFINED'
  ) THEN
    -- Convert ENUM to TEXT
    ALTER TABLE public.weekly_tasks 
    ALTER COLUMN status TYPE TEXT USING status::TEXT;
  END IF;
END $$;

-- Add missing columns
ALTER TABLE public.weekly_tasks 
  ADD COLUMN IF NOT EXISTS whatsapp_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ;

-- Make branch_id nullable (frontend doesn't use it)
ALTER TABLE public.weekly_tasks 
  ALTER COLUMN branch_id DROP NOT NULL;

-- ============================================================================
-- STEP 4: Transform notes table to messaging structure
-- Frontend expects messaging system with is_public, created_by, recipient_id
-- ============================================================================

-- Add new columns for messaging structure
ALTER TABLE public.notes 
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.notes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Migrate data: if user_id exists, copy to created_by
UPDATE public.notes 
SET created_by = user_id 
WHERE created_by IS NULL AND user_id IS NOT NULL;

-- Set default is_public for existing notes
UPDATE public.notes 
SET is_public = true 
WHERE is_public IS NULL;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_notes_created_by ON public.notes(created_by);
CREATE INDEX IF NOT EXISTS idx_notes_parent_id ON public.notes(parent_id);
CREATE INDEX IF NOT EXISTS idx_notes_is_public ON public.notes(is_public);
CREATE INDEX IF NOT EXISTS idx_notes_recipient_id ON public.notes(recipient_id);

-- Note: We keep both user_id/branch_id AND created_by/recipient_id for compatibility
-- Frontend uses created_by/recipient_id, but old data might use user_id/branch_id

-- Update RLS policies for messaging structure
DROP POLICY IF EXISTS "Authors manage their notes" ON public.notes;
DROP POLICY IF EXISTS "Branch-level managers view notes in their branch" ON public.notes;
DROP POLICY IF EXISTS "High-level managers view notes across branches" ON public.notes;

-- New messaging policies
CREATE POLICY "Anyone can read public notes" ON public.notes
  FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can read their private messages" ON public.notes
  FOR SELECT
  USING (
    auth.uid() = created_by 
    OR auth.uid() = recipient_id
  );

CREATE POLICY "Authenticated users can insert public notes" ON public.notes
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated' 
    AND is_public = true 
    AND auth.uid() = created_by
  );

CREATE POLICY "Authenticated users can send private messages" ON public.notes
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated' 
    AND is_public = false 
    AND auth.uid() = created_by 
    AND recipient_id IS NOT NULL
  );

CREATE POLICY "Users can update their own notes" ON public.notes
  FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own notes" ON public.notes
  FOR DELETE
  USING (auth.uid() = created_by);

-- ============================================================================
-- STEP 5: Add triggers for stock_items value calculation
-- Frontend expects is_high_value and value to be calculated
-- ============================================================================

-- Function to calculate value and is_high_value
CREATE OR REPLACE FUNCTION public.update_stock_item_attributes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Calculate value
  NEW.value := NEW.quantity * NEW.unit_price;
  
  -- Calculate is_high_value (>= 100,000)
  NEW.is_high_value := (NEW.value >= 100000);
  
  -- Calculate days_to_expiry
  NEW.days_to_expiry := EXTRACT(DAY FROM (NEW.expiry_date - CURRENT_DATE));
  
  -- Update last_updated fields
  NEW.last_updated_at := NOW();
  NEW.last_updated_by := auth.uid();
  
  RETURN NEW;
END;
$$;

-- Trigger for stock_items
DROP TRIGGER IF EXISTS trg_update_stock_item_attributes ON public.stock_items;
CREATE TRIGGER trg_update_stock_item_attributes
  BEFORE INSERT OR UPDATE OF expiry_date, quantity, unit_price ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_item_attributes();

-- Function for is_high_value (alternative approach)
CREATE OR REPLACE FUNCTION public.set_is_high_value()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_high_value := ((NEW.quantity * NEW.unit_price) >= 100000);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_is_high_value ON public.stock_items;
CREATE TRIGGER trg_set_is_high_value
  BEFORE INSERT OR UPDATE ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.set_is_high_value();

-- ============================================================================
-- STEP 6: Update RLS policies for new structure
-- ============================================================================

-- Update stock_items policies to match frontend expectations
DROP POLICY IF EXISTS "Select stock items for own branch" ON public.stock_items;
DROP POLICY IF EXISTS "Insert stock items for own branch (authorised roles)" ON public.stock_items;
DROP POLICY IF EXISTS "Update stock items for own branch (authorised roles)" ON public.stock_items;
DROP POLICY IF EXISTS "Delete stock items for own branch (authorised roles)" ON public.stock_items;

-- Allow all authenticated users to view (for doctor role support)
CREATE POLICY "All authenticated users can view stock items" ON public.stock_items
  FOR SELECT
  TO authenticated
  USING (true);

-- Non-doctors can modify
CREATE POLICY "Non-doctors can insert stock items" ON public.stock_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_write_access(auth.uid(), branch_id));

CREATE POLICY "Non-doctors can update stock items" ON public.stock_items
  FOR UPDATE
  TO authenticated
  USING (public.has_write_access(auth.uid(), branch_id));

CREATE POLICY "Non-doctors can delete stock items" ON public.stock_items
  FOR DELETE
  TO authenticated
  USING (public.has_write_access(auth.uid(), branch_id));

-- System admins can manage all
CREATE POLICY "System admins can manage all stock items" ON public.stock_items
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin'));

-- ============================================================================
-- STEP 7: Grant necessary permissions
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

