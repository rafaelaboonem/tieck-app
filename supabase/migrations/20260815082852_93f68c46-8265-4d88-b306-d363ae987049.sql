-- Phase 4A Emergency Security Patch: Revoke PUBLIC grants and restore RLS policies

-- 1. Close immediately the vulnerable RPCs
-- REVOKE ALL on SECURITY DEFINER functions from PUBLIC roles
REVOKE ALL ON FUNCTION public.create_workspace_invitation_safe(uuid, uuid, text, public.app_role, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_workspace_member_status(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Grant only to service_role (End-points will use supabaseAdmin)
GRANT EXECUTE ON FUNCTION public.create_workspace_invitation_safe(uuid, uuid, text, public.app_role, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_workspace_member_status(uuid, uuid, text, text) TO service_role;

-- 2. Consolidate user_has_workspace_access
-- Ensure we have a single canonical function with 3 arguments (p_workspace_id, p_user_id, p_min_role)

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
    v_owner_id uuid;
    v_member_role public.app_role;
    v_member_status public.member_status;
    v_role_priority integer;
    v_min_priority integer;
BEGIN
    -- 1. Owner check (Priority 4)
    SELECT owner_id INTO v_owner_id FROM public.workspaces WHERE id = p_workspace_id;
    IF v_owner_id = p_user_id THEN 
      RETURN true; 
    END IF;

    -- 2. Member check
    SELECT role, status INTO v_member_role, v_member_status
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id;

    IF v_member_status IS NULL OR v_member_status != 'active' THEN 
      RETURN false; 
    END IF;

    -- Prioridades: owner(4), admin(3), editor(2), viewer(1)
    v_role_priority := CASE v_member_role 
        WHEN 'admin' THEN 3 
        WHEN 'editor' THEN 2 
        WHEN 'viewer' THEN 1 
        ELSE 0 
    END;
    
    v_min_priority := CASE LOWER(p_min_role)
        WHEN 'owner' THEN 4
        WHEN 'admin' THEN 3 
        WHEN 'editor' THEN 2 
        WHEN 'viewer' THEN 1 
        ELSE 0 
    END;

    RETURN v_role_priority >= v_min_priority;
END;
$$;

-- 3. Harden create_workspace_invitation_safe with internal auth and new signature
CREATE OR REPLACE FUNCTION public.create_workspace_invitation_safe(
    p_workspace_id uuid,
    p_invited_by uuid,
    p_email_normalized text,
    p_role public.app_role,
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
BEGIN
    -- Internally verify if p_invited_by has power to invite
    IF NOT public.user_has_workspace_access(p_workspace_id, p_invited_by, 'admin') THEN
        RAISE EXCEPTION 'Forbidden: Actor lacks admin access';
    END IF;

    -- If target role is admin, actor must be owner
    IF p_role = 'admin' AND NOT public.user_has_workspace_access(p_workspace_id, p_invited_by, 'owner') THEN
        RAISE EXCEPTION 'Forbidden: Only owner can invite admins';
    END IF;

    -- Invalidate previous pending invites
    UPDATE public.workspace_invitations
    SET status = 'revoked', updated_at = now()
    WHERE workspace_id = p_workspace_id
      AND email_normalized = p_email_normalized
      AND status = 'pending';

    -- Insert new
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

-- 4. Harden update_workspace_member_status with new signature and internal auth
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
    v_owner_id uuid;
BEGIN
    -- Get workspace owner
    SELECT owner_id INTO v_owner_id FROM public.workspaces WHERE id = p_workspace_id;

    -- Verify actor access (Admin min)
    IF NOT public.user_has_workspace_access(p_workspace_id, p_actor_id, 'admin') THEN
        RAISE EXCEPTION 'Forbidden: Actor lacks admin access';
    END IF;

    -- Get target member user_id
    SELECT user_id INTO v_target_user_id FROM public.workspace_members WHERE id = p_member_id;

    -- Protect Owner
    IF v_target_user_id = v_owner_id THEN
        RAISE EXCEPTION 'Forbidden: Cannot modify workspace owner';
    END IF;

    -- If promoting to admin or changing an admin, actor must be owner
    IF (p_role = 'admin' OR EXISTS (
        SELECT 1 FROM public.workspace_members WHERE id = p_member_id AND role = 'admin'
    )) AND v_owner_id != p_actor_id THEN
        RAISE EXCEPTION 'Forbidden: Only owner can manage admins';
    END IF;

    UPDATE public.workspace_members
    SET 
        status = p_status::public.member_status,
        role = COALESCE(p_role::public.app_role, role),
        updated_at = now()
    WHERE id = p_member_id AND workspace_id = p_workspace_id;

    RETURN FOUND;
END;
$$;

-- 5. Restore RLS Policies
-- Workspaces
DROP POLICY IF EXISTS "Members can view workspace" ON public.workspaces;
CREATE POLICY "Members can view workspace" ON public.workspaces
FOR SELECT TO authenticated
USING (public.user_has_workspace_access(id, auth.uid(), 'viewer'));

-- Workspace Members
DROP POLICY IF EXISTS "Members can view other members" ON public.workspace_members;
CREATE POLICY "Members can view other members" ON public.workspace_members
FOR SELECT TO authenticated
USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));

-- Workspace Invitations
DROP POLICY IF EXISTS "Admins can view invitations" ON public.workspace_invitations;
CREATE POLICY "Admins can view invitations" ON public.workspace_invitations
FOR SELECT TO authenticated
USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'admin'));

