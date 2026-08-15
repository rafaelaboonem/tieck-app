-- RPC to accept invitation atomicly
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(
    p_token_hash text,
    p_user_id uuid
)
RETURNS TABLE (
    success boolean,
    workspace_id uuid,
    member_id uuid,
    error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_invitation record;
    v_email text;
    v_member_id uuid;
BEGIN
    -- 1. Find and lock invitation
    SELECT * INTO v_invitation
    FROM public.workspace_invitations
    WHERE token_hash = p_token_hash
      AND status = 'pending'
      AND expires_at > now()
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, 'invitation_invalid'::text;
        RETURN;
    END IF;

    -- 2. Verify user email matches invitation
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    
    IF LOWER(TRIM(v_email)) != v_invitation.email_normalized THEN
        RETURN QUERY SELECT false, v_invitation.workspace_id, NULL::uuid, 'email_mismatch'::text;
        RETURN;
    END IF;

    -- 3. Upsert workspace member
    INSERT INTO public.workspace_members (
        workspace_id,
        user_id,
        email_normalized,
        role,
        status
    ) VALUES (
        v_invitation.workspace_id,
        p_user_id,
        v_invitation.email_normalized,
        v_invitation.role,
        'active'
    )
    ON CONFLICT (workspace_id, user_id) 
    DO UPDATE SET 
        role = EXCLUDED.role,
        status = 'active',
        updated_at = now()
    RETURNING id INTO v_member_id;

    -- 4. Mark invitation as accepted
    UPDATE public.workspace_invitations
    SET 
        status = 'accepted',
        accepted_by = p_user_id,
        accepted_at = now(),
        updated_at = now()
    WHERE id = v_invitation.id;

    RETURN QUERY SELECT true, v_invitation.workspace_id, v_member_id, NULL::text;
END;
$$;

-- RPC to update checklist assignments atomicly
CREATE OR REPLACE FUNCTION public.update_checklist_assignments(
    p_workspace_id uuid,
    p_checklist_id uuid,
    p_member_ids uuid[],
    p_primary_member_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_authorized boolean;
    v_member_id uuid;
BEGIN
    -- 1. Check authorization (editor or above)
    SELECT public.has_role_in_workspace(auth.uid(), p_workspace_id, 'editor') INTO v_is_authorized;
    
    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- 2. Validate checklist belongs to workspace
    IF NOT EXISTS (SELECT 1 FROM public.checklists WHERE id = p_checklist_id AND workspace_id = p_workspace_id) THEN
        RAISE EXCEPTION 'Checklist not found in workspace';
    END IF;

    -- 3. Validate all members belong to workspace and are active
    FOREACH v_member_id IN ARRAY p_member_ids
    LOOP
        IF NOT EXISTS (SELECT 1 FROM public.workspace_members WHERE id = v_member_id AND workspace_id = p_workspace_id AND status = 'active') THEN
            RAISE EXCEPTION 'Invalid or inactive member in assignment list';
        END IF;
    END LOOP;

    -- 4. Clear existing assignments for this checklist
    DELETE FROM public.checklist_assignments WHERE checklist_id = p_checklist_id;

    -- 5. Insert new assignments
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
        m_id,
        (m_id = p_primary_member_id),
        auth.uid()
    FROM unnest(p_member_ids) AS m_id;

    RETURN true;
END;
$$;

-- Grant execution
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_checklist_assignments(uuid, uuid, uuid[], uuid) TO authenticated;
