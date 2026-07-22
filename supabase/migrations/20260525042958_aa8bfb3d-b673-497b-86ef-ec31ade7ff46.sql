-- 1. DROP ALL DEPENDENT POLICIES ACROSS ALL TABLES
DROP POLICY IF EXISTS "Public can view published checklists" ON public.checklists;
DROP POLICY IF EXISTS "Users can view relevant checklists" ON public.checklists;
DROP POLICY IF EXISTS "Users can insert checklists" ON public.checklists;
DROP POLICY IF EXISTS "Users can update checklists" ON public.checklists;
DROP POLICY IF EXISTS "Users can delete checklists" ON public.checklists;
DROP POLICY IF EXISTS "Members can view workspace checklists" ON public.checklists;
DROP POLICY IF EXISTS "Members can update workspace checklists" ON public.checklists;
DROP POLICY IF EXISTS "Users can view their own checklists" ON public.checklists;
DROP POLICY IF EXISTS "Users can insert their own checklists" ON public.checklists;
DROP POLICY IF EXISTS "Users can update their own checklists" ON public.checklists;
DROP POLICY IF EXISTS "Users can delete their own checklists" ON public.checklists;
DROP POLICY IF EXISTS "Usuários podem ver seus próprios checklists" ON public.checklists;
DROP POLICY IF EXISTS "Usuários podem criar checklists" ON public.checklists;
DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios checklists" ON public.checklists;
DROP POLICY IF EXISTS "Workspace members can view checklists" ON public.checklists;
DROP POLICY IF EXISTS "Workspace editors can insert checklists" ON public.checklists;
DROP POLICY IF EXISTS "Workspace editors can update checklists" ON public.checklists;
DROP POLICY IF EXISTS "Workspace admins can delete checklists" ON public.checklists;

DROP POLICY IF EXISTS "Users can view their workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can create workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Owners can update workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Owners can delete workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can view workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can view workspaces they own or are members of" ON public.workspaces;

DROP POLICY IF EXISTS "Workspace admins can manage members via ws_id" ON public.workspace_members;
DROP POLICY IF EXISTS "Members can view members of their workspaces" ON public.workspace_members;
DROP POLICY IF EXISTS "Users can view members of their workspaces" ON public.workspace_members;

-- 2. DROP AND RECREATE THE FUNCTION (required for parameter renaming and consistency)
DROP FUNCTION IF EXISTS public.user_has_workspace_access(uuid, uuid, text) CASCADE;

CREATE OR REPLACE FUNCTION public.user_has_workspace_access(ws_id uuid, u_id uuid, min_role text DEFAULT 'viewer')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role text;
    role_priority int;
    min_priority int;
BEGIN
    -- Check ownership first (admin role)
    IF EXISTS (SELECT 1 FROM workspaces WHERE id = ws_id AND owner_id = u_id) THEN
        user_role := 'admin';
    ELSE
        -- Check member table
        -- We use workspace_id here, but some previous migrations used ws_id
        -- Checking for column existence to be safe or just standardizing
        SELECT role INTO user_role 
        FROM workspace_members 
        WHERE (workspace_id = ws_id OR ws_id = ws_id) AND user_id = u_id AND status = 'active'
        LIMIT 1;
    END IF;

    IF user_role IS NULL THEN
        RETURN false;
    END IF;

    role_priority := CASE user_role WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END;
    min_priority := CASE min_role WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END;

    RETURN role_priority >= min_priority;
END;
$$;

-- 3. RE-APPLY CHECKLIST POLICIES
CREATE POLICY "Public can view published checklists" 
ON public.checklists FOR SELECT 
USING (is_published = true);

CREATE POLICY "Users can view relevant checklists"
ON public.checklists FOR SELECT
USING (
  auth.uid() = user_id OR 
  (workspace_id IS NOT NULL AND user_has_workspace_access(workspace_id, auth.uid(), 'viewer'))
);

CREATE POLICY "Users can insert checklists"
ON public.checklists FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND (
    workspace_id IS NULL OR 
    user_has_workspace_access(workspace_id, auth.uid(), 'editor')
  )
);

CREATE POLICY "Users can update checklists"
ON public.checklists FOR UPDATE
USING (
  auth.uid() = user_id OR 
  (workspace_id IS NOT NULL AND user_has_workspace_access(workspace_id, auth.uid(), 'editor'))
);

CREATE POLICY "Users can delete checklists"
ON public.checklists FOR DELETE
USING (
  auth.uid() = user_id OR 
  (workspace_id IS NOT NULL AND user_has_workspace_access(workspace_id, auth.uid(), 'admin'))
);

-- 4. RE-APPLY WORKSPACE POLICIES
CREATE POLICY "Users can view workspaces"
ON public.workspaces FOR SELECT
USING (
  owner_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM workspace_members WHERE (workspace_id = workspaces.id OR ws_id = workspaces.id) AND user_id = auth.uid() AND status = 'active')
);

CREATE POLICY "Users can create workspaces"
ON public.workspaces FOR INSERT
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update workspaces"
ON public.workspaces FOR UPDATE
USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete workspaces"
ON public.workspaces FOR DELETE
USING (owner_id = auth.uid());

-- 5. RE-APPLY WORKSPACE MEMBERS POLICIES
CREATE POLICY "Users can view workspace members"
ON public.workspace_members FOR SELECT
USING (
  user_id = auth.uid() OR
  (workspace_id IS NOT NULL AND user_has_workspace_access(workspace_id, auth.uid(), 'viewer')) OR
  (ws_id IS NOT NULL AND user_has_workspace_access(ws_id, auth.uid(), 'viewer'))
);

CREATE POLICY "Admins can manage workspace members"
ON public.workspace_members FOR ALL
USING (
  (workspace_id IS NOT NULL AND user_has_workspace_access(workspace_id, auth.uid(), 'admin')) OR
  (ws_id IS NOT NULL AND user_has_workspace_access(ws_id, auth.uid(), 'admin'))
);
