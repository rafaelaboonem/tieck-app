-- 1. Create workspaces table
CREATE TABLE public.workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Meu workspace',
  icon TEXT DEFAULT '📁',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- 2. Add workspace_id to checklists
ALTER TABLE public.checklists ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- 3. Replace workspace_members.workspace_id semantics (was user_id, now actual workspace id)
-- We'll add a new column and keep the old for backward compat during transition
ALTER TABLE public.workspace_members ADD COLUMN ws_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- 4. Security definer helper to check workspace access
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(_workspace_id UUID, _user_id UUID, _min_role TEXT DEFAULT 'viewer')
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_owner BOOLEAN;
  member_role TEXT;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.workspaces WHERE id = _workspace_id AND owner_id = _user_id) INTO is_owner;
  IF is_owner THEN RETURN TRUE; END IF;
  
  SELECT role INTO member_role FROM public.workspace_members
  WHERE ws_id = _workspace_id 
    AND (user_id = _user_id OR email = (SELECT email FROM auth.users WHERE id = _user_id))
    AND status = 'active'
  LIMIT 1;
  
  IF member_role IS NULL THEN RETURN FALSE; END IF;
  
  IF _min_role = 'viewer' THEN RETURN TRUE;
  ELSIF _min_role = 'editor' THEN RETURN member_role IN ('editor', 'admin');
  ELSIF _min_role = 'admin' THEN RETURN member_role = 'admin';
  END IF;
  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_has_workspace_access(UUID, UUID, TEXT) TO authenticated;

-- 5. RLS policies for workspaces
CREATE POLICY "Users can view workspaces they own or are members of"
ON public.workspaces FOR SELECT
USING (owner_id = auth.uid() OR public.user_has_workspace_access(id, auth.uid(), 'viewer'));

CREATE POLICY "Users can create their own workspaces"
ON public.workspaces FOR INSERT
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update their workspaces"
ON public.workspaces FOR UPDATE
USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete their workspaces"
ON public.workspaces FOR DELETE
USING (owner_id = auth.uid());

-- 6. Auto-create default workspace on profile creation + backfill
CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspaces (owner_id, name, icon)
  VALUES (NEW.id, 'Meu workspace', '🏠');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_workspace
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_workspace();

-- 7. Backfill: create a default workspace for every existing profile and assign checklists
DO $$
DECLARE
  profile_rec RECORD;
  new_ws_id UUID;
BEGIN
  FOR profile_rec IN SELECT id FROM public.profiles LOOP
    -- Create default workspace
    INSERT INTO public.workspaces (owner_id, name, icon)
    VALUES (profile_rec.id, 'Meu workspace', '🏠')
    RETURNING id INTO new_ws_id;
    
    -- Assign all checklists of this user to the new workspace
    UPDATE public.checklists SET workspace_id = new_ws_id WHERE user_id = profile_rec.id AND workspace_id IS NULL;
    
    -- Migrate existing workspace_members (where workspace_id was user_id)
    UPDATE public.workspace_members SET ws_id = new_ws_id WHERE workspace_id = profile_rec.id AND ws_id IS NULL;
  END LOOP;
END $$;

-- 8. New RLS policies for checklists using workspace access
CREATE POLICY "Workspace members can view checklists"
ON public.checklists FOR SELECT
USING (workspace_id IS NOT NULL AND public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));

CREATE POLICY "Workspace editors can update checklists"
ON public.checklists FOR UPDATE
USING (workspace_id IS NOT NULL AND public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

CREATE POLICY "Workspace editors can insert checklists"
ON public.checklists FOR INSERT
WITH CHECK (workspace_id IS NULL OR public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

CREATE POLICY "Workspace admins can delete checklists"
ON public.checklists FOR DELETE
USING (workspace_id IS NOT NULL AND public.user_has_workspace_access(workspace_id, auth.uid(), 'admin'));

-- 9. Update workspace_members RLS for new ws_id
CREATE POLICY "Workspace admins can manage members via ws_id"
ON public.workspace_members FOR ALL
USING (ws_id IS NOT NULL AND public.user_has_workspace_access(ws_id, auth.uid(), 'admin'));

CREATE POLICY "Members can view members of their workspaces"
ON public.workspace_members FOR SELECT
USING (ws_id IS NOT NULL AND public.user_has_workspace_access(ws_id, auth.uid(), 'viewer'));

-- 10. Trigger for updated_at on workspaces
CREATE TRIGGER update_workspaces_updated_at
BEFORE UPDATE ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
