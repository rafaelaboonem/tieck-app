-- 1. DROP old signatures and recreate canonical update_checklist_assignments
DROP FUNCTION IF EXISTS public.update_checklist_assignments(uuid, uuid, uuid[]);
DROP FUNCTION IF EXISTS public.update_checklist_assignments(uuid, uuid, uuid[], uuid);

CREATE OR REPLACE FUNCTION public.update_checklist_assignments(
    p_workspace_id uuid,
    p_checklist_id uuid,
    p_member_ids uuid[],
    p_primary_member_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_m_id uuid;
BEGIN
    v_user_id := auth.uid();
    
    -- RBAC check: Only owner, admin or editor can manage assignments
    IF NOT EXISTS (
        SELECT 1 FROM public.workspace_members 
        WHERE workspace_id = p_workspace_id 
        AND user_id = v_user_id 
        AND role IN ('owner', 'admin', 'editor')
        AND status = 'active'
    ) AND NOT EXISTS (
        SELECT 1 FROM public.workspaces
        WHERE id = p_workspace_id
        AND owner_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized: User cannot manage assignments in this workspace';
    END IF;

    -- Validate checklist belongs to workspace
    IF NOT EXISTS (
        SELECT 1 FROM public.checklists
        WHERE id = p_checklist_id AND workspace_id = p_workspace_id
    ) THEN
        RAISE EXCEPTION 'Checklist does not belong to this workspace';
    END IF;

    -- Validate members
    FOREACH v_m_id IN ARRAY p_member_ids
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE id = v_m_id AND workspace_id = p_workspace_id AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Invalid workspace member ID: %', v_m_id;
        END IF;
    END LOOP;

    -- Remove unassigned
    DELETE FROM public.checklist_assignments
    WHERE checklist_id = p_checklist_id
    AND workspace_id = p_workspace_id
    AND workspace_member_id != ALL(p_member_ids);

    -- Upsert retained/new
    INSERT INTO public.checklist_assignments (
        checklist_id,
        workspace_id,
        workspace_member_id,
        created_by,
        is_primary
    )
    SELECT 
        p_checklist_id,
        p_workspace_id,
        m_id,
        v_user_id,
        (m_id = p_primary_member_id)
    FROM unnest(p_member_ids) AS m_id
    ON CONFLICT (checklist_id, workspace_member_id) 
    DO UPDATE SET 
        is_primary = (EXCLUDED.workspace_member_id = p_primary_member_id),
        updated_at = now();
END;
$$;
