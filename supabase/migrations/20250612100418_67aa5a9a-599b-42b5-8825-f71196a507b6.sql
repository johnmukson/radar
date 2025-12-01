
-- Create emergency_assignments table to track emergency product assignments
CREATE TABLE public.emergency_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE CASCADE NOT NULL,
  dispenser_id UUID REFERENCES public.dispensers(id) ON DELETE CASCADE NOT NULL,
  assigned_quantity INTEGER NOT NULL,
  deadline TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_by UUID REFERENCES auth.users(id) NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add emergency status column to stock_items table
ALTER TABLE public.stock_items 
ADD COLUMN is_emergency BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN emergency_declared_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN emergency_declared_by UUID REFERENCES auth.users(id);

-- Create index for better performance
CREATE INDEX idx_emergency_assignments_stock_item ON public.emergency_assignments(stock_item_id);
CREATE INDEX idx_emergency_assignments_dispenser ON public.emergency_assignments(dispenser_id);
CREATE INDEX idx_emergency_assignments_status ON public.emergency_assignments(status);
CREATE INDEX idx_stock_items_emergency ON public.stock_items(is_emergency);

-- Add trigger to update updated_at column
CREATE TRIGGER update_emergency_assignments_updated_at
  BEFORE UPDATE ON public.emergency_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on emergency_assignments table
ALTER TABLE public.emergency_assignments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for emergency_assignments
CREATE POLICY "Users can view emergency assignments" 
  ON public.emergency_assignments 
  FOR SELECT 
  USING (true);

CREATE POLICY "Only admins can create emergency assignments" 
  ON public.emergency_assignments 
  FOR INSERT 
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update emergency assignments" 
  ON public.emergency_assignments 
  FOR UPDATE 
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete emergency assignments" 
  ON public.emergency_assignments 
  FOR DELETE 
  USING (public.has_role(auth.uid(), 'admin'));
;
