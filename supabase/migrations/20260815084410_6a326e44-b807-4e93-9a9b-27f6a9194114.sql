
-- 1. REVOKE DEFAULT PRIVILEGES FROM SENSITIVE RPCS
REVOKE ALL ON FUNCTION public.update_workspace_member_status(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resend_workspace_invitation(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_workspace_invitation_safe(uuid, uuid, text, app_role, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_workspace_invitation_service(text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_workspace_member_status(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resend_workspace_invitation(uuid, uuid, uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_workspace_invitation_safe(uuid, uuid, text, app_role, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation_service(text, uuid) TO service_role;

-- 2. HARDEN INTERNAL RPC LOGIC
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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_invitation_id uuid;
    v_actor_role text;
    v_is_owner boolean;
BEGIN
    SELECT (owner_id = p_invited_by) INTO v_is_owner FROM public.workspaces WHERE id = p_workspace_id;
    SELECT role::text INTO v_actor_role FROM public.workspace_members WHERE workspace_id = p_workspace_id AND user_id = p_invited_by AND status = 'active';

    IF NOT v_is_owner AND v_actor_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Forbidden: Actor lacks admin access';
    END IF;

    IF p_role = 'admin' AND NOT v_is_owner THEN
        RAISE EXCEPTION 'Forbidden: Only owner can invite admins';
    END IF;

    IF p_role = 'owner' THEN
        RAISE EXCEPTION 'Forbidden: Cannot invite owners';
    END IF;

    UPDATE public.workspace_invitations
    SET status = 'revoked', updated_at = now()
    WHERE workspace_id = p_workspace_id AND email_normalized = p_email_normalized AND status = 'pending';

    INSERT INTO public.workspace_invitations (
        workspace_id, invited_by, email_normalized, role, token_hash, status, expires_at
    )
    VALUES (
        p_workspace_id, p_invited_by, p_email_normalized, p_role, p_token_hash, 'pending', p_expires_at
    )
    RETURNING id INTO v_invitation_id;

    RETURN v_invitation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_workspace_member_status(
    p_workspace_id uuid,
    p_actor_id uuid,
    p_member_id uuid,
    p_status text,
    p_role text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_target_user_id uuid;
    v_is_target_owner boolean;
    v_is_actor_owner boolean;
    v_actor_role text;
    v_target_role text;
BEGIN
    SELECT (owner_id = p_actor_id) INTO v_is_actor_owner FROM public.workspaces WHERE id = p_workspace_id;
    SELECT role::text INTO v_actor_role FROM public.workspace_members WHERE workspace_id = p_workspace_id AND user_id = p_actor_id AND status = 'active';

    IF NOT v_is_actor_owner AND v_actor_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Forbidden: Unauthorized action';
    END IF;

    SELECT user_id, role::text INTO v_target_user_id, v_target_role FROM public.workspace_members WHERE id = p_member_id AND workspace_id = p_workspace_id;
    IF v_target_user_id IS NULL THEN
        RAISE EXCEPTION 'Member not found in workspace';
    END IF;

    SELECT (owner_id = v_target_user_id) INTO v_is_target_owner FROM public.workspaces WHERE id = p_workspace_id;

    IF v_is_target_owner THEN
        RAISE EXCEPTION 'Forbidden: Cannot modify the workspace owner';
    END IF;

    IF v_target_role = 'admin' AND NOT v_is_actor_owner THEN
         RAISE EXCEPTION 'Forbidden: Only owner can modify admins';
    END IF;

    IF p_role = 'owner' THEN
        RAISE EXCEPTION 'Forbidden: Role owner is deprecated';
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

CREATE OR REPLACE FUNCTION public.resend_workspace_invitation(
    p_workspace_id uuid,
    p_actor_id uuid,
    p_invitation_id uuid,
    p_new_token_hash text,
    p_expires_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old_email text;
    v_old_role public.app_role;
    v_is_owner boolean;
    v_actor_role text;
BEGIN
    SELECT (owner_id = p_actor_id) INTO v_is_owner FROM public.workspaces WHERE id = p_workspace_id;
    SELECT role::text INTO v_actor_role FROM public.workspace_members WHERE workspace_id = p_workspace_id AND user_id = p_actor_id AND status = 'active';

    IF NOT v_is_owner AND v_actor_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    SELECT email_normalized, role INTO v_old_email, v_old_role
    FROM public.workspace_invitations
    WHERE id = p_invitation_id AND workspace_id = p_workspace_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found';
    END IF;

    IF v_old_role = 'admin' AND NOT v_is_owner THEN
        RAISE EXCEPTION 'Forbidden: Only owner can manage admin invitations';
    END IF;

    UPDATE public.workspace_invitations SET status = 'revoked', updated_at = now() WHERE id = p_invitation_id;

    INSERT INTO public.workspace_invitations (
        workspace_id, invited_by, email_normalized, role, token_hash, status, expires_at
    )
    VALUES (p_workspace_id, p_actor_id, v_old_email, v_old_role, p_new_token_hash, 'pending', p_expires_at);

    RETURN v_old_email;
END;
$$;

-- 3. CONSOLIDATE user_has_workspace_access
-- Instead of DROPing, we REPLACE the function content. 
-- The signature (uuid, uuid, text) already exists.
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(
    p_workspace_id uuid,
    p_user_id uuid,
    p_min_role text DEFAULT 'viewer'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_member_role text;
    v_is_owner boolean;
    v_min_priority int;
    v_member_priority int;
BEGIN
    SELECT (owner_id = p_user_id) INTO v_is_owner FROM public.workspaces WHERE id = p_workspace_id;
    IF v_is_owner THEN RETURN true; END IF;

    SELECT role::text INTO v_member_role FROM public.workspace_members WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND status = 'active';
    IF v_member_role IS NULL THEN RETURN false; END IF;

    v_min_priority := CASE p_min_role WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 99 END;
    v_member_priority := CASE v_member_role WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END;

    RETURN v_member_priority >= v_min_priority;
END;
$$;

-- Now drop the overload that only takes 2 arguments
DROP FUNCTION IF EXISTS public.user_has_workspace_access(uuid, uuid);

-- 4. HARDEN RLS POLICIES FOR SHARED RESOURCES
-- Categories
DROP POLICY IF EXISTS "Workspace isolation for categories" ON public.workspace_categories;
DROP POLICY IF EXISTS "wcat_owner_all" ON public.workspace_categories;

CREATE POLICY "wcat_select" ON public.workspace_categories FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY "wcat_manage" ON public.workspace_categories FOR ALL TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor')) WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

-- Units
DROP POLICY IF EXISTS "Workspace isolation for units" ON public.units;
DROP POLICY IF EXISTS "units_owner_all" ON public.units;

CREATE POLICY "units_select" ON public.units FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY "units_manage" ON public.units FOR ALL TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor')) WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

-- Shifts
DROP POLICY IF EXISTS "Workspace isolation for shifts" ON public.shifts;
DROP POLICY IF EXISTS "shifts_owner_all" ON public.shifts;

CREATE POLICY "shifts_select" ON public.shifts FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY "shifts_manage" ON public.shifts FOR ALL TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor')) WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

-- Checklist Assignments
DROP POLICY IF EXISTS "Active members can view assignments" ON public.checklist_assignments;
DROP POLICY IF EXISTS "Members can view assignments" ON public.checklist_assignments;
DROP POLICY IF EXISTS "Editors can manage assignments" ON public.checklist_assignments;

CREATE POLICY "assig_select" ON public.checklist_assignments FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY "assig_manage" ON public.checklist_assignments FOR ALL TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor')) WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));
