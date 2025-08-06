-- ============================================================================
-- DELETE ALL WEEKLY TASKS FROM DATABASE
-- ============================================================================
-- WARNING: This script will permanently delete ALL weekly tasks
-- Make sure you have a backup before running this script
-- ============================================================================

-- Step 1: Show current count of weekly tasks
SELECT 
    'BEFORE DELETION - Current weekly tasks count:' as info,
    COUNT(*) as total_tasks,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks,
    COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_tasks,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_tasks
FROM public.weekly_tasks;

-- Step 2: Show sample of tasks that will be deleted (first 10)
SELECT 
    'SAMPLE TASKS TO BE DELETED:' as info,
    id,
    title,
    description,
    assigned_to,
    assigned_by,
    due_date,
    priority,
    status,
    created_at
FROM public.weekly_tasks 
ORDER BY created_at DESC 
LIMIT 10;

-- Step 3: Show tasks by priority
SELECT 
    'TASKS BY PRIORITY:' as info,
    priority,
    COUNT(*) as count
FROM public.weekly_tasks 
GROUP BY priority 
ORDER BY 
    CASE priority 
        WHEN 'urgent' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
    END;

-- Step 4: Show tasks by status
SELECT 
    'TASKS BY STATUS:' as info,
    status,
    COUNT(*) as count
FROM public.weekly_tasks 
GROUP BY status 
ORDER BY 
    CASE status 
        WHEN 'pending' THEN 1 
        WHEN 'in_progress' THEN 2 
        WHEN 'completed' THEN 3 
        WHEN 'cancelled' THEN 4 
    END;

-- Step 5: Show tasks by assigned user
SELECT 
    'TASKS BY ASSIGNED USER:' as info,
    u.name as assigned_to_name,
    u.email as assigned_to_email,
    COUNT(wt.id) as task_count
FROM public.weekly_tasks wt
JOIN public.users u ON wt.assigned_to = u.id
GROUP BY u.id, u.name, u.email
ORDER BY task_count DESC;

-- ============================================================================
-- ACTUAL DELETION (UNCOMMENT TO EXECUTE)
-- ============================================================================

-- UNCOMMENT THE FOLLOWING LINE TO DELETE ALL WEEKLY TASKS:
-- DELETE FROM public.weekly_tasks;

-- ============================================================================
-- VERIFICATION AFTER DELETION (UNCOMMENT TO EXECUTE)
-- ============================================================================

-- UNCOMMENT THE FOLLOWING TO VERIFY DELETION:
-- SELECT 
--     'AFTER DELETION - Remaining weekly tasks count:' as info,
--     COUNT(*) as total_tasks
-- FROM public.weekly_tasks;

-- ============================================================================
-- ALTERNATIVE: DELETE WITH CONDITIONS
-- ============================================================================

-- Option 1: Delete only pending tasks
-- DELETE FROM public.weekly_tasks WHERE status = 'pending';

-- Option 2: Delete tasks older than a specific date
-- DELETE FROM public.weekly_tasks WHERE created_at < '2025-01-01';

-- Option 3: Delete tasks for specific users
-- DELETE FROM public.weekly_tasks WHERE assigned_to IN (
--     SELECT id FROM public.users WHERE name ILIKE '%MUKWAYA JOHNSON%'
-- );

-- Option 4: Delete tasks with specific priorities
-- DELETE FROM public.weekly_tasks WHERE priority IN ('low', 'medium');

-- ============================================================================
-- SAFETY CHECK: COUNT BEFORE DELETION
-- ============================================================================

-- Run this first to see what will be deleted:
SELECT 
    'SAFETY CHECK - Tasks that will be deleted:' as info,
    COUNT(*) as total_tasks
FROM public.weekly_tasks;

-- ============================================================================
-- BACKUP OPTION (RECOMMENDED)
-- ============================================================================

-- Before deleting, you can create a backup:
-- CREATE TABLE public.weekly_tasks_backup AS 
-- SELECT * FROM public.weekly_tasks;

-- To restore from backup:
-- INSERT INTO public.weekly_tasks 
-- SELECT * FROM public.weekly_tasks_backup;

-- ============================================================================
-- INSTRUCTIONS
-- ============================================================================
/*
TO DELETE ALL WEEKLY TASKS:

1. First, run this script to see what will be deleted
2. Review the output to ensure you want to delete these tasks
3. Uncomment the DELETE statement: DELETE FROM public.weekly_tasks;
4. Run the script again to execute the deletion
5. Uncomment the verification query to confirm deletion

SAFETY TIPS:
- Always backup before deletion
- Consider deleting with conditions instead of all at once
- Test on a development database first
- Keep the backup table for at least a week after deletion
*/ 