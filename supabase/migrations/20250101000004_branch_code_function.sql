-- Migration: Branch Code Generator Function
-- Description: Generate a unique branch code with the format BR0001, BR0002, etc.
-- This must be created after the branches table exists

CREATE OR REPLACE FUNCTION public.generate_branch_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  max_code text;
  num_part integer;
BEGIN
  -- Find the highest branch code matching the BR#### pattern
  SELECT code INTO max_code
  FROM public.branches
  WHERE code ~ '^BR\d{4}$'
  ORDER BY code DESC
  LIMIT 1;

  IF max_code IS NULL THEN
    RETURN 'BR0001';
  END IF;

  num_part := (regexp_replace(max_code, '\D','','g'))::integer + 1;
  RETURN 'BR' || lpad(num_part::text, 4, '0');
END;
$$;

