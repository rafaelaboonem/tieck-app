
-- Final Security Hardening Phase 4A (Full Reset of Functions)
BEGIN;

-- 1. DROP EVERYTHING to avoid parameter/default/type mismatches
DROP FUNCTION IF EXISTS public.create_workspace_invitation_safe(uuid, uuid, text, app_role, text, timestamp with time zone) CASCADE;
DROP FUNCTION IF EXISTS public.resend_workspace_invitation(uuid, uuid, uuid, text, timestamp with time zone) CASCADE;
DROP FUNCTION IF EXISTS public.update_workspace_member_status(uuid, uuid, uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.accept_workspace_invitation_service(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.user_has_workspace_access(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.user_has_workspace_access(uuid, uuid, app_role) CASCADE;

-- 2. Consolidate user_has_workspace_access (text version)
CREATE FUNCTION public.user_has_workspace_access(
  p_workspace_id uuid,
  p_user_id uuid,
  p_min_role text DEFAULT 'viewer'
) RETURNS boolean AS $$
DECLARE
  v_role_priority int;
  v_member_role_priority int;
  v_user_role text;
BEGIN
  v_role_priority := CASE p_min_role
    WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END;
  
  IF EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id AND owner_id = p_user_id) THEN
    RETURN v_role_priority <= 4;
  END IF;

  SELECT role::text INTO v_user_role FROM public.workspace_members 
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND status = 'active';
  
  v_member_role_priority := CASE v_user_role
    WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END;
    
  RETURN v_member_role_priority >= v_role_priority;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. Redefine RPCs
CREATE FUNCTION public.create_workspace_invitation_safe(
  p_workspace_id uuid,
  p_invited_by uuid,
  p_email_normalized text,
  p_role app_role,
  p_token_hash text,
  p_expires_at timestamptz
) RETURNS uuid AS $$
DECLARE
  v_inviter_role text;
  v_invitation_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM workspaces WHERE id = p_workspace_id AND owner_id = p_invited_by) THEN
    v_inviter_role := 'owner';
  ELSE
    SELECT role::text INTO v_inviter_role FROM workspace_members 
    WHERE workspace_id = p_workspace_id AND user_id = p_invited_by AND status = 'active';
  END IF;

  IF v_inviter_role IS NULL OR v_inviter_role IN ('editor', 'viewer') THEN
    RAISE EXCEPTION 'Forbidden: Insufficient permissions to invite';
  END IF;

  IF v_inviter_role = 'admin' AND p_role = 'admin' THEN
    RAISE EXCEPTION 'Forbidden: Admin cannot invite other Admins';
  END IF;

  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'Forbidden: Cannot invite as Owner';
  END IF;

  IF EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = p_workspace_id AND email_normalized = lower(trim(p_email_normalized)) AND status = 'active') THEN
    RAISE EXCEPTION 'Conflict: Member already active in workspace';
  END IF;

  UPDATE workspace_invitations 
  SET status = 'revoked', updated_at = now() 
  WHERE workspace_id = p_workspace_id AND email_normalized = lower(trim(p_email_normalized)) AND status = 'pending';

  INSERT INTO workspace_invitations (
    workspace_id, invited_by, email_normalized, role, token_hash, expires_at, status
  ) VALUES (
    p_workspace_id, p_invited_by, lower(trim(p_email_normalized)), p_role, p_token_hash, p_expires_at, 'pending'
  ) RETURNING id INTO v_invitation_id;

  RETURN v_invitation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE FUNCTION public.update_workspace_member_status(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_member_id uuid,
  p_status text,
  p_role text DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_actor_role text;
  v_target_role text;
  v_target_user_id uuid;
  v_is_owner boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM workspaces WHERE id = p_workspace_id AND owner_id = p_actor_id) THEN
    v_actor_role := 'owner';
  ELSE
    SELECT role::text INTO v_actor_role FROM workspace_members 
    WHERE workspace_id = p_workspace_id AND user_id = p_actor_id AND status = 'active';
  END IF;

  SELECT role::text, user_id INTO v_target_role, v_target_user_id FROM workspace_members 
  WHERE workspace_id = p_workspace_id AND id = p_member_id;

  IF v_target_role IS NULL THEN RETURN false; END IF;
  v_is_owner := EXISTS (SELECT 1 FROM workspaces WHERE id = p_workspace_id AND owner_id = v_target_user_id);
  
  IF v_is_owner THEN RAISE EXCEPTION 'Forbidden: Cannot modify workspace owner'; END IF;

  IF v_actor_role = 'admin' THEN
    IF v_target_role = 'admin' THEN RAISE EXCEPTION 'Forbidden: Admin cannot modify another Admin'; END IF;
    IF p_role = 'admin' THEN RAISE EXCEPTION 'Forbidden: Admin cannot promote to Admin'; END IF;
  ELSIF v_actor_role != 'owner' THEN
    RAISE EXCEPTION 'Forbidden: Insufficient permissions';
  END IF;

  IF p_role = 'owner' THEN RAISE EXCEPTION 'Forbidden: Cannot assign owner role'; END IF;

  UPDATE workspace_members
  SET 
    status = COALESCE(p_status::member_status, status),
    role = COALESCE(p_role::app_role, role),
    updated_at = now()
  WHERE id = p_member_id AND workspace_id = p_workspace_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE FUNCTION public.accept_workspace_invitation_service(
  p_token_hash text,
  p_user_id uuid
) RETURNS json AS $$
DECLARE
  v_invitation record;
  v_user_email text;
  v_member_id uuid;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  
  SELECT * INTO v_invitation FROM workspace_invitations 
  WHERE token_hash = p_token_hash AND status = 'pending' AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_token'; END IF;

  IF lower(trim(v_invitation.email_normalized)) != lower(trim(v_user_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  UPDATE workspace_invitations 
  SET status = 'accepted', accepted_at = now(), accepted_by = p_user_id 
  WHERE id = v_invitation.id;

  INSERT INTO workspace_members (workspace_id, user_id, email_normalized, role, status)
  VALUES (v_invitation.workspace_id, p_user_id, v_invitation.email_normalized, v_invitation.role, 'active')
  ON CONFLICT (workspace_id, user_id) DO UPDATE 
  SET role = EXCLUDED.role, status = 'active', updated_at = now()
  RETURNING id INTO v_member_id;

  RETURN json_build_object('ok', true, 'workspace_id', v_invitation.workspace_id, 'member_id', v_member_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE FUNCTION public.resend_workspace_invitation(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_invitation_id uuid,
  p_new_token_hash text,
  p_expires_at timestamptz
) RETURNS text AS $$
DECLARE
  v_actor_role text;
  v_invitation record;
BEGIN
  IF EXISTS (SELECT 1 FROM workspaces WHERE id = p_workspace_id AND owner_id = p_actor_id) THEN
    v_actor_role := 'owner';
  ELSE
    SELECT role::text INTO v_actor_role FROM workspace_members 
    WHERE workspace_id = p_workspace_id AND user_id = p_actor_id AND status = 'active';
  END IF;

  SELECT * INTO v_invitation FROM workspace_invitations 
  WHERE id = p_invitation_id AND workspace_id = p_workspace_id AND status = 'pending';

  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found or not pending'; END IF;

  IF v_invitation.role = 'admin' AND v_actor_role != 'owner' THEN
    RAISE EXCEPTION 'Forbidden: Only Owner can resend Admin invitations';
  END IF;

  IF v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Forbidden: Insufficient permissions';
  END IF;

  UPDATE workspace_invitations 
  SET token_hash = p_new_token_hash, expires_at = p_expires_at, updated_at = now()
  WHERE id = p_invitation_id;

  RETURN v_invitation.email_normalized;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Re-add app_role overload for compatibility
CREATE FUNCTION public.user_has_workspace_access(p_workspace_id uuid, p_user_id uuid, p_min_role app_role)
RETURNS boolean AS 'SELECT public.user_has_workspace_access($1, $2, $3::text)' LANGUAGE sql STABLE SECURITY DEFINER;

-- 5. Revoke and Grant
REVOKE ALL ON FUNCTION public.create_workspace_invitation_safe(uuid, uuid, text, app_role, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_workspace_member_status(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resend_workspace_invitation(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_workspace_invitation_service(text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_workspace_invitation_safe(uuid, uuid, text, app_role, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_workspace_member_status(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resend_workspace_invitation(uuid, uuid, uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation_service(text, uuid) TO service_role;

-- 6. Restore RLS
CREATE POLICY "shifts_select" ON public.shifts FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY "shifts_manage" ON public.shifts FOR ALL TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor')) WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

CREATE POLICY "units_select" ON public.units FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY "units_manage" ON public.units FOR ALL TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor')) WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

CREATE POLICY "wcat_select" ON public.workspace_categories FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY "wcat_manage" ON public.workspace_categories FOR ALL TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor')) WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

COMMIT;
