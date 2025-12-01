-- Migration: Core Tables
-- Description: Create core tables - branches, user_roles, stock_items, stock_movements, stock_movement_history

-- 4.1 Branches
-- Before defining user roles or stock items, create the branches table
CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  region text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Automatically update updated_at on change
CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4.2 Users and roles
-- Supabase manages auth.users automatically, so we create a mapping table to assign application roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role, branch_id)
);

COMMENT ON TABLE public.user_roles IS 'Roles assigned to users (can be per-branch)';

-- 4.3 Stock items and movements
-- Stock items held at branches
CREATE TABLE public.stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  expiry_date date NOT NULL,
  -- flag to mark items reserved for emergency use
  is_emergency boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_stock_items_updated_at
  BEFORE UPDATE ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Stock movement log (sell/move)
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  from_branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  to_branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  movement_type text NOT NULL CHECK (movement_type IN ('sell','move','adjust')),
  performed_by uuid NOT NULL REFERENCES auth.users(id),
  performed_at timestamptz NOT NULL DEFAULT NOW(),
  notes text
);

-- Movement history (immutable log)
-- This table records every stock movement or assignment event for audit purposes
CREATE TABLE public.stock_movement_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  movement_type text,
  quantity_moved integer NOT NULL CHECK (quantity_moved > 0),
  from_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  to_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  for_dispenser uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  moved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  movement_date timestamptz NOT NULL DEFAULT NOW(),
  notes text
);

-- Create indexes for efficient filtering
CREATE INDEX idx_stock_items_branch ON public.stock_items(branch_id);
CREATE INDEX idx_stock_movements_stock_item ON public.stock_movements(stock_item_id);
CREATE INDEX idx_stock_movement_history_stock_item ON public.stock_movement_history(stock_item_id);
CREATE INDEX idx_stock_movement_history_from_branch ON public.stock_movement_history(from_branch_id);
CREATE INDEX idx_stock_movement_history_to_branch ON public.stock_movement_history(to_branch_id);
CREATE INDEX idx_stock_movement_history_for_dispenser ON public.stock_movement_history(for_dispenser);
CREATE INDEX idx_stock_movement_history_moved_by ON public.stock_movement_history(moved_by);

