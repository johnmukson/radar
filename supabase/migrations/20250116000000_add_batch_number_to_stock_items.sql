-- Migration: Add batch_number column to stock_items table
-- Description: Add batch_number column to support duplicate detection based on batch numbers

-- Add batch_number column (nullable, as existing records won't have it)
ALTER TABLE public.stock_items 
ADD COLUMN IF NOT EXISTS batch_number TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN public.stock_items.batch_number IS 'Batch number for the stock item. Used in combination with product_name, branch_id, and expiry_date to identify unique items.';

-- Create index for batch_number lookups
CREATE INDEX IF NOT EXISTS idx_stock_items_batch_number 
ON public.stock_items (batch_number);

-- Update the composite index to include batch_number for duplicate detection
-- Drop the old composite index if it exists
DROP INDEX IF EXISTS idx_stock_items_product_branch_expiry;

-- Create new composite index including batch_number
CREATE INDEX IF NOT EXISTS idx_stock_items_product_branch_expiry_batch 
ON public.stock_items (product_name, branch_id, expiry_date, batch_number);

-- Also create a partial index for items with batch_number (for faster queries when batch_number is present)
CREATE INDEX IF NOT EXISTS idx_stock_items_product_branch_expiry_batch_not_null 
ON public.stock_items (product_name, branch_id, expiry_date, batch_number) 
WHERE batch_number IS NOT NULL;

COMMENT ON INDEX idx_stock_items_product_branch_expiry_batch IS 
'Composite index for duplicate detection: product_name, branch_id, expiry_date, batch_number';

COMMENT ON INDEX idx_stock_items_product_branch_expiry_batch_not_null IS 
'Partial composite index for items with batch_number (optimized for batch-based duplicate checks)';

