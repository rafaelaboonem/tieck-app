-- Drop all potentially existing policies
DROP POLICY IF EXISTS "Users can view relevant checklists" ON checklists;
DROP POLICY IF EXISTS "Users can insert checklists" ON checklists;
DROP POLICY IF EXISTS "Users can update checklists" ON checklists;
DROP POLICY IF EXISTS "Users can delete checklists" ON checklists;
DROP POLICY IF EXISTS "Users can view categories in their workspaces" ON workspace_categories;
DROP POLICY IF EXISTS "Owners and admins can manage categories" ON workspace_categories;
DROP POLICY IF EXISTS "Editors and admins can manage categories" ON workspace_categories;
DROP POLICY IF EXISTS "Users can view workspace members" ON workspace_members;
DROP POLICY IF EXISTS "Admins can manage workspace members" ON workspace_members;

-- Drop function with CASCADE just in case
DROP FUNCTION IF EXISTS public.user_has_workspace_access(uuid, uuid, text) CASCADE;

-- Recreate the function
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(p_ws_id uuid, p_u_id uuid, p_min_role text DEFAULT 'viewer'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    user_role text;
    role_priority int;
    min_priority int;
BEGIN
    -- Check ownership first (admin role)
    IF EXISTS (SELECT 1 FROM workspaces WHERE id = p_ws_id AND owner_id = p_u_id) THEN
        user_role := 'admin';
    ELSE
        -- Check member table
        SELECT role INTO user_role 
        FROM workspace_members 
        WHERE (workspace_id = p_ws_id OR ws_id = p_ws_id) AND user_id = p_u_id AND status = 'active'
        LIMIT 1;
    END IF;

    IF user_role IS NULL THEN
        RETURN false;
    END IF;

    role_priority := CASE user_role WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END;
    min_priority := CASE p_min_role WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END;

    RETURN role_priority >= min_priority;
END;
$function$;

-- Recreate policies for checklists
CREATE POLICY "Users can view relevant checklists" 
ON checklists FOR SELECT 
USING (
  (auth.uid() = user_id) OR 
  (is_published = true) OR
  ((workspace_id IS NOT NULL) AND user_has_workspace_access(workspace_id, auth.uid(), 'viewer'))
);

CREATE POLICY "Users can insert checklists" 
ON checklists FOR INSERT 
WITH CHECK (
  (auth.uid() = user_id) AND 
  ((workspace_id IS NULL) OR user_has_workspace_access(workspace_id, auth.uid(), 'editor'))
);

CREATE POLICY "Users can update checklists" 
ON checklists FOR UPDATE 
USING (
  (auth.uid() = user_id) OR 
  ((workspace_id IS NOT NULL) AND user_has_workspace_access(workspace_id, auth.uid(), 'editor'))
);

CREATE POLICY "Users can delete checklists" 
ON checklists FOR DELETE 
USING (
  (auth.uid() = user_id) OR 
  ((workspace_id IS NOT NULL) AND user_has_workspace_access(workspace_id, auth.uid(), 'admin'))
);

-- Recreate policies for workspace_categories
CREATE POLICY "Users can view categories in their workspaces" 
ON workspace_categories FOR SELECT 
USING (user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));

CREATE POLICY "Editors and admins can manage categories" 
ON workspace_categories FOR ALL 
USING (user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

-- Recreate policies for workspace_members
CREATE POLICY "Users can view workspace members" 
ON workspace_members FOR SELECT 
USING (user_has_workspace_access(COALESCE(workspace_id, ws_id), auth.uid(), 'viewer'));

CREATE POLICY "Admins can manage workspace members" 
ON workspace_members FOR ALL 
USING (user_has_workspace_access(COALESCE(workspace_id, ws_id), auth.uid(), 'admin'));
