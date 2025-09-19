-- Enable dormant stock access for all authenticated users
-- This script updates the dormant_stock table permissions to allow all authenticated users

-- First, check current policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'dormant_stock';

-- Drop all existing restrictive policies
DROP POLICY IF EXISTS "dormant_stock_select_policy" ON public.dormant_stock;
DROP POLICY IF EXISTS "dormant_stock_insert_policy" ON public.dormant_stock;
DROP POLICY IF EXISTS "dormant_stock_update_policy" ON public.dormant_stock;
DROP POLICY IF EXISTS "dormant_stock_delete_policy" ON public.dormant_stock;
DROP POLICY IF EXISTS "Admins can manage all dormant stock" ON public.dormant_stock;
DROP POLICY IF EXISTS "Branch admins can manage their branch dormant stock" ON public.dormant_stock;
DROP POLICY IF EXISTS "Authenticated users can read dormant stock" ON public.dormant_stock;
DROP POLICY IF EXISTS "Authenticated users can insert dormant stock" ON public.dormant_stock;
DROP POLICY IF EXISTS "Authenticated users can update dormant stock" ON public.dormant_stock;
DROP POLICY IF EXISTS "Authenticated users can delete dormant stock" ON public.dormant_stock;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.dormant_stock;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.dormant_stock;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.dormant_stock;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.dormant_stock;
DROP POLICY IF EXISTS "Admin users can manage dormant stock" ON public.dormant_stock;
DROP POLICY IF EXISTS "dormant_stock_read" ON public.dormant_stock;
DROP POLICY IF EXISTS "dormant_stock_insert" ON public.dormant_stock;
DROP POLICY IF EXISTS "dormant_stock_update" ON public.dormant_stock;
DROP POLICY IF EXISTS "dormant_stock_delete" ON public.dormant_stock;

-- Create new policies that allow all authenticated users
CREATE POLICY "dormant_stock_read_all_authenticated" ON public.dormant_stock
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "dormant_stock_insert_all_authenticated" ON public.dormant_stock
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "dormant_stock_update_all_authenticated" ON public.dormant_stock
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "dormant_stock_delete_all_authenticated" ON public.dormant_stock
    FOR DELETE USING (auth.role() = 'authenticated');

-- Grant table permissions to authenticated role
GRANT ALL ON public.dormant_stock TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';

-- Verify the new policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'dormant_stock'
ORDER BY policyname;
