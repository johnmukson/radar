-- Quick Database Check - Simplified Version
-- Run this first for a quick overview

-- 1. All Tables
SELECT 'TABLES' as section, tablename, 
       (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.tablename) as column_count
FROM pg_tables t
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. Row Counts for each table
SELECT 'ROW COUNTS' as section, 
       'branches' as table_name, COUNT(*) as row_count FROM branches
UNION ALL
SELECT 'ROW COUNTS', 'stock_items', COUNT(*) FROM stock_items
UNION ALL
SELECT 'ROW COUNTS', 'user_roles', COUNT(*) FROM user_roles
UNION ALL
SELECT 'ROW COUNTS', 'stock_movement_history', COUNT(*) FROM stock_movement_history
UNION ALL
SELECT 'ROW COUNTS', 'weekly_tasks', COUNT(*) FROM weekly_tasks
UNION ALL
SELECT 'ROW COUNTS', 'import_templates', COUNT(*) FROM import_templates
UNION ALL
SELECT 'ROW COUNTS', 'branch_settings', COUNT(*) FROM branch_settings
ORDER BY table_name;

-- 3. Key Indexes
SELECT 'INDEXES' as section, tablename, indexname 
FROM pg_indexes
WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- 4. RLS Status
SELECT 'RLS STATUS' as section, tablename, 
       CASE WHEN rowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 5. Sample Data
SELECT 'SAMPLE DATA - Branches' as section, id, name, code FROM branches LIMIT 5;
SELECT 'SAMPLE DATA - Stock Items' as section, id, product_name, quantity, expiry_date FROM stock_items LIMIT 5;

