
-- Remove the trigger that validates expiry dates to allow expired items
DROP TRIGGER IF EXISTS validate_expiry_date_trigger ON stock_items;

-- Optionally, if you want to completely remove the function as well:
-- DROP FUNCTION IF EXISTS validate_expiry_date();
