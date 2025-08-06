
-- Drop the specific trigger that depends on the validate_expiry_date function
DROP TRIGGER IF EXISTS validate_stock_item_expiry_date ON stock_items;

-- Drop any other potential triggers
DROP TRIGGER IF EXISTS validate_expiry_date_trigger ON stock_items;
DROP TRIGGER IF EXISTS check_expiry_date_trigger ON stock_items;

-- Now we can remove the validation function
DROP FUNCTION IF EXISTS validate_expiry_date();

-- Also check for any check constraints that might be causing this
ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS check_expiry_date_not_past;
ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS stock_items_expiry_date_check;
