-- First, remove Bbunga if it exists (to avoid duplicates)
DELETE FROM public.branches WHERE name = 'Bbunga';

-- Then add Bbunga
INSERT INTO public.branches (name, code, region)
VALUES ('Bbunga', 'BBUNGA', 'Central'); 