-- Complete Branches Setup Script
-- This will ensure all 20 branches are properly inserted and accessible

-- 1. First, let's see what's currently in the branches table
SELECT 'Current branches in database:' as status;
SELECT id, name, code, region, status FROM public.branches ORDER BY name;

-- 2. Clear existing branches (optional - uncomment if you want to start fresh)
-- DELETE FROM public.branches;

-- 3. Insert all 20 Uganda branches
INSERT INTO public.branches (name, code, region, status) VALUES 
('Gayaza', 'GAY001', 'Central', 'active'),
('Kira', 'KIR002', 'Central', 'active'),
('Burton Street', 'BUR003', 'Central', 'active'),
('Gulu', 'GUL004', 'Northern', 'active'),
('Jinja 1', 'JIN005', 'Eastern', 'active'),
('Jinja 2', 'JIN006', 'Eastern', 'active'),
('Kabalagala', 'KAB007', 'Central', 'active'),
('Kansanga', 'KAN008', 'Central', 'active'),
('Kiruddu', 'KIR009', 'Central', 'active'),
('Kisementi', 'KIS010', 'Central', 'active'),
('Kintintale', 'KIN011', 'Central', 'active'),
('Mbale', 'MBA012', 'Eastern', 'active'),
('Mbarara', 'MBR013', 'Western', 'active'),
('Naalya', 'NAA014', 'Central', 'active'),
('Mukono', 'MUK015', 'Central', 'active'),
('Munyonyo', 'MUN016', 'Central', 'active'),
('Najjera', 'NAJ017', 'Central', 'active'),
('Ntinda', 'NTI018', 'Central', 'active'),
('Wandegeya', 'WAN019', 'Central', 'active'),
('Bbunga', 'BBU020', 'Central', 'active')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    region = EXCLUDED.region,
    status = EXCLUDED.status;

-- 4. Disable RLS on branches table to ensure frontend access
ALTER TABLE public.branches DISABLE ROW LEVEL SECURITY;

-- 5. Grant necessary permissions
GRANT SELECT ON public.branches TO anon;
GRANT SELECT ON public.branches TO authenticated;

-- 6. Verify the setup
SELECT 'Branches setup complete!' as status;
SELECT COUNT(*) as total_branches FROM public.branches;
SELECT name, code FROM public.branches WHERE LOWER(name) LIKE '%munyonyo%';
SELECT name, code FROM public.branches ORDER BY name; 