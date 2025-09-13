-- Fix permissions for dormant_stock table
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can manage all dormant stock" ON public.dormant_stock;
DROP POLICY IF EXISTS "Branch admins can manage their branch dormant stock" ON public.dormant_stock;

-- Create more permissive policies for testing
CREATE POLICY "Enable read access for authenticated users" ON public.dormant_stock
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON public.dormant_stock
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON public.dormant_stock
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON public.dormant_stock
    FOR DELETE USING (auth.role() = 'authenticated');

-- Alternative: Temporarily disable RLS for testing (NOT recommended for production)
-- ALTER TABLE public.dormant_stock DISABLE ROW LEVEL SECURITY;
