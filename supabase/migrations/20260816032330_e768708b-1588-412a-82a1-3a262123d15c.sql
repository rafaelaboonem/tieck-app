
-- Corrigir exclusivamente o bypass de autorização encontrado na consolidação da Fase 4A.
-- Parta do SHA real: a36719492193adca48491d7f1b8cdc9373765c19

BEGIN;

-- 1. Atualizar a função has_role_in_workspace para corrigir o cálculo de v_min_priority
-- O CASE _min_role original falhava para 'owner' (caindo no ELSE 0).
CREATE OR REPLACE FUNCTION public.has_role_in_workspace(
  _user_id uuid,
  _workspace_id uuid,
  _min_role public.app_role
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_role public.app_role;
  v_owner_id uuid;
  v_role_priority int;
  v_min_priority int;
BEGIN
  -- 1. Verify if user is the actual owner (exclusive source of owner status)
  SELECT owner_id INTO v_owner_id
  FROM public.workspaces
  WHERE id = _workspace_id;

  -- 2. Get the role from members table (only for non-owners)
  IF v_owner_id = _user_id THEN
    -- Proprietário sempre tem autoridade máxima, mas v_user_role aqui 
    -- é secundário à verificação v_owner_id = _user_id no cálculo de prioridade.
    v_user_role := 'admin'; 
  ELSE
    SELECT role INTO v_user_role
    FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = _user_id
      AND status = 'active'
      AND role IN ('admin', 'editor', 'viewer');
  END IF;

  -- 3. Calculate priorities
  v_role_priority := CASE 
    WHEN v_owner_id = _user_id THEN 4
    WHEN v_user_role = 'admin' THEN 3
    WHEN v_user_role = 'editor' THEN 2
    WHEN v_user_role = 'viewer' THEN 1
    ELSE 0
  END;

  -- CORREÇÃO: Mapear 'owner' para 4 e garantir que valores inesperados falhem
  v_min_priority := CASE _min_role
    WHEN 'owner' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'editor' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 2147483647 -- Fail closed para qualquer outro valor
  END;
  
  RETURN v_role_priority >= v_min_priority;
END;
$function$;

-- 2. Restaurar privilégios restritos
REVOKE ALL ON FUNCTION public.has_role_in_workspace(uuid, uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role_in_workspace(uuid, uuid, public.app_role) TO authenticated, service_role;

-- 3. Garantir que update_checklist_assignments mantenha privilégios seguros
REVOKE ALL ON FUNCTION public.update_checklist_assignments(uuid, uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_checklist_assignments(uuid, uuid, uuid[], uuid) TO authenticated, service_role;

COMMIT;
