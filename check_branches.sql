-- Check if branches table exists and has data
SELECT 'Checking branches table...' as status;

-- Check if table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'branches'
) as table_exists;

-- Count branches
SELECT COUNT(*) as branch_count FROM public.branches;

-- Show all branches
SELECT id, name, code, region, status 
FROM public.branches 
ORDER BY name;

-- Check if Munyonyo branch exists specifically
SELECT id, name, code 
FROM public.branches 
WHERE LOWER(name) LIKE '%munyonyo%' 
OR LOWER(code) LIKE '%mun%'; 