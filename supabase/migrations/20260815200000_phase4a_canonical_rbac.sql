-- Final Phase 4A micro-correction: Consolidation of has_role_in_workspace
-- Starting SHA: c7693ffe65f4afaaa889ac62d5ef00deb1a471a8

BEGIN;

-- 1. Remove the text-based overload to avoid ambiguity
-- We must ensure all callers are updated or this is safe to drop.
-- Based on update_checklist_assignments, it calls (uuid, uuid, text).
-- We will consolidate to (uuid, uuid, app_role).

-- 2. Consolidate has_role_in_workspace to a single canonical signature
-- Canonical signature: has_role_in_workspace(_user_id uuid, _workspace_id uuid, _min_role app_role)
-- Note: The existing text signature has (p_workspace_id, p_user_id, p_min_role) - this order is inverted compared to the requirements.

-- Create/Update the canonical function with corrected logic
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
  -- A 'owner' role in workspace_members is NOT enough to be considered a workspace owner.
  IF v_owner_id = _user_id THEN
    v_user_role := 'admin'; -- We'll use 4 for priority logic below if owner
  ELSE
    SELECT role INTO v_user_role
    FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = _user_id
      AND status = 'active'
      AND role IN ('admin', 'editor', 'viewer');
  END IF;

  -- 3. Calculate priorities
  -- owner = 4 (strictly by workspace.owner_id)
  -- admin = 3
  -- editor = 2
  -- viewer = 1
  
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
    ELSE 0 -- We don't support passing 'owner' to _min_role directly in the enum yet if not added, 
           -- but based on the requirement 'owner = 4', we should handle it if passed.
  END;
  
  -- Handle 'owner' priority if app_role doesn't have it, or if it does.
  -- The requirement says: owner=4, admin=3, editor=2, viewer=1.
  -- If _min_role is 'admin', priority 3 is needed.
  -- If we ever need to check for owner only, we'd need 'owner' in app_role.
  
  RETURN v_role_priority >= v_min_priority;
END;
$$;

-- 3. Update update_checklist_assignments to use the canonical signature
-- Current call is public.has_role_in_workspace(p_workspace_id, v_actor_id, 'editor')
-- Target call is public.has_role_in_workspace(v_actor_id, p_workspace_id, 'editor'::app_role)

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
  -- 1. Obter ator exclusivamente por auth.uid()
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 2. Validar permissão (Editor ou superior) - USANDO ASSINATURA CANÔNICA
  IF NOT public.has_role_in_workspace(v_actor_id, p_workspace_id, 'editor'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: Insufficient permissions';
  END IF;

  -- 3. Confirmar que o checklist pertence ao workspace (com lock)
  SELECT workspace_id INTO v_workspace_id
  FROM public.checklists
  WHERE id = p_checklist_id
  FOR UPDATE;

  IF v_workspace_id IS NULL OR v_workspace_id <> p_workspace_id THEN
    RAISE EXCEPTION 'Invalid checklist for this workspace';
  END IF;

  -- 4. Normalizar e validar p_member_ids
  v_normalized_members := COALESCE(p_member_ids, ARRAY[]::uuid[]);

  -- 5. Rejeitar IDs duplicados
  IF array_length(v_normalized_members, 1) > 0 THEN
    IF (SELECT count(DISTINCT x) FROM unnest(v_normalized_members) x) <> array_length(v_normalized_members, 1) THEN
      RAISE EXCEPTION 'Duplicate member IDs provided';
    END IF;

    -- 6. Confirmar que todos os membros existem, estão ativos e pertencem ao workspace
    SELECT count(*) INTO v_member_count
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND status = 'active'
      AND id = ANY(v_normalized_members);

    IF v_member_count <> array_length(v_normalized_members, 1) THEN
      RAISE EXCEPTION 'One or more members are invalid, inactive or from another workspace';
    END IF;
  END IF;

  -- 7. Validar responsável principal
  IF p_primary_member_id IS NOT NULL THEN
    IF NOT (p_primary_member_id = ANY(v_normalized_members)) THEN
      RAISE EXCEPTION 'Primary member must be in the members list';
    END IF;
  END IF;

  IF array_length(v_normalized_members, 1) = 0 AND p_primary_member_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot set primary member with empty members list';
  END IF;

  -- 8. Apagar atribuições existentes com filtro duplo
  DELETE FROM public.checklist_assignments
  WHERE checklist_id = p_checklist_id
    AND workspace_id = p_workspace_id;

  -- 9. Inserir novas atribuições
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

-- 4. Drop the ambiguous text overload
-- First verify there are no other internal dependencies.
-- (We verified update_checklist_assignments, now we drop)
DROP FUNCTION public.has_role_in_workspace(uuid, uuid, text);

-- 5. Set explicit permissions
REVOKE ALL ON FUNCTION public.has_role_in_workspace(uuid, uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role_in_workspace(uuid, uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_checklist_assignments(uuid, uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_checklist_assignments(uuid, uuid, uuid[], uuid) TO authenticated, service_role;

COMMIT;
