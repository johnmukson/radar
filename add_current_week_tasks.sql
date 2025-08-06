-- Add tasks for the current week that will be visible in DispenserTasks
-- This will create tasks without due dates, distributed across the week

-- Get user IDs for dispensers
SELECT 
  u.id,
  u.name,
  u.email
FROM public.users u
WHERE u.name ILIKE '%MUKWAYA JOHNSON%'
OR u.email = 'johnmukson25@gmail.com'
OR u.name ILIKE '%HOPE JUSTINE%'
OR u.email = 'justinehopepharm@gmail.com';

-- Add tasks for the current week (one per day, no due dates)
INSERT INTO public.weekly_tasks (
  title,
  description,
  assigned_to,
  assigned_by,
  priority,
  status,
  whatsapp_sent,
  created_at,
  updated_at
)
SELECT 
  'Move CHLOROCIDE SYRUP' as title,
  'Move CHLOROCIDE SYRUP (Risk: low, Expiry: 2026-08-29)' as description,
  u.id as assigned_to,
  u.id as assigned_by,
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
  priority,
  status,
  whatsapp_sent,
  created_at,
  updated_at
)
SELECT 
  'Move CLOPI-DENK 75MG' as title,
  'Move CLOPI-DENK 75MG (Risk: medium, Expiry: 2026-06-15)' as description,
  u.id as assigned_to,
  u.id as assigned_by,
  'high' as priority,
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
  priority,
  status,
  whatsapp_sent,
  created_at,
  updated_at
)
SELECT 
  'Move TIXYLIX INFANT COUGH SYRUP 10' as title,
  'Move TIXYLIX INFANT COUGH SYRUP 10 (Risk: low, Expiry: 2026-09-20)' as description,
  u.id as assigned_to,
  u.id as assigned_by,
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
  priority,
  status,
  whatsapp_sent,
  created_at,
  updated_at
)
SELECT 
  'Move GLICLAZIDE 80MG TABS (UK) 28''S' as title,
  'Move GLICLAZIDE 80MG TABS (UK) 28''S (Risk: high, Expiry: 2026-03-10)' as description,
  u.id as assigned_to,
  u.id as assigned_by,
  'urgent' as priority,
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
  priority,
  status,
  whatsapp_sent,
  created_at,
  updated_at
)
SELECT 
  'Move ANUSOL OINTMENT 25G (UK)' as title,
  'Move ANUSOL OINTMENT 25G (UK) (Risk: low, Expiry: 2026-11-15)' as description,
  u.id as assigned_to,
  u.id as assigned_by,
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
  priority,
  status,
  whatsapp_sent,
  created_at,
  updated_at
)
SELECT 
  'Move AZITHROMYCIN EYE DROPS 3ML' as title,
  'Move AZITHROMYCIN EYE DROPS 3ML (Risk: medium, Expiry: 2026-07-22)' as description,
  u.id as assigned_to,
  u.id as assigned_by,
  'high' as priority,
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
  priority,
  status,
  whatsapp_sent,
  created_at,
  updated_at
)
SELECT 
  'Move OMEPRAZOLE 40MG UK' as title,
  'Move OMEPRAZOLE 40MG UK (Risk: low, Expiry: 2026-10-05)' as description,
  u.id as assigned_to,
  u.id as assigned_by,
  'medium' as priority,
  'pending' as status,
  false as whatsapp_sent,
  NOW() as created_at,
  NOW() as updated_at
FROM public.users u
WHERE u.name ILIKE '%MUKWAYA JOHNSON%'
OR u.email = 'johnmukson25@gmail.com';

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
WHERE wt.created_at >= CURRENT_DATE
ORDER BY wt.created_at, wt.priority;

-- Show count of tasks by priority
SELECT 
  wt.priority,
  COUNT(wt.id) as task_count
FROM public.weekly_tasks wt
WHERE wt.created_at >= CURRENT_DATE
GROUP BY wt.priority
ORDER BY wt.priority; 