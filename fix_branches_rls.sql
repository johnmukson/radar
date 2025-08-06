-- Quick fix to allow frontend access to branches table
-- This disables RLS on the branches table

-- 1. Disable RLS on branches table
ALTER TABLE public.branches DISABLE ROW LEVEL SECURITY;

-- 2. Grant permissions to anon and authenticated users
GRANT SELECT ON public.branches TO anon;
GRANT SELECT ON public.branches TO authenticated;

-- 3. Verify the fix
SELECT 'RLS disabled on branches table!' as status;
SELECT COUNT(*) as branch_count FROM public.branches;
SELECT name, code FROM public.branches WHERE LOWER(name) LIKE '%munyonyo%'; 