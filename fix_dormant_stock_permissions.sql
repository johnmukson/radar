-- Fix permissions for dormant_stock table
-- Run this in your Supabase SQL editor

-- First, let's check if the table exists and what policies are currently set
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

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can manage all dormant stock" ON public.dormant_stock;

-- Create more permissive policies for testing
-- Allow authenticated users to read dormant stock
CREATE POLICY "Authenticated users can read dormant stock" ON public.dormant_stock
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert dormant stock
CREATE POLICY "Authenticated users can insert dormant stock" ON public.dormant_stock
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update dormant stock
CREATE POLICY "Authenticated users can update dormant stock" ON public.dormant_stock
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Allow authenticated users to delete dormant stock
CREATE POLICY "Authenticated users can delete dormant stock" ON public.dormant_stock
    FOR DELETE USING (auth.role() = 'authenticated');

-- Alternative: If you want admin-only access, use this instead:
/*
-- Admin-only policies (uncomment if you prefer this approach)
CREATE POLICY "Admin users can manage dormant stock" ON public.dormant_stock
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() 
            AND role IN ('admin', 'system_admin')
        )
    );
*/

-- Grant table permissions to authenticated role
GRANT ALL ON public.dormant_stock TO authenticated;

-- Grant usage on the sequence (if using auto-increment)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';
