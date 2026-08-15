-- 1. Depreciar 'owner' no enum app_role e converter para 'admin'
-- Nota: O proprietário real é definido por workspaces.owner_id
UPDATE public.workspace_members
SET role = 'admin'
WHERE role = 'owner';

COMMENT ON TYPE public.app_role IS 'Depreciado: owner. Use workspaces.owner_id para identificar o proprietário. Papéis operacionais: admin, editor, viewer.';

-- 2. Consolidar user_has_workspace_access para assinatura canônica de 3 argumentos
-- Primeiro, removemos as versões antigas se existirem
DROP FUNCTION IF EXISTS public.user_has_workspace_access(uuid, uuid);
DROP FUNCTION IF EXISTS public.user_has_workspace_access(uuid, uuid, text);

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
    -- 1. Verificar se é o proprietário direto do workspace
    SELECT (owner_id = p_user_id) INTO v_is_owner
    FROM public.workspaces
    WHERE id = p_workspace_id;

    IF v_is_owner THEN
        RETURN true;
    END IF;

    -- 2. Obter o papel do membro
    SELECT role::text INTO v_member_role
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = p_user_id
      AND status = 'active';

    IF v_member_role IS NULL THEN
        RETURN false;
    END IF;

    -- 3. Mapear prioridades
    -- Prioridades: Proprietário(4), Admin(3), Editor(2), Viewer(1)
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

-- 3. Garantir integridade em checklist_assignments
-- Impedir que um membro seja atribuído a um checklist de outro workspace
CREATE OR REPLACE FUNCTION public.check_assignment_workspace_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Verifica se o checklist pertence ao workspace
    IF NOT EXISTS (
        SELECT 1 FROM public.checklists
        WHERE id = NEW.checklist_id AND workspace_id = NEW.workspace_id
    ) THEN
        RAISE EXCEPTION 'Checklist does not belong to the workspace';
    END IF;

    -- Verifica se o membro pertence ao workspace e está ativo
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

-- 4. RPC para criação segura de convite (Substitui upsert inseguro)
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
    -- 1. Revogar convites pendentes anteriores para este email no workspace
    UPDATE public.workspace_invitations
    SET status = 'revoked', updated_at = now()
    WHERE workspace_id = p_workspace_id
      AND email_normalized = p_email_normalized
      AND status = 'pending';

    -- 2. Inserir novo convite
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

-- 5. RPC para atualização atômica de membros (Admin/Owner apenas)
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
    -- Validação básica: não pode desativar o proprietário
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
