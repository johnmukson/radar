-- IMMEDIATE FIX - Run this in Supabase SQL Editor right now
-- This will give you immediate access to the dormant_stock table

-- Temporarily disable RLS to allow access
ALTER TABLE public.dormant_stock DISABLE ROW LEVEL SECURITY;

-- Grant all permissions to authenticated users
GRANT ALL ON public.dormant_stock TO authenticated;
GRANT ALL ON public.dormant_stock TO anon;

-- Refresh schema
NOTIFY pgrst, 'reload schema';
