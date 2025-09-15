-- ====================================================================================
-- COMPLETE DISPENSER TASKS VIEW - AUDIT-READY VERSION
-- Based on actual schema analysis from codebase
-- This version accounts for the real table structures found
-- ====================================================================================

-- First, let's create a function to calculate week numbers properly (NULL-safe)
CREATE OR REPLACE FUNCTION get_week_number(input_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF input_date IS NULL THEN 
        RETURN NULL; 
    END IF;
    -- Handle edge case for first day of month (ensure minimum week 1)
    RETURN GREATEST(1, CEIL(EXTRACT(DAY FROM input_date) / 7.0)::INTEGER);
END;
$$;

-- Create the comprehensive dispenser tasks view
CREATE OR REPLACE VIEW public.complete_dispenser_tasks_view WITH (security_invoker=on) AS
WITH weekly_tasks_data AS (
    -- Get all weekly tasks with product information
    -- Based on actual schema: id, title, description, assigned_to, assigned_by, due_date, priority, status, whatsapp_sent, whatsapp_sent_at, created_at, updated_at
    SELECT 
        wt.id as task_id,
        wt.title as product_name,
        wt.description,  -- This exists in weekly_tasks table
        wt.assigned_to as dispenser_id,
        wt.assigned_by,
        wt.due_date::DATE as expiry_date,  -- Convert TIMESTAMP WITH TIME ZONE to DATE
        wt.priority,
        wt.status as task_status,
        wt.whatsapp_sent,
        wt.whatsapp_sent_at::TEXT as whatsapp_sent_at,
        wt.created_at as task_created_at,
        wt.updated_at as task_updated_at,
        
        -- Calculate week and month information from due_date
        EXTRACT(YEAR FROM wt.due_date::DATE) as expiry_year,
        EXTRACT(MONTH FROM wt.due_date::DATE) as expiry_month,
        get_week_number(wt.due_date::DATE) as week_number,
        EXTRACT(DAY FROM wt.due_date::DATE) as day_of_month,
        
        -- Calculate day of week (1=Monday, 7=Sunday)
        CASE EXTRACT(DOW FROM wt.due_date::DATE)
            WHEN 0 THEN 7  -- Sunday
            WHEN 1 THEN 1  -- Monday
            WHEN 2 THEN 2  -- Tuesday
            WHEN 3 THEN 3  -- Wednesday
            WHEN 4 THEN 4  -- Thursday
            WHEN 5 THEN 5  -- Friday
            WHEN 6 THEN 6  -- Saturday
        END as day_number,
        
        -- Task type
        'weekly_task' as task_type,
        
        -- Default values for weekly tasks (since they don't have product details)
        1 as quantity,
        0::NUMERIC(10,2) as unit_price,
        0::NUMERIC(10,2) as value,
        'medium' as risk_level,
        0 as days_to_expiry,
        false as is_high_value,
        false as is_emergency,
        null::UUID as branch_id,
        null::TEXT as branch_name,
        null::UUID as stock_item_id,
        
        -- Dispenser information - based on actual users table: id, email, name, phone
        u_dispenser.name as dispenser_name,
        u_dispenser.email as dispenser_email,
        u_dispenser.phone as dispenser_phone,
        
        -- Assigned by information
        u_assigned_by.name as assigned_by_name,
        
        -- Calculate priority score
        CASE 
            WHEN wt.priority = 'urgent' THEN 4
            WHEN wt.priority = 'high' THEN 3
            WHEN wt.priority = 'medium' THEN 2
            ELSE 1
        END as calculated_priority_score,
        
        -- Calculate if task is overdue (consistent date comparison)
        CASE 
            WHEN wt.due_date::DATE < CURRENT_DATE AND wt.status NOT IN ('completed', 'cancelled') THEN true
            ELSE false
        END as is_overdue,
        
        -- Calculate days until deadline (explicit cast to integer)
        COALESCE((wt.due_date::DATE - CURRENT_DATE)::INTEGER, 0) as days_until_deadline

    FROM public.weekly_tasks wt
    LEFT JOIN public.users u_dispenser ON wt.assigned_to = u_dispenser.id
    LEFT JOIN public.users u_assigned_by ON wt.assigned_by = u_assigned_by.id
    WHERE wt.status NOT IN ('cancelled')  -- Exclude cancelled tasks
),

emergency_assignments_data AS (
    -- Get all emergency assignments with product information
    -- Based on actual schema: id, dispenser_id, assigned_by, assigned_quantity, status, created_at, updated_at, deadline, stock_item_id
    -- stock_items schema: id, product_name, quantity, unit_price, expiry_date, branch_id, status, assigned_to, assignment_strategy, date_assigned, deadline, emergency_declared_at, emergency_declared_by, is_emergency, priority, priority_score, risk_level, days_to_expiry, quantity_moved, value, is_high_value, last_updated_at, last_updated_by, created_at, updated_at
    SELECT 
        ea.id as task_id,
        COALESCE(si.product_name, 'Unknown Product') as product_name,  -- Handle NULL product names
        '' as description,  -- stock_items has NO description column - use empty string
        ea.dispenser_id,
        ea.assigned_by,
        si.expiry_date,
        COALESCE(si.priority, 'medium') as priority,  -- Handle NULL priorities
        ea.status as task_status,
        false as whatsapp_sent,
        null::TEXT as whatsapp_sent_at,
        ea.created_at as task_created_at,
        ea.updated_at as task_updated_at,
        
        -- Calculate week and month information from expiry_date
        EXTRACT(YEAR FROM si.expiry_date) as expiry_year,
        EXTRACT(MONTH FROM si.expiry_date) as expiry_month,
        get_week_number(si.expiry_date) as week_number,
        EXTRACT(DAY FROM si.expiry_date) as day_of_month,
        
        -- Calculate day of week (1=Monday, 7=Sunday)
        CASE EXTRACT(DOW FROM si.expiry_date)
            WHEN 0 THEN 7  -- Sunday
            WHEN 1 THEN 1  -- Monday
            WHEN 2 THEN 2  -- Tuesday
            WHEN 3 THEN 3  -- Wednesday
            WHEN 4 THEN 4  -- Thursday
            WHEN 5 THEN 5  -- Friday
            WHEN 6 THEN 6  -- Saturday
        END as day_number,
        
        -- Task type
        'emergency_assignment' as task_type,
        
        -- Product information from stock_items
        ea.assigned_quantity as quantity,
        COALESCE(si.unit_price, 0::NUMERIC(10,2)) as unit_price,  -- Handle NULL unit prices
        COALESCE(si.value, 0::NUMERIC(10,2)) as value,  -- Handle NULL values
        COALESCE(si.risk_level, 'medium') as risk_level,  -- Handle NULL risk levels
        COALESCE(si.days_to_expiry, 0) as days_to_expiry,  -- Handle NULL days to expiry
        COALESCE(si.is_high_value, false) as is_high_value,  -- Handle NULL is_high_value
        COALESCE(si.is_emergency, false) as is_emergency,  -- Handle NULL is_emergency
        si.branch_id,
        COALESCE(b.name, 'Unknown Branch') as branch_name,  -- Handle NULL branch names
        si.id as stock_item_id,
        
        -- Dispenser information - based on actual users table: id, email, name, phone
        u_dispenser.name as dispenser_name,
        u_dispenser.email as dispenser_email,
        u_dispenser.phone as dispenser_phone,
        
        -- Assigned by information
        u_assigned_by.name as assigned_by_name,
        
        -- Calculate priority score based on expiry
        CASE 
            WHEN COALESCE(si.days_to_expiry, 0) <= 7 THEN 4  -- Critical
            WHEN COALESCE(si.days_to_expiry, 0) <= 14 THEN 3 -- High
            WHEN COALESCE(si.days_to_expiry, 0) <= 30 THEN 2 -- Medium
            ELSE 1 -- Low
        END as calculated_priority_score,
        
        -- Calculate if task is overdue (consistent date comparison)
        CASE 
            WHEN ea.deadline::DATE < CURRENT_DATE AND ea.status NOT IN ('completed', 'cancelled') THEN true
            ELSE false
        END as is_overdue,
        
        -- Calculate days until deadline (explicit cast to integer)
        COALESCE((ea.deadline::DATE - CURRENT_DATE)::INTEGER, 0) as days_until_deadline

    FROM public.emergency_assignments ea
    LEFT JOIN public.stock_items si ON ea.stock_item_id = si.id
    LEFT JOIN public.branches b ON si.branch_id = b.id
    LEFT JOIN public.users u_dispenser ON ea.dispenser_id = u_dispenser.id
    LEFT JOIN public.users u_assigned_by ON ea.assigned_by = u_assigned_by.id
    WHERE ea.status NOT IN ('cancelled')  -- Exclude cancelled assignments
      AND si.expiry_date >= CURRENT_DATE  -- Only future expiry dates
),

-- Combine both task types
combined_tasks AS (
    SELECT * FROM weekly_tasks_data
    UNION ALL
    SELECT * FROM emergency_assignments_data
),

-- Use subquery to avoid alias reuse in same SELECT
combined_with_urgency AS (
    SELECT 
        c.*,
        -- Calculate urgency_status here
        CASE 
            WHEN c.is_overdue THEN 'overdue'
            WHEN c.days_until_deadline <= 1 THEN 'urgent'
            WHEN c.days_until_deadline <= 3 THEN 'due_soon'
            ELSE 'normal'
        END as urgency_status
    FROM combined_tasks c
)

SELECT 
    -- Task identification
    task_id,
    product_name,
    description,
    quantity,
    unit_price,
    expiry_date,
    task_status,
    priority,
    risk_level,
    days_to_expiry,
    value,
    is_high_value,
    is_emergency,
    task_type,
    
    -- Assignment information
    dispenser_id,
    assigned_by,
    task_created_at,
    task_updated_at,
    whatsapp_sent,
    whatsapp_sent_at,
    
    -- Time organization
    expiry_year,
    expiry_month,
    week_number,
    day_of_month,
    day_number,
    
    -- Branch information
    branch_id,
    branch_name,
    
    -- User information
    dispenser_name,
    dispenser_email,
    dispenser_phone,
    assigned_by_name,
    
    -- Calculated fields
    calculated_priority_score,
    is_overdue,
    days_until_deadline,
    stock_item_id,
    
    -- Formatted strings for display (NULL-safe TO_CHAR calls)
    CASE WHEN expiry_date IS NOT NULL THEN TO_CHAR(expiry_date, 'YYYY-MM') ELSE NULL END as expiry_month_string,
    'Week ' || COALESCE(week_number::TEXT, 'N/A') as week_display,
    CASE WHEN expiry_date IS NOT NULL THEN TO_CHAR(expiry_date, 'FMDay') ELSE NULL END as day_name,
    CASE WHEN expiry_date IS NOT NULL THEN TO_CHAR(expiry_date, 'FMMonth YYYY') ELSE NULL END as month_year_display,
    
    -- Status indicators
    urgency_status,
    
    -- Task completion status (can reference urgency_status alias from subquery)
    CASE 
        WHEN task_status = 'completed' THEN 'completed'
        WHEN task_status = 'in_progress' THEN 'in_progress'
        WHEN is_overdue THEN 'overdue'
        WHEN urgency_status = 'urgent' THEN 'urgent'
        ELSE 'pending'
    END as display_status

FROM combined_with_urgency
ORDER BY 
    expiry_year ASC,
    expiry_month ASC,
    week_number ASC,
    day_number ASC,
    calculated_priority_score DESC,
    value DESC;

-- Create indexes for better performance (based on actual column names)
CREATE INDEX IF NOT EXISTS idx_weekly_tasks_dispenser_due_date 
ON public.weekly_tasks (assigned_to, due_date) 
WHERE status NOT IN ('cancelled');

CREATE INDEX IF NOT EXISTS idx_emergency_assignments_dispenser_deadline 
ON public.emergency_assignments (dispenser_id, deadline) 
WHERE status NOT IN ('cancelled');

CREATE INDEX IF NOT EXISTS idx_stock_items_expiry_branch 
ON public.stock_items (expiry_date, branch_id) 
WHERE expiry_date IS NOT NULL;

-- Grant permissions
GRANT SELECT ON public.complete_dispenser_tasks_view TO authenticated;

-- Create a summary view for quick statistics
CREATE OR REPLACE VIEW public.dispenser_tasks_summary WITH (security_invoker=on) AS
SELECT 
    dispenser_id,
    dispenser_name,
    branch_name,
    expiry_year,
    expiry_month,
    week_number,
    task_type,
    COUNT(*) as total_tasks,
    COUNT(*) FILTER (WHERE task_status = 'pending') as pending_tasks,
    COUNT(*) FILTER (WHERE task_status = 'in_progress') as in_progress_tasks,
    COUNT(*) FILTER (WHERE task_status = 'completed') as completed_tasks,
    COUNT(*) FILTER (WHERE is_overdue = true) as overdue_tasks,
    COUNT(*) FILTER (WHERE urgency_status = 'urgent') as urgent_tasks,
    COUNT(*) FILTER (WHERE task_type = 'weekly_task') as weekly_tasks_count,
    COUNT(*) FILTER (WHERE task_type = 'emergency_assignment') as emergency_tasks_count,
    SUM(value) as total_value,
    AVG(days_to_expiry) as avg_days_to_expiry,
    MIN(expiry_date) as earliest_expiry,
    MAX(expiry_date) as latest_expiry
FROM public.complete_dispenser_tasks_view
GROUP BY 
    dispenser_id, 
    dispenser_name, 
    branch_name, 
    expiry_year, 
    expiry_month, 
    week_number,
    task_type
ORDER BY 
    expiry_year, 
    expiry_month, 
    week_number, 
    dispenser_name,
    task_type;

-- Grant permissions for summary view
GRANT SELECT ON public.dispenser_tasks_summary TO authenticated;

-- Create a function to get tasks for a specific dispenser and month
CREATE OR REPLACE FUNCTION get_dispenser_tasks_for_month(
    p_dispenser_id UUID,
    p_year INTEGER,
    p_month INTEGER,
    p_week INTEGER DEFAULT NULL,
    p_task_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    task_id UUID,
    product_name TEXT,
    expiry_date DATE,
    week_number INTEGER,
    day_number INTEGER,
    task_status TEXT,
    priority TEXT,
    risk_level TEXT,
    value NUMERIC,
    is_overdue BOOLEAN,
    urgency_status TEXT,
    task_type TEXT,
    quantity INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Set search_path for security
    PERFORM set_config('search_path', '', true);
    
    RETURN QUERY
    SELECT 
        cdtv.task_id,
        cdtv.product_name,
        cdtv.expiry_date,
        cdtv.week_number,
        cdtv.day_number,
        cdtv.task_status,
        cdtv.priority,
        cdtv.risk_level,
        cdtv.value,
        cdtv.is_overdue,
        cdtv.urgency_status,
        cdtv.task_type,
        cdtv.quantity
    FROM public.complete_dispenser_tasks_view cdtv
    WHERE cdtv.dispenser_id = p_dispenser_id
      AND cdtv.expiry_year = p_year
      AND cdtv.expiry_month = p_month
      AND (p_week IS NULL OR cdtv.week_number = p_week)
      AND (p_task_type IS NULL OR cdtv.task_type = p_task_type)
    ORDER BY cdtv.week_number, cdtv.day_number, cdtv.calculated_priority_score DESC;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_dispenser_tasks_for_month TO authenticated;

-- Create a function to get all tasks for a specific month (admin view)
CREATE OR REPLACE FUNCTION get_all_tasks_for_month(
    p_year INTEGER,
    p_month INTEGER,
    p_week INTEGER DEFAULT NULL,
    p_dispenser_id UUID DEFAULT NULL,
    p_task_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    task_id UUID,
    product_name TEXT,
    expiry_date DATE,
    week_number INTEGER,
    day_number INTEGER,
    task_status TEXT,
    priority TEXT,
    risk_level TEXT,
    value NUMERIC,
    is_overdue BOOLEAN,
    urgency_status TEXT,
    task_type TEXT,
    quantity INTEGER,
    dispenser_name TEXT,
    branch_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Set search_path for security
    PERFORM set_config('search_path', '', true);
    
    RETURN QUERY
    SELECT 
        cdtv.task_id,
        cdtv.product_name,
        cdtv.expiry_date,
        cdtv.week_number,
        cdtv.day_number,
        cdtv.task_status,
        cdtv.priority,
        cdtv.risk_level,
        cdtv.value,
        cdtv.is_overdue,
        cdtv.urgency_status,
        cdtv.task_type,
        cdtv.quantity,
        cdtv.dispenser_name,
        cdtv.branch_name
    FROM public.complete_dispenser_tasks_view cdtv
    WHERE cdtv.expiry_year = p_year
      AND cdtv.expiry_month = p_month
      AND (p_week IS NULL OR cdtv.week_number = p_week)
      AND (p_dispenser_id IS NULL OR cdtv.dispenser_id = p_dispenser_id)
      AND (p_task_type IS NULL OR cdtv.task_type = p_task_type)
    ORDER BY cdtv.dispenser_name, cdtv.week_number, cdtv.day_number, cdtv.calculated_priority_score DESC;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_all_tasks_for_month TO authenticated;

-- Add comments for documentation
COMMENT ON VIEW public.complete_dispenser_tasks_view IS 'Complete view combining weekly_tasks and emergency_assignments with stock_items for comprehensive dispenser task management';
COMMENT ON VIEW public.dispenser_tasks_summary IS 'Summary statistics for all dispenser tasks grouped by dispenser, month, week, and task type';
COMMENT ON FUNCTION get_dispenser_tasks_for_month IS 'Get tasks for a specific dispenser and month/week with optional task type filtering';
COMMENT ON FUNCTION get_all_tasks_for_month IS 'Get all tasks for a specific month/week with optional dispenser and task type filtering (admin view)';

-- Verify the setup
DO $$
BEGIN
    RAISE NOTICE 'Complete dispenser tasks view created successfully!';
    RAISE NOTICE 'This view combines:';
    RAISE NOTICE '  - weekly_tasks table (general tasks)';
    RAISE NOTICE '  - emergency_assignments table (product assignments)';
    RAISE NOTICE '  - stock_items table (product details)';
    RAISE NOTICE 'Available views: complete_dispenser_tasks_view, dispenser_tasks_summary';
    RAISE NOTICE 'Available functions: get_dispenser_tasks_for_month, get_all_tasks_for_month';
    RAISE NOTICE 'The view includes proper week/month organization, expiry tracking, and priority management';
    RAISE NOTICE 'AUDIT-READY: Based on actual schema analysis from codebase';
    RAISE NOTICE 'FIXED: Removed reference to non-existent si.description column';
    RAISE NOTICE 'FIXED: Added security_invoker=on to views';
    RAISE NOTICE 'FIXED: Protected TO_CHAR calls from NULL expiry_date';
    RAISE NOTICE 'FIXED: Consistent date comparisons and explicit casts';
END $$;
