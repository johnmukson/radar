-- FIX INFINITE RECURSION ERROR
-- This fixes the circular dependency in user_roles policies

-- First, drop all existing policies that cause recursion
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;
DROP POLICY IF EXISTS "dormant_stock_select_policy" ON public.dormant_stock;
DROP POLICY IF EXISTS "dormant_stock_insert_policy" ON public.dormant_stock;
DROP POLICY IF EXISTS "dormant_stock_update_policy" ON public.dormant_stock;
DROP POLICY IF EXISTS "dormant_stock_delete_policy" ON public.dormant_stock;

-- Create simple, non-recursive policies for user_roles
-- Allow users to read their own role
CREATE POLICY "user_roles_select_own" ON public.user_roles
    FOR SELECT USING (user_id = auth.uid());

-- Allow authenticated users to read all roles (for role checking)
CREATE POLICY "user_roles_select_all" ON public.user_roles
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert (for user creation)
CREATE POLICY "user_roles_insert" ON public.user_roles
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow users to update their own role
CREATE POLICY "user_roles_update_own" ON public.user_roles
    FOR UPDATE USING (user_id = auth.uid());

-- Create simple policies for dormant_stock that don't depend on user_roles
-- Allow all authenticated users to read
CREATE POLICY "dormant_stock_read" ON public.dormant_stock
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow all authenticated users to insert
CREATE POLICY "dormant_stock_insert" ON public.dormant_stock
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow all authenticated users to update
CREATE POLICY "dormant_stock_update" ON public.dormant_stock
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Allow all authenticated users to delete
CREATE POLICY "dormant_stock_delete" ON public.dormant_stock
    FOR DELETE USING (auth.role() = 'authenticated');

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
