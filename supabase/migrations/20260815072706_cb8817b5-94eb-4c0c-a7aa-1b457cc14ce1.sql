-- Migration de Reparo Fase 4A v2
-- 1. Adicionar 'owner' ao enum app_role se não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'owner') THEN
        ALTER TYPE public.app_role ADD VALUE 'owner' BEFORE 'admin';
    END IF;
END $$;

-- 2. Normalização
UPDATE public.workspace_members SET workspace_id = ws_id WHERE workspace_id IS NULL AND ws_id IS NOT NULL;
UPDATE public.workspace_members SET email_normalized = LOWER(TRIM(COALESCE((SELECT email FROM auth.users WHERE id = workspace_members.user_id), email_normalized))) WHERE email_normalized IS NULL OR email_normalized = '' OR email_normalized LIKE '%@sememail.com';

-- 3. Consolidar Duplicatas (Agora com 'owner' no enum)
WITH duplicates AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id, user_id ORDER BY (CASE WHEN status = 'active' THEN 0 ELSE 1 END), (CASE WHEN role::text = 'owner' THEN 0 WHEN role::text = 'admin' THEN 1 WHEN role::text = 'editor' THEN 2 ELSE 3 END), created_at ASC) as rn FROM public.workspace_members WHERE user_id IS NOT NULL) DELETE FROM public.workspace_members WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);
WITH duplicates_email AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id, email_normalized ORDER BY (CASE WHEN user_id IS NOT NULL THEN 0 ELSE 1 END), (CASE WHEN status = 'active' THEN 0 ELSE 1 END), created_at ASC) as rn FROM public.workspace_members WHERE email_normalized IS NOT NULL) DELETE FROM public.workspace_members WHERE id IN (SELECT id FROM duplicates_email WHERE rn > 1);

-- 4. Índices Únicos
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_members_user_workspace ON public.workspace_members(workspace_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_members_email_workspace ON public.workspace_members(workspace_id, email_normalized) WHERE email_normalized IS NOT NULL;

-- 5. Funções de Segurança Hardened
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(p_workspace_id uuid, p_user_id uuid, p_min_role public.app_role DEFAULT 'viewer') RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$ DECLARE v_role_priority integer; v_min_priority integer; v_user_role public.app_role; v_status public.member_status; v_owner_id uuid; BEGIN SELECT owner_id INTO v_owner_id FROM public.workspaces WHERE id = p_workspace_id; IF v_owner_id = p_user_id THEN RETURN true; END IF; SELECT role, status INTO v_user_role, v_status FROM public.workspace_members WHERE workspace_id = p_workspace_id AND user_id = p_user_id; IF v_status IS NULL OR v_status != 'active' THEN RETURN false; END IF; v_role_priority := CASE v_user_role::text WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END; v_min_priority := CASE p_min_role::text WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END; RETURN v_role_priority >= v_min_priority; END; $$;

CREATE OR REPLACE FUNCTION public.accept_workspace_invitation_service(p_token_hash text, p_user_id uuid) RETURNS TABLE (success boolean, workspace_id uuid, member_id uuid, error_code text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$ DECLARE v_invitation record; v_email text; v_member_id uuid; BEGIN SELECT * INTO v_invitation FROM public.workspace_invitations WHERE token_hash = p_token_hash AND status = 'pending' AND expires_at > now() FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, 'invitation_invalid'::text; RETURN; END IF; SELECT email INTO v_email FROM auth.users WHERE id = p_user_id; IF LOWER(TRIM(v_email)) != v_invitation.email_normalized THEN RETURN QUERY SELECT false, v_invitation.workspace_id, NULL::uuid, 'email_mismatch'::text; RETURN; END IF; INSERT INTO public.workspace_members (workspace_id, user_id, email_normalized, role, status) VALUES (v_invitation.workspace_id, p_user_id, v_invitation.email_normalized, v_invitation.role, 'active') ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = now() RETURNING id INTO v_member_id; UPDATE public.workspace_invitations SET status = 'accepted', accepted_by = p_user_id, accepted_at = now(), updated_at = now() WHERE id = v_invitation.id; RETURN QUERY SELECT true, v_invitation.workspace_id, v_member_id, NULL::text; END; $$;

REVOKE ALL ON FUNCTION public.accept_workspace_invitation_service(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation_service(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.update_checklist_assignments(p_workspace_id uuid, p_checklist_id uuid, p_member_ids uuid[], p_primary_member_id uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ DECLARE v_member_count integer; BEGIN IF NOT public.user_has_workspace_access(p_workspace_id, auth.uid(), 'editor') THEN RAISE EXCEPTION 'Unauthorized'; END IF; IF NOT EXISTS (SELECT 1 FROM public.checklists WHERE id = p_checklist_id AND workspace_id = p_workspace_id) THEN RAISE EXCEPTION 'Checklist not found in this workspace'; END IF; IF p_member_ids IS NOT NULL AND array_length(p_member_ids, 1) > 0 THEN SELECT count(*) INTO v_member_count FROM public.workspace_members WHERE id = ANY(p_member_ids) AND workspace_id = p_workspace_id AND status = 'active'; IF v_member_count != array_length(p_member_ids, 1) THEN RAISE EXCEPTION 'One or more members are invalid'; END IF; IF (SELECT count(DISTINCT x) FROM unnest(p_member_ids) x) != array_length(p_member_ids, 1) THEN RAISE EXCEPTION 'Duplicate members'; END IF; IF p_primary_member_id IS NOT NULL AND NOT (p_primary_member_id = ANY(p_member_ids)) THEN RAISE EXCEPTION 'Primary responsible must be in list'; END IF; ELSE IF p_primary_member_id IS NOT NULL THEN RAISE EXCEPTION 'Cannot set primary for empty list'; END IF; p_member_ids := ARRAY[]::uuid[]; END IF; DELETE FROM public.checklist_assignments WHERE checklist_id = p_checklist_id AND workspace_id = p_workspace_id; IF array_length(p_member_ids, 1) > 0 THEN INSERT INTO public.checklist_assignments (workspace_id, checklist_id, workspace_member_id, is_primary, created_by) SELECT p_workspace_id, p_checklist_id, m_id, (m_id = p_primary_member_id), auth.uid() FROM unnest(p_member_ids) AS m_id; END IF; RETURN true; END; $$;

-- 6. RLS
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active members can view team" ON public.workspace_members;
CREATE POLICY "Active members can view team" ON public.workspace_members FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));
ALTER TABLE public.checklist_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active members can view assignments" ON public.checklist_assignments;
CREATE POLICY "Active members can view assignments" ON public.checklist_assignments FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id, auth.uid(), 'viewer'));

GRANT SELECT ON public.workspace_members TO authenticated;
GRANT SELECT ON public.checklist_assignments TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
GRANT ALL ON public.checklist_assignments TO service_role;
