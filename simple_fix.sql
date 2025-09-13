-- SIMPLE FIX - Remove problematic relationships
-- This creates a clean dormant_stock table without complex foreign keys

-- Drop and recreate the table with simpler structure
DROP TABLE IF EXISTS public.dormant_stock CASCADE;

-- Create the table without foreign key to auth.users (which causes schema cache issues)
CREATE TABLE public.dormant_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    excess_value NUMERIC(10,2) NOT NULL,
    excess_qty INTEGER NOT NULL,
    sales INTEGER NOT NULL DEFAULT 0,
    days INTEGER NOT NULL,
    classification TEXT NOT NULL CHECK (classification IN ('OTC', 'POM', 'POM/OTC')),
    branch_id UUID REFERENCES public.branches(id),
    uploaded_by UUID, -- Remove foreign key to avoid schema cache issues
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dormant_stock ENABLE ROW LEVEL SECURITY;

-- Create simple policies
CREATE POLICY "dormant_stock_read" ON public.dormant_stock
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "dormant_stock_insert" ON public.dormant_stock
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "dormant_stock_update" ON public.dormant_stock
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "dormant_stock_delete" ON public.dormant_stock
    FOR DELETE USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON public.dormant_stock TO authenticated;
GRANT ALL ON public.dormant_stock TO anon;

-- Create indexes
CREATE INDEX idx_dormant_stock_branch_id ON public.dormant_stock(branch_id);
CREATE INDEX idx_dormant_stock_product_id ON public.dormant_stock(product_id);
CREATE INDEX idx_dormant_stock_classification ON public.dormant_stock(classification);
CREATE INDEX idx_dormant_stock_created_at ON public.dormant_stock(created_at);

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
