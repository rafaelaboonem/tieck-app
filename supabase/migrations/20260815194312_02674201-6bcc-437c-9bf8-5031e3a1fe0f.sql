-- Hotfix cirúrgico da Fase 4A
-- SHA Inicial: 982ad624fa336b6f0cdc23e3d11d0a4a85e7e556

BEGIN;

-- 1. Consolidar has_role_in_workspace com prioridades corretas e search_path seguro
CREATE OR REPLACE FUNCTION public.has_role_in_workspace(
  p_workspace_id uuid,
  p_user_id uuid,
  p_min_role text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_role text;
  v_workspace_owner_id uuid;
  v_role_priority int;
  v_min_priority int;
BEGIN
  -- Obter o papel do usuário no workspace
  SELECT role INTO v_user_role
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND status = 'active';

  -- Obter o dono do workspace
  SELECT owner_id INTO v_workspace_owner_id
  FROM public.workspaces
  WHERE id = p_workspace_id;

  -- Se for o dono do workspace, o papel é 'owner'
  IF v_workspace_owner_id = p_user_id THEN
    v_user_role := 'owner';
  END IF;

  IF v_user_role IS NULL THEN
    RETURN false;
  END IF;

  -- Mapear prioridades
  v_role_priority := CASE v_user_role
    WHEN 'owner' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'editor' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 0
  END;

  v_min_priority := CASE p_min_role
    WHEN 'owner' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'editor' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 99 -- Falha fechada para papéis desconhecidos
  END;

  RETURN v_role_priority >= v_min_priority;
END;
$$;

REVOKE ALL ON FUNCTION public.has_role_in_workspace(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role_in_workspace(uuid, uuid, text) TO authenticated, service_role;

-- 2. Restaurar integralmente a segurança de update_checklist_assignments
CREATE OR REPLACE FUNCTION public.update_checklist_assignments(
  p_workspace_id uuid,
  p_checklist_id uuid,
  p_member_ids uuid[],
  p_primary_member_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  -- 2. Validar permissão (Editor ou superior)
  IF NOT public.has_role_in_workspace(p_workspace_id, v_actor_id, 'editor') THEN
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

REVOKE ALL ON FUNCTION public.update_checklist_assignments(uuid, uuid, uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_checklist_assignments(uuid, uuid, uuid[], uuid) TO authenticated, service_role;

-- 4. Restaurar política checklists_owner_all
DROP POLICY IF EXISTS checklists_owner_all ON public.checklists;
CREATE POLICY checklists_owner_all ON public.checklists
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  OR (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = checklists.workspace_id
        AND w.owner_id = auth.uid()
    )
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = checklists.workspace_id
        AND w.owner_id = auth.uid()
    )
  )
);

COMMIT;
