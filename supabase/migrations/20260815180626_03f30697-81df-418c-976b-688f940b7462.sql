-- REPARO DETERMINÍSTICO FINAL DA FASE 4A (Retentativa Determinística)
-- SHA REAL DE PARTIDA: aabe5504aaa1498c33dbe3efb689e939f7eab90a
-- Data: 2026-08-15
-- Sem CASCADE. Transação total.

BEGIN;

-- 0. LIMPEZA PREVENTIVA DE OBJETOS DEPENDENTES
DROP POLICY IF EXISTS shifts_select ON public.shifts;
DROP POLICY IF EXISTS shifts_manage ON public.shifts;
DROP POLICY IF EXISTS units_select ON public.units;
DROP POLICY IF EXISTS units_manage ON public.units;
DROP POLICY IF EXISTS wcat_select ON public.workspace_categories;
DROP POLICY IF EXISTS wcat_manage ON public.workspace_categories;
DROP POLICY IF EXISTS shifts_viewer_select ON public.shifts;
DROP POLICY IF EXISTS shifts_editor_manage ON public.shifts;
DROP POLICY IF EXISTS units_viewer_select ON public.units;
DROP POLICY IF EXISTS units_editor_manage ON public.units;
DROP POLICY IF EXISTS categories_viewer_select ON public.workspace_categories;
DROP POLICY IF EXISTS categories_editor_manage ON public.workspace_categories;
DROP POLICY IF EXISTS ws_owner_all ON public.workspaces;
DROP POLICY IF EXISTS ws_member_select ON public.workspaces;
DROP POLICY IF EXISTS members_select_active ON public.workspace_members;
DROP POLICY IF EXISTS invitations_admin_select ON public.workspace_invitations;
DROP POLICY IF EXISTS "Members can view invitations" ON public.workspace_invitations;
DROP POLICY IF EXISTS checklists_owner_all ON public.checklists;
DROP POLICY IF EXISTS checklists_member_select ON public.checklists;
DROP POLICY IF EXISTS checklists_editor_manage ON public.checklists;
DROP POLICY IF EXISTS assignments_member_select ON public.checklist_assignments;

DROP FUNCTION IF EXISTS public.accept_workspace_invitation_service(text, uuid);
DROP FUNCTION IF EXISTS public.update_checklist_assignments(uuid, uuid, uuid[], uuid);
DROP FUNCTION IF EXISTS public.user_has_workspace_access(p_workspace_id uuid, p_user_id uuid, p_min_role text);
DROP FUNCTION IF EXISTS public.user_has_workspace_access(p_workspace_id uuid, p_user_id uuid, p_min_role public.app_role);
DROP FUNCTION IF EXISTS public.update_workspace_member_status(uuid, uuid, text, text);

