UPDATE public.workspace_members
SET role = 'admin'
WHERE role = 'owner';

COMMENT ON TYPE public.app_role IS 'Depreciado: owner. Use workspaces.owner_id para identificar o proprietário. Papéis operacionais: admin, editor, viewer.';

DROP FUNCTION IF EXISTS public.user_has_workspace_access(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.user_has_workspace_access(uuid, uuid, text) CASCADE;

CREATE OR REPLACE FUNCTION public.user_has_workspace_access(
    p_workspace_id uuid,
    p_user_id uuid,
    p_min_role text DEFAULT 'viewer'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member_role text;
    v_is_owner boolean;
    v_min_priority int;
    v_member_priority int;
BEGIN
    SELECT (owner_id = p_user_id) INTO v_is_owner
    FROM public.workspaces
    WHERE id = p_workspace_id;

    IF v_is_owner THEN
        RETURN true;
    END IF;

    SELECT role::text INTO v_member_role
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = p_user_id
      AND status = 'active';

    IF v_member_role IS NULL THEN
        RETURN false;
    END IF;

    v_min_priority := CASE p_min_role
        WHEN 'owner' THEN 4
        WHEN 'admin' THEN 3
        WHEN 'editor' THEN 2
        ELSE 1
    END;

    v_member_priority := CASE v_member_role
        WHEN 'admin' THEN 3
        WHEN 'editor' THEN 2
        ELSE 1
    END;

    RETURN v_member_priority >= v_min_priority;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_assignment_workspace_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.checklists
        WHERE id = NEW.checklist_id AND workspace_id = NEW.workspace_id
    ) THEN
        RAISE EXCEPTION 'Checklist does not belong to the workspace';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE id = NEW.workspace_member_id AND workspace_id = NEW.workspace_id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Member does not belong to the workspace or is inactive';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_assignment_integrity ON public.checklist_assignments;
CREATE TRIGGER trg_check_assignment_integrity
BEFORE INSERT OR UPDATE ON public.checklist_assignments
FOR EACH ROW EXECUTE FUNCTION public.check_assignment_workspace_integrity();

CREATE OR REPLACE FUNCTION public.create_workspace_invitation_safe(
    p_workspace_id uuid,
    p_invited_by uuid,
    p_email_normalized text,
    p_role app_role,
    p_token_hash text,
    p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invitation_id uuid;
BEGIN
    UPDATE public.workspace_invitations
    SET status = 'revoked', updated_at = now()
    WHERE workspace_id = p_workspace_id
      AND email_normalized = p_email_normalized
      AND status = 'pending';

    INSERT INTO public.workspace_invitations (
        workspace_id,
        invited_by,
        email_normalized,
        role,
        token_hash,
        status,
        expires_at
    )
    VALUES (
        p_workspace_id,
        p_invited_by,
        p_email_normalized,
        p_role,
        p_token_hash,
        'pending',
        p_expires_at
    )
    RETURNING id INTO v_invitation_id;

    RETURN v_invitation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_workspace_invitation_safe TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace_invitation_safe TO service_role;

CREATE OR REPLACE FUNCTION public.update_workspace_member_status(
    p_workspace_id uuid,
    p_member_id uuid,
    p_status text,
    p_role text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.workspaces w
        JOIN public.workspace_members m ON m.user_id = w.owner_id
        WHERE w.id = p_workspace_id AND m.id = p_member_id
    ) THEN
        RAISE EXCEPTION 'Cannot modify the workspace owner directly';
    END IF;

    UPDATE public.workspace_members
    SET 
        status = p_status,
        role = COALESCE(p_role::app_role, role),
        updated_at = now()
    WHERE id = p_member_id AND workspace_id = p_workspace_id;

    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_workspace_member_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_workspace_member_status TO service_role;