-- Checklists
DROP POLICY IF EXISTS "Members can view checklists" ON public.checklists;
CREATE POLICY "Members can view checklists" ON public.checklists
FOR SELECT TO authenticated
USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));

DROP POLICY IF EXISTS "Editors can edit checklists" ON public.checklists;
CREATE POLICY "Editors can edit checklists" ON public.checklists
FOR ALL TO authenticated
USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

-- Checklist Assignments
DROP POLICY IF EXISTS "Members can view assignments" ON public.checklist_assignments;
CREATE POLICY "Members can view assignments" ON public.checklist_assignments
FOR SELECT TO authenticated
USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));

DROP POLICY IF EXISTS "Editors can manage assignments" ON public.checklist_assignments;
CREATE POLICY "Editors can manage assignments" ON public.checklist_assignments
FOR ALL TO authenticated
USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

-- Unidades, Turnos, Categorias (Isolation)
DROP POLICY IF EXISTS "Workspace isolation for categories" ON public.workspace_categories;
CREATE POLICY "Workspace isolation for categories" ON public.workspace_categories
FOR ALL TO authenticated
USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));

DROP POLICY IF EXISTS "Workspace isolation for units" ON public.units;
CREATE POLICY "Workspace isolation for units" ON public.units
FOR ALL TO authenticated
USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));

DROP POLICY IF EXISTS "Workspace isolation for shifts" ON public.shifts;
CREATE POLICY "Workspace isolation for shifts" ON public.shifts
FOR ALL TO authenticated
USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));

-- 6. RPC for Resend Invitation
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
BEGIN
    -- Auth actor
    IF NOT public.user_has_workspace_access(p_workspace_id, p_actor_id, 'admin') THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    -- Get old details
    SELECT email_normalized, role INTO v_old_email, v_old_role
    FROM public.workspace_invitations
    WHERE id = p_invitation_id AND workspace_id = p_workspace_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found';
    END IF;

    -- Revoke old
    UPDATE public.workspace_invitations
    SET status = 'revoked', updated_at = now()
    WHERE id = p_invitation_id;

    -- Create new
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
        p_actor_id,
        v_old_email,
        v_old_role,
        p_new_token_hash,
        'pending',
        p_expires_at
    );

    RETURN v_old_email;
END;
$$;
GRANT EXECUTE ON FUNCTION public.resend_workspace_invitation TO service_role;
