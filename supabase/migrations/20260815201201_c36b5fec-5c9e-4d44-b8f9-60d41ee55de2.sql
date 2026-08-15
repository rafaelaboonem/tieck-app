
-- Final Phase 4A micro-correction: Consolidation of has_role_in_workspace

BEGIN;

-- 1. Temporarily drop dependent policy to allow function redefinition without CASCADE
DROP POLICY IF EXISTS "Members can view their teammates" ON public.workspace_members;

-- 2. Drop existing functions to allow clean re-creation without parameter default conflicts
DROP FUNCTION IF EXISTS public.has_role_in_workspace(uuid, uuid, public.app_role);
DROP FUNCTION IF EXISTS public.has_role_in_workspace(uuid, uuid, text);

-- 3. Create the canonical function with corrected logic and argument order
CREATE OR REPLACE FUNCTION public.has_role_in_workspace(
  _user_id uuid,
  _workspace_id uuid,
  _min_role public.app_role
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_role public.app_role;
  v_owner_id uuid;
  v_role_priority int;
  v_min_priority int;
BEGIN
  -- 1. Verify if user is the actual owner (exclusive source of owner status)
  SELECT owner_id INTO v_owner_id
  FROM public.workspaces
  WHERE id = _workspace_id;

  -- 2. Get the role from members table (only for non-owners)
  IF v_owner_id = _user_id THEN
    v_user_role := 'admin'; -- Placeholder
  ELSE
    SELECT role INTO v_user_role
    FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = _user_id
      AND status = 'active'
      AND role IN ('admin', 'editor', 'viewer');
  END IF;

  -- 3. Calculate priorities
  v_role_priority := CASE 
    WHEN v_owner_id = _user_id THEN 4
    WHEN v_user_role = 'admin' THEN 3
    WHEN v_user_role = 'editor' THEN 2
    WHEN v_user_role = 'viewer' THEN 1
    ELSE 0
  END;

  v_min_priority := CASE _min_role
    WHEN 'admin' THEN 3
    WHEN 'editor' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 0
  END;
  
  RETURN v_role_priority >= v_min_priority;
END;
$$;

-- 4. Restore the dependent policy using the canonical signature
CREATE POLICY "Members can view their teammates" ON public.workspace_members
FOR SELECT
TO authenticated
USING (public.has_role_in_workspace(auth.uid(), workspace_id, 'viewer'::public.app_role));

-- 5. Update update_checklist_assignments to use the canonical signature
CREATE OR REPLACE FUNCTION public.update_checklist_assignments(
  p_workspace_id uuid, 
  p_checklist_id uuid, 
  p_member_ids uuid[], 
  p_primary_member_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor_id uuid;
  v_member_count int;
  v_workspace_id uuid;
  v_normalized_members uuid[];
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.has_role_in_workspace(v_actor_id, p_workspace_id, 'editor'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: Insufficient permissions';
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.checklists
  WHERE id = p_checklist_id
  FOR UPDATE;

  IF v_workspace_id IS NULL OR v_workspace_id <> p_workspace_id THEN
    RAISE EXCEPTION 'Invalid checklist for this workspace';
  END IF;

  v_normalized_members := COALESCE(p_member_ids, ARRAY[]::uuid[]);

  IF array_length(v_normalized_members, 1) > 0 THEN
    IF (SELECT count(DISTINCT x) FROM unnest(v_normalized_members) x) <> array_length(v_normalized_members, 1) THEN
      RAISE EXCEPTION 'Duplicate member IDs provided';
    END IF;

    SELECT count(*) INTO v_member_count
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND status = 'active'
      AND id = ANY(v_normalized_members);

    IF v_member_count <> array_length(v_normalized_members, 1) THEN
      RAISE EXCEPTION 'One or more members are invalid, inactive or from another workspace';
    END IF;
  END IF;

  IF p_primary_member_id IS NOT NULL THEN
    IF NOT (p_primary_member_id = ANY(v_normalized_members)) THEN
      RAISE EXCEPTION 'Primary member must be in the members list';
    END IF;
  END IF;

  IF array_length(v_normalized_members, 1) = 0 AND p_primary_member_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot set primary member with empty members list';
  END IF;

  DELETE FROM public.checklist_assignments
  WHERE checklist_id = p_checklist_id
    AND workspace_id = p_workspace_id;

  IF array_length(v_normalized_members, 1) > 0 THEN
    INSERT INTO public.checklist_assignments (
      workspace_id,
      checklist_id,
      workspace_member_id,
      is_primary,
      created_by
    )
    SELECT 
      p_workspace_id,
      p_checklist_id,
      m.id,
      (m.id = COALESCE(p_primary_member_id, '00000000-0000-0000-0000-000000000000'::uuid)),
      v_actor_id
    FROM unnest(v_normalized_members) AS m(id);
  END IF;

  RETURN true;
END;
$$;

-- 6. Final Permissions
REVOKE ALL ON FUNCTION public.has_role_in_workspace(uuid, uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role_in_workspace(uuid, uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_checklist_assignments(uuid, uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_checklist_assignments(uuid, uuid, uuid[], uuid) TO authenticated, service_role;

COMMIT;
