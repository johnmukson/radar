-- Update database views to use uniform ranges
-- This migration updates all risk level calculations to use the uniform ranges:
-- 31-60 days (Critical range)
-- 61-90 days (High priority range) 
-- 91-120 days (Medium-high priority range)
-- 121-180 days (Medium priority range)
-- 181-365 days (Low priority range)
-- 365+ days (Very low priority range)

-- Update unified_assignments_view
CREATE OR REPLACE VIEW public.unified_assignments_view AS
-- Weekly Tasks
SELECT 
  wt.id,
  'weekly_task' as source_type,
  wt.title as display_name,
  wt.description,
  wt.assigned_to,
  wt.assigned_by,
  wt.due_date as date_field,
  wt.priority,
  wt.status,
  wt.whatsapp_sent,
  wt.whatsapp_sent_at,
  wt.created_at,
  wt.updated_at,
  -- User information
  assigned_user.name as assigned_user_name,
  assigned_user.phone as assigned_user_phone,
  assigned_by_user.name as assigned_by_user_name,
  -- Product information (if linked to stock_items)
  si.product_name,
  si.quantity,
  si.unit_price,
  si.expiry_date,
  si.branch_id,
  b.name as branch_name,
  -- Risk level (based on due date for tasks) - UNIFORM RANGES
  CASE 
    WHEN wt.due_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'critical'
    WHEN wt.due_date <= CURRENT_DATE + INTERVAL '60 days' THEN 'high'
    WHEN wt.due_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'medium-high'
    WHEN wt.due_date <= CURRENT_DATE + INTERVAL '120 days' THEN 'medium-high'
    WHEN wt.due_date <= CURRENT_DATE + INTERVAL '180 days' THEN 'medium'
    WHEN wt.due_date <= CURRENT_DATE + INTERVAL '365 days' THEN 'low'
    ELSE 'very-low'
  END as risk_level,
  -- Task type
  CASE 
    WHEN si.id IS NOT NULL THEN 'product_assignment'
    ELSE 'general_task'
  END as task_type
FROM weekly_tasks wt
LEFT JOIN users assigned_user ON wt.assigned_to = assigned_user.id
LEFT JOIN users assigned_by_user ON wt.assigned_by = assigned_by_user.id
LEFT JOIN stock_items si ON wt.title LIKE '%' || si.product_name || '%' 
  OR wt.description LIKE '%' || si.product_name || '%'
LEFT JOIN branches b ON si.branch_id = b.id

UNION ALL

-- Assigned Products
SELECT 
  si.id,
  'assigned_product' as source_type,
  si.product_name as display_name,
  CONCAT('Product assignment: ', si.product_name, ' (Qty: ', si.quantity, ', Price: ', si.unit_price, ')') as description,
  si.assigned_to,
  NULL as assigned_by,
  si.expiry_date as date_field,
  'medium' as priority,
  si.status,
  false as whatsapp_sent,
  NULL as whatsapp_sent_at,
  si.created_at,
  si.updated_at,
  -- User information
  assigned_user.name as assigned_user_name,
  assigned_user.phone as assigned_user_phone,
  NULL as assigned_by_user_name,
  -- Product information
  si.product_name,
  si.quantity,
  si.unit_price,
  si.expiry_date,
  si.branch_id,
  b.name as branch_name,
  -- Risk level calculation - UNIFORM RANGES
  CASE 
    WHEN si.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'critical'
    WHEN si.expiry_date <= CURRENT_DATE + INTERVAL '60 days' THEN 'high'
    WHEN si.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'medium-high'
    WHEN si.expiry_date <= CURRENT_DATE + INTERVAL '120 days' THEN 'medium-high'
    WHEN si.expiry_date <= CURRENT_DATE + INTERVAL '180 days' THEN 'medium'
    WHEN si.expiry_date <= CURRENT_DATE + INTERVAL '365 days' THEN 'low'
    ELSE 'very-low'
  END as risk_level
FROM stock_items si
LEFT JOIN users assigned_user ON si.assigned_to = assigned_user.id
LEFT JOIN branches b ON si.branch_id = b.id
WHERE si.assigned_to IS NOT NULL

ORDER BY date_field ASC;

-- Update weekly_assignments_view
CREATE OR REPLACE VIEW public.weekly_assignments_view AS
SELECT 
  wt.id,
  wt.title,
  wt.description,
  wt.assigned_to,
  wt.assigned_by,
  wt.due_date,
  wt.priority,
  wt.status,
  wt.whatsapp_sent,
  wt.whatsapp_sent_at,
  wt.created_at,
  wt.updated_at,
  -- User information
  assigned_user.name as assigned_user_name,
  assigned_user.phone as assigned_user_phone,
  assigned_by_user.name as assigned_by_user_name,
  -- Product information (if linked to stock_items)
  si.product_name,
  si.quantity,
  si.unit_price,
  si.expiry_date,
  si.branch_id,
  b.name as branch_name,
  -- Risk level (based on due date for tasks) - UNIFORM RANGES
  CASE 
    WHEN wt.due_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'critical'
    WHEN wt.due_date <= CURRENT_DATE + INTERVAL '60 days' THEN 'high'
    WHEN wt.due_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'medium-high'
    WHEN wt.due_date <= CURRENT_DATE + INTERVAL '120 days' THEN 'medium-high'
    WHEN wt.due_date <= CURRENT_DATE + INTERVAL '180 days' THEN 'medium'
    WHEN wt.due_date <= CURRENT_DATE + INTERVAL '365 days' THEN 'low'
    ELSE 'very-low'
  END as risk_level,
  -- Task type
  CASE 
    WHEN si.id IS NOT NULL THEN 'product_assignment'
    ELSE 'general_task'
  END as task_type
FROM weekly_tasks wt
LEFT JOIN users assigned_user ON wt.assigned_to = assigned_user.id
LEFT JOIN users assigned_by_user ON wt.assigned_by = assigned_by_user.id
LEFT JOIN stock_items si ON wt.title LIKE '%' || si.product_name || '%' 
  OR wt.description LIKE '%' || si.product_name || '%'
LEFT JOIN branches b ON si.branch_id = b.id
ORDER BY wt.due_date ASC;

-- Update stock_items trigger to use uniform ranges
CREATE OR REPLACE FUNCTION update_stock_item_risk_level()
RETURNS TRIGGER AS $$
BEGIN
  NEW.days_to_expiry := EXTRACT(DAY FROM (NEW.expiry_date - NOW())); 
  NEW.value := NEW.quantity * NEW.unit_price; 
  
  -- UNIFORM RANGES
  IF NEW.days_to_expiry <= 30 THEN 
    NEW.risk_level := 'critical'; 
  ELSIF NEW.days_to_expiry <= 60 THEN 
    NEW.risk_level := 'high';
  ELSIF NEW.days_to_expiry <= 90 THEN 
    NEW.risk_level := 'medium-high';
  ELSIF NEW.days_to_expiry <= 120 THEN 
    NEW.risk_level := 'medium-high';
  ELSIF NEW.days_to_expiry <= 180 THEN 
    NEW.risk_level := 'medium';
  ELSIF NEW.days_to_expiry <= 365 THEN 
    NEW.risk_level := 'low';
  ELSE 
    NEW.risk_level := 'very-low';
  END IF;
  
  NEW.last_updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT ON public.unified_assignments_view TO authenticated;
GRANT SELECT ON public.weekly_assignments_view TO authenticated;
