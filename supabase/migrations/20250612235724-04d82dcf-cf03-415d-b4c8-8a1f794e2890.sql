
-- First, add a unique constraint on user_id to prevent duplicate roles per user
ALTER TABLE public.user_roles 
ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);

-- Now insert Mukwaya Johnson as system admin
INSERT INTO public.user_roles (user_id, role, branch_id) 
VALUES (
  'eefe0d52-8c3b-4c95-8589-4ac26941bf74', 
  'system_admin',
  NULL
) 
ON CONFLICT (user_id) 
DO UPDATE SET role = 'system_admin', branch_id = NULL;
