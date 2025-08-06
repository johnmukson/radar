
-- Create stock_movement_history table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.stock_movement_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE CASCADE,
  movement_type TEXT,
  quantity_moved INTEGER NOT NULL,
  from_branch TEXT,
  to_branch TEXT,
  movement_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  moved_by UUID REFERENCES auth.users(id),
  for_dispenser UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on stock_movement_history
ALTER TABLE public.stock_movement_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for stock_movement_history
CREATE POLICY "All authenticated users can view stock movements" 
  ON public.stock_movement_history 
  FOR SELECT 
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert stock movements" 
  ON public.stock_movement_history 
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'system_admin') OR
    public.has_role(auth.uid(), 'regional_manager')
  );

CREATE POLICY "Admins can update stock movements" 
  ON public.stock_movement_history 
  FOR UPDATE 
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'system_admin') OR
    public.has_role(auth.uid(), 'regional_manager')
  );

CREATE POLICY "Admins can delete stock movements" 
  ON public.stock_movement_history 
  FOR DELETE 
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'system_admin') OR
    public.has_role(auth.uid(), 'regional_manager')
  );

-- Add trigger for updated_at column
CREATE OR REPLACE TRIGGER update_stock_movement_history_updated_at
  BEFORE UPDATE ON public.stock_movement_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
