-- ============================================================================
-- Advanced Search - Saved Searches
-- Migration: 20250107000001_advanced_search.sql
-- Date: January 2025
-- Description: Creates table for saved searches functionality
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Saved Searches Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  search_criteria JSONB NOT NULL, -- Stores all search filters and criteria
  is_shared BOOLEAN DEFAULT false, -- Allow sharing searches with other users
  shared_with_branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE, -- Share with specific branch users
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,
  UNIQUE(user_id, name)
);

-- Indexes
CREATE INDEX idx_saved_searches_user_id ON public.saved_searches(user_id);
CREATE INDEX idx_saved_searches_shared ON public.saved_searches(is_shared, shared_with_branch_id);
CREATE INDEX idx_saved_searches_last_used ON public.saved_searches(last_used_at DESC);

-- Updated at trigger
CREATE TRIGGER update_saved_searches_updated_at
  BEFORE UPDATE ON public.saved_searches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comment
COMMENT ON TABLE public.saved_searches IS 'User saved search queries with filters and criteria';

-- ----------------------------------------------------------------------------
-- 2. RLS Policies for Saved Searches
-- ----------------------------------------------------------------------------
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

-- Users can manage their own saved searches
CREATE POLICY "Users can manage their own saved searches"
  ON public.saved_searches
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can view shared searches for their branch
CREATE POLICY "Users can view shared searches for their branch"
  ON public.saved_searches
  FOR SELECT
  USING (
    is_shared = true AND
    (
      shared_with_branch_id IS NULL OR
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.branch_id = shared_searches.shared_with_branch_id
      )
    )
  );

-- System admins can view all saved searches
CREATE POLICY "System admins can view all saved searches"
  ON public.saved_searches
  FOR SELECT
  USING (public.has_role(auth.uid(), 'system_admin'));

-- ----------------------------------------------------------------------------
-- 3. Function to Update Last Used and Use Count
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_saved_search_usage(
  p_search_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.saved_searches
  SET 
    last_used_at = NOW(),
    use_count = use_count + 1
  WHERE id = p_search_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment
COMMENT ON FUNCTION public.update_saved_search_usage IS 'Updates the last used timestamp and use count for a saved search';

