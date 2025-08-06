
-- Fix the update_updated_at_column function to have an immutable search_path
-- This prevents potential security vulnerabilities from search_path manipulation

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
