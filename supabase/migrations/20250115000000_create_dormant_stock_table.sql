-- Create dormant_stock table
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
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dormant_stock ENABLE ROW LEVEL SECURITY;

-- Create policies for dormant_stock
CREATE POLICY "Admins can manage all dormant stock" ON public.dormant_stock
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() AND role IN ('admin', 'system_admin')
        )
    );

CREATE POLICY "Branch admins can manage their branch dormant stock" ON public.dormant_stock
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() 
            AND role = 'branch_system_admin'
            AND branch_id = dormant_stock.branch_id
        )
    );

-- Create index for better performance
CREATE INDEX idx_dormant_stock_branch_id ON public.dormant_stock(branch_id);
CREATE INDEX idx_dormant_stock_product_id ON public.dormant_stock(product_id);
CREATE INDEX idx_dormant_stock_classification ON public.dormant_stock(classification);
