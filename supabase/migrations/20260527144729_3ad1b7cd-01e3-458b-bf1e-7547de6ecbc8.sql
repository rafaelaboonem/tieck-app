-- 1. Remover a restrição incorreta
ALTER TABLE public.workspace_members DROP CONSTRAINT IF EXISTS workspace_members_workspace_id_fkey;

-- 2. Adicionar a restrição correta
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_workspace_id_fkey 
FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- 3. Tornar o email opcional
ALTER TABLE public.workspace_members ALTER COLUMN email DROP NOT NULL;

-- 4. Atualizar a função do gatilho
CREATE OR REPLACE FUNCTION public.handle_new_workspace_owner()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    SELECT email INTO user_email FROM auth.users WHERE id = NEW.owner_id;
    
    INSERT INTO public.workspace_members (workspace_id, user_id, email, role, status)
    VALUES (NEW.id, NEW.owner_id, user_email, 'admin', 'active')
    ON CONFLICT (workspace_id, user_id) DO UPDATE 
    SET role = 'admin', status = 'active', email = COALESCE(workspace_members.email, user_email);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Vincular workspaces aos seus donos
UPDATE workspaces SET owner_id = 'f3bdece2-237a-4ce9-90e1-c8af1e61a71a' WHERE id = '3dde5999-57f4-4384-8aed-0be64f49d77b';
UPDATE workspaces SET owner_id = '64a1f96e-a406-4d55-a8df-29de7115c14f' WHERE id = 'f246d147-9742-49e9-a19a-76e1a795c5f2';
UPDATE workspaces SET owner_id = 'a3dc09b9-34ca-48ed-b780-0059e42b4b1f' WHERE id = 'f455911b-1014-4da0-80d5-fca75382556a';
UPDATE workspaces SET owner_id = '3bb91d65-26d7-4fc7-ac02-c140431f5a78' WHERE id = '8de4f924-fc1b-43f3-b8fb-b80ee67572ff';