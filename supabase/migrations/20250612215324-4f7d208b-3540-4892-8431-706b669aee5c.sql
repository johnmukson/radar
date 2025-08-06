
-- Create an enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create a security definer function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create RLS policies for user_roles table
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Only admins can manage roles
CREATE POLICY "Admins can manage all roles"
  ON public.user_roles
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Add RLS policy to stock_items table to restrict uploads to admins only
CREATE POLICY "Only admins can insert stock items"
  ON public.stock_items
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow all authenticated users to view stock items
CREATE POLICY "All users can view stock items"
  ON public.stock_items
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can update stock items
CREATE POLICY "Only admins can update stock items"
  ON public.stock_items
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete stock items
CREATE POLICY "Only admins can delete stock items"
  ON public.stock_items
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Enable RLS on stock_items table
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
