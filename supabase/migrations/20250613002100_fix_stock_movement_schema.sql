-- Fix stock_movement_history table schema inconsistencies
-- This migration ensures the table structure matches the expected schema

-- First, check if we need to add missing columns or fix data types
DO $$ 
BEGIN
    -- Add from_branch_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'stock_movement_history' 
                   AND column_name = 'from_branch_id') THEN
        ALTER TABLE public.stock_movement_history 
        ADD COLUMN from_branch_id UUID REFERENCES public.branches(id);
    END IF;
    
    -- Add to_branch_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'stock_movement_history' 
                   AND column_name = 'to_branch_id') THEN
        ALTER TABLE public.stock_movement_history 
        ADD COLUMN to_branch_id UUID REFERENCES public.branches(id);
    END IF;
    
    -- Drop old TEXT columns if they exist and are no longer needed
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'stock_movement_history' 
               AND column_name = 'from_branch' 
               AND data_type = 'text') THEN
        ALTER TABLE public.stock_movement_history DROP COLUMN from_branch;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'stock_movement_history' 
               AND column_name = 'to_branch' 
               AND data_type = 'text') THEN
        ALTER TABLE public.stock_movement_history DROP COLUMN to_branch;
    END IF;
    
    -- Ensure for_dispenser column exists and is properly typed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'stock_movement_history' 
                   AND column_name = 'for_dispenser') THEN
        ALTER TABLE public.stock_movement_history 
        ADD COLUMN for_dispenser UUID REFERENCES public.users(id);
    END IF;
    
    -- Ensure moved_by column exists and is properly typed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'stock_movement_history' 
                   AND column_name = 'moved_by') THEN
        ALTER TABLE public.stock_movement_history 
        ADD COLUMN moved_by UUID REFERENCES public.users(id);
    END IF;
    
    -- Ensure movement_date column exists and is properly typed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'stock_movement_history' 
                   AND column_name = 'movement_date') THEN
        ALTER TABLE public.stock_movement_history 
        ADD COLUMN movement_date TIMESTAMP WITH TIME ZONE DEFAULT now();
    END IF;
    
    -- Ensure notes column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'stock_movement_history' 
                   AND column_name = 'notes') THEN
        ALTER TABLE public.stock_movement_history 
        ADD COLUMN notes TEXT;
    END IF;
    
    -- Ensure created_at and updated_at columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'stock_movement_history' 
                   AND column_name = 'created_at') THEN
        ALTER TABLE public.stock_movement_history 
        ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT now();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'stock_movement_history' 
                   AND column_name = 'updated_at') THEN
        ALTER TABLE public.stock_movement_history 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
    END IF;
    
END $$;

-- Ensure the table has the correct structure
-- This will create a clean table structure if there are any issues
CREATE TABLE IF NOT EXISTS public.stock_movement_history_new (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE CASCADE,
  movement_type TEXT,
  quantity_moved INTEGER NOT NULL,
  from_branch_id UUID REFERENCES public.branches(id),
  to_branch_id UUID REFERENCES public.branches(id),
  for_dispenser UUID REFERENCES public.users(id),
  moved_by UUID REFERENCES public.users(id),
  movement_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Copy data from old table to new table if needed
INSERT INTO public.stock_movement_history_new 
SELECT 
  id,
  stock_item_id,
  movement_type,
  quantity_moved,
  from_branch_id,
  to_branch_id,
  for_dispenser,
  moved_by,
  COALESCE(movement_date, created_at),
  notes,
  created_at,
  updated_at
FROM public.stock_movement_history
ON CONFLICT (id) DO NOTHING;

-- Drop old table and rename new one
DROP TABLE IF EXISTS public.stock_movement_history;
ALTER TABLE public.stock_movement_history_new RENAME TO stock_movement_history;

-- Re-enable RLS
ALTER TABLE public.stock_movement_history ENABLE ROW LEVEL SECURITY;

-- Recreate RLS policies
DROP POLICY IF EXISTS "All authenticated users can view stock movements" ON public.stock_movement_history;
DROP POLICY IF EXISTS "Authenticated users can insert stock movements" ON public.stock_movement_history;
DROP POLICY IF EXISTS "Users can update their own movement records" ON public.stock_movement_history;
DROP POLICY IF EXISTS "Admins can delete stock movements" ON public.stock_movement_history;

-- Create updated RLS policies
CREATE POLICY "All authenticated users can view stock movements" 
  ON public.stock_movement_history 
  FOR SELECT 
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert stock movements" 
  ON public.stock_movement_history 
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own movement records" 
  ON public.stock_movement_history 
  FOR UPDATE 
  TO authenticated
  USING (
    moved_by = auth.uid() OR 
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'system_admin') OR
    public.has_role(auth.uid(), 'regional_manager')
  );

CREATE POLICY "Admins can delete stock movements" 
  ON public.stock_movement_history 
  FOR DELETE 
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'system_admin') OR
    public.has_role(auth.uid(), 'regional_manager')
  );

-- Recreate the updated_at trigger
CREATE OR REPLACE TRIGGER update_stock_movement_history_updated_at
  BEFORE UPDATE ON public.stock_movement_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column(); 