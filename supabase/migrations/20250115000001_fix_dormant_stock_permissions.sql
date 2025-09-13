-- Fix permissions for dormant_stock table
-- This migration ensures proper RLS policies and permissions

-- First, ensure the table exists (in case the previous migration wasn't run)
CREATE TABLE IF NOT EXISTS public.dormant_stock (
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

-- Drop any existing policies to start fresh
DROP POLICY IF EXISTS "Admins can manage all dormant stock" ON public.dormant_stock;
DROP POLICY IF EXISTS "Authenticated users can read dormant stock" ON public.dormant_stock;
DROP POLICY IF EXISTS "Authenticated users can insert dormant stock" ON public.dormant_stock;
DROP POLICY IF EXISTS "Authenticated users can update dormant stock" ON public.dormant_stock;
DROP POLICY IF EXISTS "Authenticated users can delete dormant stock" ON public.dormant_stock;
DROP POLICY IF EXISTS "Admin users can manage dormant stock" ON public.dormant_stock;

-- Create comprehensive policies that work with your existing user_roles system

-- Policy for SELECT (reading data)
CREATE POLICY "dormant_stock_select_policy" ON public.dormant_stock
    FOR SELECT USING (
        -- Allow admins and system admins
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('admin', 'system_admin')
        )
        OR
        -- Allow authenticated users to read (for broader access)
        auth.role() = 'authenticated'
    );

-- Policy for INSERT (creating new records)
CREATE POLICY "dormant_stock_insert_policy" ON public.dormant_stock
    FOR INSERT WITH CHECK (
        -- Allow admins and system admins
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('admin', 'system_admin')
        )
        OR
        -- Allow authenticated users to insert (for broader access)
        auth.role() = 'authenticated'
    );

-- Policy for UPDATE (modifying existing records)
CREATE POLICY "dormant_stock_update_policy" ON public.dormant_stock
    FOR UPDATE USING (
        -- Allow admins and system admins
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('admin', 'system_admin')
        )
        OR
        -- Allow authenticated users to update (for broader access)
        auth.role() = 'authenticated'
    );

-- Policy for DELETE (removing records)
CREATE POLICY "dormant_stock_delete_policy" ON public.dormant_stock
    FOR DELETE USING (
        -- Only allow admins and system admins to delete
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('admin', 'system_admin')
        )
    );

-- Grant necessary permissions to the authenticated role
GRANT ALL ON public.dormant_stock TO authenticated;
GRANT ALL ON public.dormant_stock TO anon;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_dormant_stock_branch_id ON public.dormant_stock(branch_id);
CREATE INDEX IF NOT EXISTS idx_dormant_stock_product_id ON public.dormant_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_dormant_stock_classification ON public.dormant_stock(classification);
CREATE INDEX IF NOT EXISTS idx_dormant_stock_created_at ON public.dormant_stock(created_at);
CREATE INDEX IF NOT EXISTS idx_dormant_stock_uploaded_by ON public.dormant_stock(uploaded_by);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_dormant_stock_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_dormant_stock_updated_at ON public.dormant_stock;
CREATE TRIGGER update_dormant_stock_updated_at
    BEFORE UPDATE ON public.dormant_stock
    FOR EACH ROW
    EXECUTE FUNCTION update_dormant_stock_updated_at();

-- Ensure the user_roles table exists (in case it doesn't)
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'system_admin', 'manager', 'dispenser', 'doctor')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id)
);

-- Enable RLS on user_roles if not already enabled
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create policies for user_roles table
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;

CREATE POLICY "Users can view their own role" ON public.user_roles
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage user roles" ON public.user_roles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('admin', 'system_admin')
        )
    );

-- Grant permissions on user_roles
GRANT ALL ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO anon;

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';
