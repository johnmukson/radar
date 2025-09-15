-- ====================================================================================
-- SCHEMA AUDIT QUERIES - Validate all table structures for dispenser tasks view
-- Run these queries in your Supabase SQL Editor to check table schemas
-- ====================================================================================

-- 1. Check weekly_tasks table structure
SELECT '=== WEEKLY_TASKS TABLE ===' as table_name;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'weekly_tasks' 
ORDER BY ordinal_position;

-- 2. Check emergency_assignments table structure
SELECT '=== EMERGENCY_ASSIGNMENTS TABLE ===' as table_name;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'emergency_assignments' 
ORDER BY ordinal_position;

-- 3. Check stock_items table structure
SELECT '=== STOCK_ITEMS TABLE ===' as table_name;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'stock_items' 
ORDER BY ordinal_position;

-- 4. Check users table structure
SELECT '=== USERS TABLE ===' as table_name;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'users' 
ORDER BY ordinal_position;

-- 5. Check branches table structure
SELECT '=== BRANCHES TABLE ===' as table_name;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'branches' 
ORDER BY ordinal_position;

-- 6. Check existing indexes on weekly_tasks
SELECT '=== WEEKLY_TASKS INDEXES ===' as index_info;
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'public' AND tablename = 'weekly_tasks';

-- 7. Check existing indexes on emergency_assignments
SELECT '=== EMERGENCY_ASSIGNMENTS INDEXES ===' as index_info;
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'public' AND tablename = 'emergency_assignments';

-- 8. Check existing indexes on stock_items
SELECT '=== STOCK_ITEMS INDEXES ===' as index_info;
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'public' AND tablename = 'stock_items';

-- 9. Check for description-like columns in stock_items (find alternatives)
SELECT '=== STOCK_ITEMS DESCRIPTION ALTERNATIVES ===' as search_info;
SELECT column_name 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'stock_items' 
  AND (column_name ILIKE '%desc%' 
       OR column_name ILIKE '%note%' 
       OR column_name ILIKE '%detail%'
       OR column_name ILIKE '%comment%');

-- 10. Check data types for key columns
SELECT '=== KEY COLUMN TYPES ===' as type_info;
SELECT 
    'weekly_tasks.due_date' as column_ref,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'weekly_tasks' 
  AND column_name = 'due_date'

UNION ALL

SELECT 
    'emergency_assignments.deadline' as column_ref,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'emergency_assignments' 
  AND column_name = 'deadline'

UNION ALL

SELECT 
    'stock_items.expiry_date' as column_ref,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'stock_items' 
  AND column_name = 'expiry_date'

UNION ALL

SELECT 
    'users.email' as column_ref,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'users' 
  AND column_name = 'email'

UNION ALL

SELECT 
    'users.phone' as column_ref,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'users' 
  AND column_name = 'phone';

-- 11. Check if any views already exist that might conflict
SELECT '=== EXISTING VIEWS ===' as view_info;
SELECT schemaname, viewname, definition
FROM pg_views 
WHERE schemaname = 'public' 
  AND (viewname ILIKE '%dispenser%' 
       OR viewname ILIKE '%task%'
       OR viewname ILIKE '%complete%');

-- 12. Check if any functions already exist that might conflict
SELECT '=== EXISTING FUNCTIONS ===' as function_info;
SELECT routine_name, routine_type, data_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND (routine_name ILIKE '%dispenser%' 
       OR routine_name ILIKE '%task%'
       OR routine_name ILIKE '%week%');

-- 13. Sample data check (optional - shows if tables have data)
SELECT '=== DATA SAMPLE CHECK ===' as data_info;
SELECT 
    'weekly_tasks' as table_name,
    COUNT(*) as row_count,
    MIN(created_at) as earliest_created,
    MAX(created_at) as latest_created
FROM public.weekly_tasks

UNION ALL

SELECT 
    'emergency_assignments' as table_name,
    COUNT(*) as row_count,
    MIN(created_at) as earliest_created,
    MAX(created_at) as latest_created
FROM public.emergency_assignments

UNION ALL

SELECT 
    'stock_items' as table_name,
    COUNT(*) as row_count,
    MIN(created_at) as earliest_created,
    MAX(created_at) as latest_created
FROM public.stock_items;
