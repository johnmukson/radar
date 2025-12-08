-- Comprehensive Database Check Script
-- Run this in Supabase SQL Editor to inspect the entire database

-- ============================================================================
-- 1. DATABASE INFORMATION
-- ============================================================================
SELECT 
    current_database() as database_name,
    version() as postgres_version,
    current_user as current_user,
    current_schema() as current_schema;

-- ============================================================================
-- 2. ALL TABLES IN PUBLIC SCHEMA
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    tableowner,
    hasindexes,
    hasrules,
    hastriggers
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- ============================================================================
-- 3. TABLE STRUCTURES (Columns, Types, Constraints)
-- ============================================================================
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.character_maximum_length,
    c.is_nullable,
    c.column_default,
    tc.constraint_type,
    kcu.constraint_name
FROM information_schema.tables t
LEFT JOIN information_schema.columns c ON t.table_name = c.table_name
LEFT JOIN information_schema.table_constraints tc ON t.table_name = tc.table_name
LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;

-- ============================================================================
-- 4. ALL INDEXES
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ============================================================================
-- 5. FOREIGN KEY CONSTRAINTS
-- ============================================================================
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================================================
-- 7. RLS ENABLED TABLES
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
    AND rowsecurity = true
ORDER BY tablename;

-- ============================================================================
-- 8. TABLE ROW COUNTS
-- ============================================================================
DO $$
DECLARE
    r RECORD;
    count_val BIGINT;
BEGIN
    RAISE NOTICE '=== TABLE ROW COUNTS ===';
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
    LOOP
        EXECUTE format('SELECT COUNT(*) FROM %I', r.tablename) INTO count_val;
        RAISE NOTICE '%: % rows', r.tablename, count_val;
    END LOOP;
END $$;

-- ============================================================================
-- 9. FUNCTIONS AND STORED PROCEDURES
-- ============================================================================
SELECT 
    routine_schema,
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- ============================================================================
-- 10. TRIGGERS
-- ============================================================================
SELECT 
    trigger_schema,
    trigger_name,
    event_object_table,
    action_timing,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ============================================================================
-- 11. VIEWS
-- ============================================================================
SELECT 
    table_schema,
    table_name,
    view_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- ============================================================================
-- 12. SEQUENCES
-- ============================================================================
SELECT 
    sequence_schema,
    sequence_name,
    data_type,
    numeric_precision,
    numeric_scale,
    start_value,
    minimum_value,
    maximum_value,
    increment
FROM information_schema.sequences
WHERE sequence_schema = 'public'
ORDER BY sequence_name;

-- ============================================================================
-- 13. SAMPLE DATA FROM KEY TABLES
-- ============================================================================

-- Branches
SELECT '=== BRANCHES ===' as info;
SELECT id, name, code, region, status, created_at 
FROM public.branches 
ORDER BY created_at DESC 
LIMIT 10;

-- Stock Items (sample)
SELECT '=== STOCK ITEMS (Sample) ===' as info;
SELECT id, product_name, branch_id, quantity, unit_price, expiry_date, status, created_at 
FROM public.stock_items 
ORDER BY created_at DESC 
LIMIT 10;

-- User Roles (sample)
SELECT '=== USER ROLES (Sample) ===' as info;
SELECT id, user_id, role, branch_id, created_at 
FROM public.user_roles 
ORDER BY created_at DESC 
LIMIT 10;

-- Stock Movement History (sample)
SELECT '=== STOCK MOVEMENT HISTORY (Sample) ===' as info;
SELECT id, stock_item_id, movement_type, quantity_moved, from_branch_id, to_branch_id, movement_date 
FROM public.stock_movement_history 
ORDER BY movement_date DESC 
LIMIT 10;

-- ============================================================================
-- 14. DATA INTEGRITY CHECKS
-- ============================================================================

-- Check for orphaned stock items (branch_id doesn't exist)
SELECT '=== ORPHANED STOCK ITEMS ===' as check_type;
SELECT COUNT(*) as orphaned_count
FROM public.stock_items si
LEFT JOIN public.branches b ON si.branch_id = b.id
WHERE b.id IS NULL;

-- Check for stock items with invalid dates
SELECT '=== STOCK ITEMS WITH INVALID DATES ===' as check_type;
SELECT COUNT(*) as invalid_dates_count
FROM public.stock_items
WHERE expiry_date IS NULL OR expiry_date < '1900-01-01';

-- Check for negative quantities
SELECT '=== STOCK ITEMS WITH NEGATIVE QUANTITIES ===' as check_type;
SELECT COUNT(*) as negative_quantities_count
FROM public.stock_items
WHERE quantity < 0;

-- Check for negative prices
SELECT '=== STOCK ITEMS WITH NEGATIVE PRICES ===' as check_type;
SELECT COUNT(*) as negative_prices_count
FROM public.stock_items
WHERE unit_price < 0;

-- ============================================================================
-- 15. INDEX USAGE STATISTICS (if available)
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- ============================================================================
-- 16. TABLE SIZES
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ============================================================================
-- 17. MISSING INDEXES ON FOREIGN KEYS
-- ============================================================================
SELECT
    tc.table_name, 
    kcu.column_name,
    'Missing index on foreign key' as issue
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE schemaname = 'public'
            AND tablename = tc.table_name
            AND indexdef LIKE '%' || kcu.column_name || '%'
    )
ORDER BY tc.table_name, kcu.column_name;

-- ============================================================================
-- 18. SUMMARY REPORT
-- ============================================================================
SELECT 
    '=== DATABASE SUMMARY ===' as report_section,
    (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public') as total_tables,
    (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public') as total_indexes,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public') as total_policies,
    (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public') as total_functions,
    (SELECT COUNT(*) FROM information_schema.views WHERE table_schema = 'public') as total_views,
    (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = 'public') as total_triggers;

