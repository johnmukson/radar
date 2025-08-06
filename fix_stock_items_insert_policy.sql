-- Fix missing INSERT policy for stock_items table
-- This allows authenticated users to insert stock items

-- Add INSERT policy for stock_items
CREATE POLICY "Authenticated users can insert stock items" ON public.stock_items
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Also add a more permissive policy for testing
CREATE POLICY "Anyone can insert stock items for testing" ON public.stock_items
FOR INSERT WITH CHECK (true);

-- Grant necessary permissions
GRANT INSERT ON public.stock_items TO authenticated;
GRANT INSERT ON public.stock_items TO anon;

-- Verify the policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'stock_items'; 