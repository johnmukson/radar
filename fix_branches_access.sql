-- Fix branches table access for frontend
-- This script will ensure the frontend can access the branches table

-- 1. Disable RLS on branches table to allow frontend access
ALTER TABLE public.branches DISABLE ROW LEVEL SECURITY;

-- 2. Create a permissive policy for branches (if RLS is re-enabled later)
DROP POLICY IF EXISTS "Anyone can view branches" ON public.branches;
CREATE POLICY "Anyone can view branches" ON public.branches FOR SELECT USING (true);

-- 3. Grant necessary permissions
GRANT SELECT ON public.branches TO anon;
GRANT SELECT ON public.branches TO authenticated;

-- 4. Verify branches exist and are accessible
SELECT 'Branches table access fixed!' as status;
SELECT COUNT(*) as branch_count FROM public.branches;
SELECT name, code FROM public.branches WHERE LOWER(name) LIKE '%munyonyo%'; 