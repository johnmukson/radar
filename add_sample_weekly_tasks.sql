-- Add sample weekly tasks for testing DispenserTasks component
-- This will create tasks for MUKWAYA JOHNSON and other dispensers

-- First, let's get the user ID for MUKWAYA JOHNSON
SELECT 
  u.id,
  u.name,
  u.email
FROM public.users u
WHERE u.name ILIKE '%MUKWAYA JOHNSON%'
OR u.email = 'johnmukson25@gmail.com';

-- Add sample weekly tasks for October 2025, Week 2
INSERT INTO public.weekly_tasks (
  title,
  description,
  assigned_to,
  assigned_by,
  due_date,
  priority,
  status,
  whatsapp_sent,
  created_at,
  updated_at
)
SELECT 
  'Inventory Check - Munyonyo Branch' as title,
  'Complete inventory check for all high-value items at Munyonyo branch. Focus on items expiring within 30 days.' as description,
  u.id as assigned_to,
  u.id as assigned_by, -- Self-assigned for testing
  '2025-10-08' as due_date, -- Wednesday of Week 2
  'high' as priority,
  'pending' as status,
  false as whatsapp_sent,
  NOW() as created_at,
  NOW() as updated_at
FROM public.users u
WHERE u.name ILIKE '%MUKWAYA JOHNSON%'
OR u.email = 'johnmukson25@gmail.com';

-- Add more sample tasks for different days
INSERT INTO public.weekly_tasks (
  title,
  description,
  assigned_to,
  assigned_by,
  due_date,
  priority,
  status,
  whatsapp_sent,
  created_at,
  updated_at
)
SELECT 
  'Expiry Date Verification' as title,
  'Verify all expiry dates for stock items and update database records. Check for any discrepancies.' as description,
  u.id as assigned_to,
  u.id as assigned_by,
  '2025-10-09' as due_date, -- Thursday
  'medium' as priority,
  'pending' as status,
  false as whatsapp_sent,
  NOW() as created_at,
  NOW() as updated_at
FROM public.users u
WHERE u.name ILIKE '%MUKWAYA JOHNSON%'
OR u.email = 'johnmukson25@gmail.com';

INSERT INTO public.weekly_tasks (
  title,
  description,
  assigned_to,
  assigned_by,
  due_date,
  priority,
  status,
  whatsapp_sent,
  created_at,
  updated_at
)
SELECT 
  'Emergency Stock Assessment' as title,
  'Assess emergency stock levels and identify items that need immediate attention. Report critical shortages.' as description,
  u.id as assigned_to,
  u.id as assigned_by,
  '2025-10-10' as due_date, -- Friday
  'urgent' as priority,
  'pending' as status,
  false as whatsapp_sent,
  NOW() as created_at,
  NOW() as updated_at
FROM public.users u
WHERE u.name ILIKE '%MUKWAYA JOHNSON%'
OR u.email = 'johnmukson25@gmail.com';

-- Add tasks for other dispensers too
INSERT INTO public.weekly_tasks (
  title,
  description,
  assigned_to,
  assigned_by,
  due_date,
  priority,
  status,
  whatsapp_sent,
  created_at,
  updated_at
)
SELECT 
  'Weekly Stock Report' as title,
  'Prepare weekly stock report for management review. Include all branch activities and recommendations.' as description,
  u.id as assigned_to,
  u.id as assigned_by,
  '2025-10-11' as due_date, -- Saturday
  'medium' as priority,
  'pending' as status,
  false as whatsapp_sent,
  NOW() as created_at,
  NOW() as updated_at
FROM public.users u
WHERE u.name ILIKE '%HOPE JUSTINE%'
OR u.email = 'justinehopepharm@gmail.com';

-- Verify the tasks were created
SELECT 
  wt.id,
  wt.title,
  wt.description,
  wt.due_date,
  wt.priority,
  wt.status,
  u.name as assigned_to_name,
  u.email as assigned_to_email
FROM public.weekly_tasks wt
JOIN public.users u ON wt.assigned_to = u.id
WHERE wt.due_date BETWEEN '2025-10-08' AND '2025-10-14'
ORDER BY wt.due_date, wt.priority;

-- Show count of tasks by dispenser
SELECT 
  u.name,
  u.email,
  COUNT(wt.id) as task_count
FROM public.users u
LEFT JOIN public.weekly_tasks wt ON u.id = wt.assigned_to
WHERE wt.due_date BETWEEN '2025-10-08' AND '2025-10-14'
GROUP BY u.id, u.name, u.email
ORDER BY task_count DESC; 