-- 1. CONSOLIDAÇÃO DA FUNÇÃO DE ACESSO
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(
  p_workspace_id uuid,
  p_user_id uuid,
  p_min_role text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_name text;
  v_is_active boolean;
  v_is_owner boolean;
  v_member_priority int;
  v_min_priority int;
BEGIN
  v_min_priority := CASE p_min_role
    WHEN 'owner' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'editor' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 99
  END;
  IF v_min_priority = 99 THEN RETURN false; END IF;

  SELECT (owner_id = p_user_id) INTO v_is_owner
  FROM public.workspaces
  WHERE id = p_workspace_id;
  IF v_is_owner THEN RETURN true; END IF;

  SELECT role::text, (status = 'active') INTO v_role_name, v_is_active
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id;
  IF v_role_name IS NULL OR NOT v_is_active THEN
    RETURN false;
  END IF;

  v_member_priority := CASE v_role_name
    WHEN 'admin' THEN 3
    WHEN 'editor' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 0
  END;
  RETURN v_member_priority >= v_min_priority;
END;
$$;

REVOKE ALL ON FUNCTION public.user_has_workspace_access(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_workspace_access(uuid, uuid, text) TO authenticated, service_role;

-- 2. PROTEÇÃO DE RPCs ADMINISTRATIVAS
ALTER FUNCTION public.create_workspace_invitation_safe(uuid,uuid,text,app_role,text,timestamptz) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.create_workspace_invitation_safe(uuid,uuid,text,app_role,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace_invitation_safe(uuid,uuid,text,app_role,text,timestamptz) TO service_role;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'update_workspace_member_status') THEN
        ALTER FUNCTION public.update_workspace_member_status(uuid,uuid,uuid,text,text) SET search_path = public, pg_temp;
        REVOKE ALL ON FUNCTION public.update_workspace_member_status(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.update_workspace_member_status(uuid,uuid,uuid,text,text) TO service_role;
    END IF;
END $$;

ALTER FUNCTION public.resend_workspace_invitation(uuid,uuid,uuid,text,timestamptz) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.resend_workspace_invitation(uuid,uuid,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resend_workspace_invitation(uuid,uuid,uuid,text,timestamptz) TO service_role;

ALTER FUNCTION public.has_role_in_workspace(uuid,uuid,app_role) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.has_role_in_workspace(uuid,uuid,app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role_in_workspace(uuid,uuid,app_role) TO authenticated, service_role;

-- 3. RPC ACEITE DE CONVITE (NOVA ASSINATURA)
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation_service(
  p_token_hash text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_invitation record;
  v_user_email text;
  v_member_id uuid;
BEGIN
  SELECT * INTO v_invitation
  FROM public.workspace_invitations
  WHERE token_hash = p_token_hash AND status = 'pending' AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_token'; END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  IF v_user_email IS NULL OR v_invitation.email_normalized IS NULL OR LOWER(TRIM(v_user_email)) IS DISTINCT FROM v_invitation.email_normalized THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, email_normalized, role, status)
  VALUES (v_invitation.workspace_id, p_user_id, v_invitation.email_normalized, v_invitation.role, 'active')
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = now()
  RETURNING id INTO v_member_id;

  UPDATE public.workspace_invitations SET status = 'accepted', accepted_by = p_user_id, accepted_at = now(), updated_at = now() WHERE id = v_invitation.id;
  RETURN jsonb_build_object('ok', true, 'workspace_id', v_invitation.workspace_id, 'member_id', v_member_id);
END;
$$;
REVOKE ALL ON FUNCTION public.accept_workspace_invitation_service(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation_service(text, uuid) TO service_role;

-- 4. RPC ATRIBUIÇÕES
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
DECLARE v_actor_id uuid;
BEGIN
  v_actor_id := auth.uid();
  IF NOT public.user_has_workspace_access(p_workspace_id, v_actor_id, 'editor') THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_primary_member_id IS NOT NULL AND NOT (p_primary_member_id = ANY(p_member_ids)) THEN RAISE EXCEPTION 'primary_member_must_be_in_list'; END IF;
  DELETE FROM public.checklist_assignments WHERE checklist_id = p_checklist_id;
  IF array_length(p_member_ids, 1) > 0 THEN
    INSERT INTO public.checklist_assignments (workspace_id, checklist_id, workspace_member_id, is_primary)
    SELECT p_workspace_id, p_checklist_id, m_id, (m_id = p_primary_member_id) FROM unnest(p_member_ids) AS m_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.update_checklist_assignments(uuid, uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_checklist_assignments(uuid, uuid, uuid[], uuid) TO authenticated, service_role;

-- 5. RESTAURAÇÃO DAS POLÍTICAS RLS
CREATE POLICY ws_owner_all ON public.workspaces FOR ALL TO authenticated USING (owner_id = auth.uid());
CREATE POLICY ws_member_select ON public.workspaces FOR SELECT TO authenticated USING (public.user_has_workspace_access(id, auth.uid(), 'viewer'));
CREATE POLICY members_select_active ON public.workspace_members FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY invitations_admin_select ON public.workspace_invitations FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'admin'));
CREATE POLICY checklists_owner_all ON public.checklists FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.workspaces WHERE id = workspace_id AND owner_id = auth.uid()));
CREATE POLICY checklists_member_select ON public.checklists FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY checklists_editor_manage ON public.checklists FOR ALL TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor')) WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));
CREATE POLICY assignments_member_select ON public.checklist_assignments FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY categories_viewer_select ON public.workspace_categories FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY categories_editor_manage ON public.workspace_categories FOR ALL TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor')) WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));
CREATE POLICY units_viewer_select ON public.units FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY units_editor_manage ON public.units FOR ALL TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor')) WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));
CREATE POLICY shifts_viewer_select ON public.shifts FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
CREATE POLICY shifts_editor_manage ON public.shifts FOR ALL TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor')) WITH CHECK (public.user_has_workspace_access(workspace_id, auth.uid(), 'editor'));

COMMIT;
