-- Add Bbunga branch if it doesn't exist
INSERT INTO public.branches (name, code, region)
SELECT 'Bbunga', 'BBUNGA', 'Central'
WHERE NOT EXISTS (
    SELECT 1 FROM public.branches WHERE name = 'Bbunga'
); 