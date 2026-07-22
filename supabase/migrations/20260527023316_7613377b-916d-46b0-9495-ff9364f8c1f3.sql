-- Clean up workspace_members policies
DROP POLICY IF EXISTS "Admins can view members" ON public.workspace_members;
DROP POLICY IF EXISTS "Admins can manage workspace members" ON public.workspace_members;
DROP POLICY IF EXISTS "Members can view their own memberships" ON public.workspace_members;
DROP POLICY IF EXISTS "Owners can manage their workspace members" ON public.workspace_members;
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.workspace_members;
DROP POLICY IF EXISTS "Users can view workspace members" ON public.workspace_members;

-- New workspace_members policies
CREATE POLICY "Users can view their own memberships" 
ON public.workspace_members FOR SELECT 
USING (auth.uid() = user_id OR email = (auth.jwt() ->> 'email'));

CREATE POLICY "Workspace members can view all members" 
ON public.workspace_members FOR SELECT 
USING (public.user_has_workspace_access(COALESCE(workspace_id, ws_id), auth.uid(), 'viewer'));

CREATE POLICY "Admins can manage members" 
ON public.workspace_members FOR ALL
USING (public.user_has_workspace_access(COALESCE(workspace_id, ws_id), auth.uid(), 'admin'));

-- Clean up workspaces policies to avoid recursion
DROP POLICY IF EXISTS "Admins can update workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can view workspaces they are members of" ON public.workspaces;

CREATE POLICY "Members can view workspaces" 
ON public.workspaces FOR SELECT 
USING (
  owner_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.workspace_members 
    WHERE (workspace_id = public.workspaces.id OR ws_id = public.workspaces.id) 
    AND (user_id = auth.uid() OR email = (auth.jwt() ->> 'email'))
    AND status = 'active'
  )
);

CREATE POLICY "Admins can update workspaces" 
ON public.workspaces FOR UPDATE 
USING (
  owner_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.workspace_members 
    WHERE (workspace_id = public.workspaces.id OR ws_id = public.workspaces.id) 
    AND user_id = auth.uid() 
    AND role = 'admin' 
    AND status = 'active'
  )
);
