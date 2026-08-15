-- 1. Normalização dos membros existentes e adição de colunas necessárias
ALTER TABLE public.workspace_members 
    ADD COLUMN IF NOT EXISTS email_normalized TEXT,
    ADD COLUMN IF NOT EXISTS ws_id_legado UUID;

-- Copiar ws_id atual para coluna legada se não existir
UPDATE public.workspace_members 
SET ws_id_legado = workspace_id 
WHERE ws_id_legado IS NULL;

-- Normalizar e-mails
UPDATE public.workspace_members
SET email_normalized = LOWER(TRIM(
    COALESCE(email_normalized, 
             (SELECT email FROM auth.users WHERE id = workspace_members.user_id), 
             'usuario-' || id || '@sememail.com')
))
WHERE email_normalized IS NULL;

-- Garante que membros são únicos por workspace e e-mail normalizado
-- Resolve duplicidades mantendo o registro com e-mail preenchido ou mais antigo
DELETE FROM public.workspace_members a
USING public.workspace_members b
WHERE a.id > b.id
AND a.workspace_id = b.workspace_id
AND a.email_normalized = b.email_normalized;

-- Adiciona restrições NOT NULL após limpeza
ALTER TABLE public.workspace_members ALTER COLUMN email_normalized SET NOT NULL;

-- Converte roles e status apenas após backfill e cleanup
-- (As colunas já existem como enums, não precisam de conversão se já estão setadas)

-- 2. Corrigir Assinatura de Autorização
-- Manter a nova assinatura canônica de 3 argumentos
CREATE OR REPLACE FUNCTION public.has_role_in_workspace(
    _user_id uuid, 
    _workspace_id uuid, 
    _min_role public.app_role DEFAULT 'viewer'::public.app_role
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
    SELECT owner_id INTO v_owner_id FROM public.workspaces WHERE id = _workspace_id;
    IF v_owner_id = _user_id THEN RETURN true; END IF;

    SELECT role, status INTO v_member_role, v_member_status
    FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id;

    IF v_member_status IS NULL OR v_member_status != 'active' THEN RETURN false; END IF;

    -- Prioridades
    v_role_priority := CASE v_member_role 
        WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END;
    v_min_priority := CASE _min_role 
        WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END;

    RETURN v_role_priority >= v_min_priority;
END;
$$;

-- 3. Índice Único para responsável principal
DROP INDEX IF EXISTS idx_checklist_assignments_primary;
CREATE UNIQUE INDEX IF NOT EXISTS uq_checklist_assignments_primary 
ON public.checklist_assignments(checklist_id) 
WHERE (is_primary = true);

-- 4. RPCs de Atribuição (corrigindo ID membro)
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
BEGIN
    IF NOT public.has_role_in_workspace(auth.uid(), p_workspace_id, 'editor') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Verifica se membro principal está no array
    IF p_primary_member_id IS NOT NULL AND NOT (p_primary_member_id = ANY(p_member_ids)) THEN
        RAISE EXCEPTION 'Responsável principal deve estar na lista de membros';
    END IF;

    DELETE FROM public.checklist_assignments WHERE checklist_id = p_checklist_id;

    INSERT INTO public.checklist_assignments (
        workspace_id, checklist_id, workspace_member_id, is_primary
    )
    SELECT p_workspace_id, p_checklist_id, m_id, (m_id = p_primary_member_id)
    FROM unnest(p_member_ids) AS m_id;

    RETURN true;
END;
$$;

-- 5. RPC de aceite de convite seguro (sem p_user_id vindo do cliente)
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(
    p_token_hash text
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
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, 'unauthorized'::text;
        RETURN;
    END IF;

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
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
    
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
        v_user_id,
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
        accepted_by = v_user_id,
        accepted_at = now(),
        updated_at = now()
    WHERE id = v_invitation.id;

    RETURN QUERY SELECT true, v_invitation.workspace_id, v_member_id, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(text) TO authenticated;
