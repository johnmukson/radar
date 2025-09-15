-- Clear all existing weekly tasks to start fresh
-- Copy and paste this into your Supabase SQL Editor

-- Step 1: Delete all existing weekly tasks
DELETE FROM public.weekly_tasks;

-- Step 2: Verify deletion
SELECT COUNT(*) as remaining_tasks FROM public.weekly_tasks;

-- Step 3: Success message
SELECT 'All weekly tasks cleared successfully! Now create new tasks using the "Download 7 Products Per Week" button.' as status;

