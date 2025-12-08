-- Migration: Add composite index for stock_items lookup
-- Description: Add index on (product_name, branch_id, expiry_date) for efficient duplicate checking during uploads

-- This index is critical for the reconcile mode in stock uploads
-- It allows fast lookups when checking if items already exist
CREATE INDEX IF NOT EXISTS idx_stock_items_product_branch_expiry 
ON public.stock_items (product_name, branch_id, expiry_date);

-- Also add index on product_name alone for general queries
CREATE INDEX IF NOT EXISTS idx_stock_items_product_name 
ON public.stock_items (product_name);

COMMENT ON INDEX idx_stock_items_product_branch_expiry IS 
'Composite index for efficient duplicate checking during stock uploads. Used by reconcile mode to find existing items.';

COMMENT ON INDEX idx_stock_items_product_name IS 
'Index on product_name for general product lookups and searches.';

