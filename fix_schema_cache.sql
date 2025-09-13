-- FIX SCHEMA CACHE ISSUE
-- This fixes the relationship between dormant_stock and users

-- First, ensure the foreign key constraint exists properly
ALTER TABLE public.dormant_stock 
DROP CONSTRAINT IF EXISTS dormant_stock_uploaded_by_fkey;

-- Recreate the foreign key constraint with proper naming
ALTER TABLE public.dormant_stock 
ADD CONSTRAINT dormant_stock_uploaded_by_fkey 
FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Also ensure the branches foreign key exists
ALTER TABLE public.dormant_stock 
DROP CONSTRAINT IF EXISTS dormant_stock_branch_id_fkey;

ALTER TABLE public.dormant_stock 
ADD CONSTRAINT dormant_stock_branch_id_fkey 
FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;

-- Refresh the schema cache to recognize the relationships
NOTIFY pgrst, 'reload schema';

-- Also refresh the database schema
SELECT pg_notify('pgrst', 'reload schema');
