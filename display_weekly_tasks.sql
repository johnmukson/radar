-- Display all contents of the weekly_tasks table
SELECT 
    id,
    title,
    description,
    assigned_to,
    assigned_by,
    due_date,
    priority,
    status,
    whatsapp_sent,
    whatsapp_sent_at,
    created_at,
    updated_at
FROM public.weekly_tasks
ORDER BY created_at DESC;

-- Also show count of tasks
SELECT COUNT(*) as total_tasks FROM public.weekly_tasks;

-- Show tasks by status
SELECT 
    status,
    COUNT(*) as count
FROM public.weekly_tasks
GROUP BY status
ORDER BY count DESC;

-- Show tasks by priority
SELECT 
    priority,
    COUNT(*) as count
FROM public.weekly_tasks
GROUP BY priority
ORDER BY count DESC;

-- Show tasks by month/year
SELECT 
    EXTRACT(YEAR FROM due_date) as year,
    EXTRACT(MONTH FROM due_date) as month,
    COUNT(*) as count
FROM public.weekly_tasks
GROUP BY EXTRACT(YEAR FROM due_date), EXTRACT(MONTH FROM due_date)
ORDER BY year DESC, month DESC;
