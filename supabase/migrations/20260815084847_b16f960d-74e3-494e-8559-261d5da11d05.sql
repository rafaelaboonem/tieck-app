
-- 4. FINAL DROP AND RECREATE WITHOUT CASCADE
DO $$
BEGIN
    -- DROP SENSITIVE RPCS
    DROP FUNCTION IF EXISTS public.update_workspace_member_status(uuid, uuid, uuid, text, text);
    DROP FUNCTION IF EXISTS public.resend_workspace_invitation(uuid, uuid, uuid, text, timestamptz);
    DROP FUNCTION IF EXISTS public.create_workspace_invitation_safe(uuid, uuid, text, app_role, text, timestamptz);
    DROP FUNCTION IF EXISTS public.accept_workspace_invitation_service(text, uuid);
    
    -- RECREATE create_workspace_invitation_safe
    CREATE FUNCTION public.create_workspace_invitation_safe(
      p_workspace_id uuid,
      p_inviter_id uuid,
      p_email text,
      p_role app_role,
      p_token_hash text,
      p_expires_at timestamptz
    )
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_inviter_role text;
      v_invitation_id uuid;
    BEGIN
      IF p_role = 'owner' THEN RAISE EXCEPTION 'Cannot invite owner role' USING ERRCODE = 'P0001'; END IF;
      SELECT role::text INTO v_inviter_role FROM workspace_members WHERE workspace_id = p_workspace_id AND user_id = p_inviter_id AND status = 'active';
      IF v_inviter_role IS NULL THEN
        IF EXISTS (SELECT 1 FROM workspaces WHERE id = p_workspace_id AND owner_id = p_inviter_id) THEN v_inviter_role := 'owner';
        ELSE RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
      END IF;
      IF v_inviter_role = 'admin' AND p_role NOT IN ('editor', 'viewer') THEN RAISE EXCEPTION 'Admin can only invite editor or viewer' USING ERRCODE = 'P0001';
      ELSIF v_inviter_role IN ('editor', 'viewer') THEN RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501'; END IF;
      INSERT INTO workspace_invitations (workspace_id, inviter_id, email, role, token_hash, expires_at) VALUES (p_workspace_id, p_inviter_id, p_email, p_role, p_token_hash, p_expires_at) RETURNING id INTO v_invitation_id;
      RETURN v_invitation_id;
    END; $func$;

    -- RECREATE update_workspace_member_status
    CREATE FUNCTION public.update_workspace_member_status(
      p_workspace_id uuid,
      p_actor_id uuid,
      p_member_id uuid,
      p_new_status text,
      p_new_role text
    )
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_actor_role text;
      v_target_role text;
      v_target_user_id uuid;
      v_is_owner boolean;
    BEGIN
      SELECT role::text, user_id INTO v_target_role, v_target_user_id FROM workspace_members WHERE id = p_member_id AND workspace_id = p_workspace_id;
      IF v_target_role IS NULL THEN RAISE EXCEPTION 'Member not found in this workspace' USING ERRCODE = 'P0002'; END IF;
      SELECT (owner_id = v_target_user_id) INTO v_is_owner FROM workspaces WHERE id = p_workspace_id;
      IF v_is_owner THEN RAISE EXCEPTION 'Cannot modify workspace owner' USING ERRCODE = 'P0001'; END IF;
      SELECT role::text INTO v_actor_role FROM workspace_members WHERE workspace_id = p_workspace_id AND user_id = p_actor_id AND status = 'active';
      IF v_actor_role IS NULL THEN
        IF EXISTS (SELECT 1 FROM workspaces WHERE id = p_workspace_id AND owner_id = p_actor_id) THEN v_actor_role := 'owner';
        ELSE RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
      END IF;
      IF p_new_role = 'owner' THEN RAISE EXCEPTION 'Cannot set owner role via this RPC' USING ERRCODE = 'P0001'; END IF;
      IF v_actor_role = 'admin' AND v_target_role = 'admin' AND v_target_user_id != p_actor_id THEN RAISE EXCEPTION 'Admin cannot modify another admin' USING ERRCODE = 'P0001'; END IF;
      IF v_actor_role = 'admin' AND p_new_role = 'admin' AND v_target_role != 'admin' THEN RAISE EXCEPTION 'Admin cannot promote to admin' USING ERRCODE = 'P0001'; END IF;
      UPDATE workspace_members SET status = COALESCE(p_new_status::text, status), role = COALESCE(p_new_role::app_role, role), updated_at = now() WHERE id = p_member_id;
    END; $func$;

    -- RECREATE resend_workspace_invitation
    CREATE FUNCTION public.resend_workspace_invitation(
      p_workspace_id uuid,
      p_actor_id uuid,
      p_invitation_id uuid,
      p_new_token_hash text,
      p_new_expires_at timestamptz
    )
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_actor_role text;
      v_target_role text;
    BEGIN
      SELECT role::text INTO v_target_role FROM workspace_invitations WHERE id = p_invitation_id AND workspace_id = p_workspace_id;
      IF v_target_role IS NULL THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002'; END IF;
      SELECT role::text INTO v_actor_role FROM workspace_members WHERE workspace_id = p_workspace_id AND user_id = p_actor_id AND status = 'active';
      IF v_actor_role IS NULL THEN
        IF EXISTS (SELECT 1 FROM workspaces WHERE id = p_workspace_id AND owner_id = p_actor_id) THEN v_actor_role := 'owner';
        ELSE RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
      END IF;
      IF v_target_role = 'admin' AND v_actor_role != 'owner' THEN RAISE EXCEPTION 'Only owner can resend admin invitations' USING ERRCODE = '42501'; END IF;
      UPDATE workspace_invitations SET token_hash = p_new_token_hash, expires_at = p_new_expires_at, updated_at = now() WHERE id = p_invitation_id;
    END; $func$;

    -- RECREATE accept_workspace_invitation_service
    CREATE FUNCTION public.accept_workspace_invitation_service(
      p_token_hash text,
      p_user_id uuid
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_invitation record;
    BEGIN
      SELECT * INTO v_invitation FROM workspace_invitations WHERE token_hash = p_token_hash AND expires_at > now() FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'invalid_token' USING ERRCODE = 'P0002'; END IF;
      IF EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = v_invitation.workspace_id AND user_id = p_user_id) THEN
        UPDATE workspace_members SET status = 'active', role = v_invitation.role WHERE workspace_id = v_invitation.workspace_id AND user_id = p_user_id;
      ELSE
        INSERT INTO workspace_members (workspace_id, user_id, role, status) VALUES (v_invitation.workspace_id, p_user_id, v_invitation.role, 'active');
      END IF;
      DELETE FROM workspace_invitations WHERE id = v_invitation.id;
      RETURN jsonb_build_object('workspace_id', v_invitation.workspace_id);
    END; $func$;

    -- REVOKE AND GRANT
    REVOKE ALL ON FUNCTION public.update_workspace_member_status(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION public.resend_workspace_invitation(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION public.create_workspace_invitation_safe(uuid, uuid, text, app_role, text, timestamptz) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION public.accept_workspace_invitation_service(text, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.update_workspace_member_status(uuid, uuid, uuid, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.resend_workspace_invitation(uuid, uuid, uuid, text, timestamptz) TO service_role;
    GRANT EXECUTE ON FUNCTION public.create_workspace_invitation_safe(uuid, uuid, text, app_role, text, timestamptz) TO service_role;
    GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation_service(text, uuid) TO service_role;

END $$;
