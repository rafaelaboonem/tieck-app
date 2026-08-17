DO $$
DECLARE
    v_rows_affected INTEGER;
    v_workspace_exists BOOLEAN;
    v_is_owner BOOLEAN;
    v_checklist_id UUID := 'a050976c-d5ed-44a0-af45-791a2c558dd8';
    v_user_id UUID := '7add1274-50bc-4ed5-8284-4e40986e9075';
    v_workspace_id UUID := 'a14b9d0e-0ac6-42b4-a61c-175868c283fc';
BEGIN
    -- 1. Verificar se o workspace existe
    SELECT EXISTS (
        SELECT 1 FROM public.workspaces WHERE id = v_workspace_id
    ) INTO v_workspace_exists;

    IF NOT v_workspace_exists THEN
        RAISE EXCEPTION 'MIGRATION_ERROR: Workspace % não encontrado', v_workspace_id;
    END IF;

    -- 2. Verificar se o owner corresponde ao user_id esperado
    SELECT EXISTS (
        SELECT 1 FROM public.workspaces WHERE id = v_workspace_id AND owner_id = v_user_id
    ) INTO v_is_owner;

    IF NOT v_is_owner THEN
        RAISE EXCEPTION 'MIGRATION_ERROR: O owner do workspace não corresponde ao user_id %', v_user_id;
    END IF;

    -- 3. Executar o UPDATE cirúrgico
    UPDATE public.checklists
    SET 
        workspace_id = v_workspace_id,
        updated_at = NOW()
    WHERE 
        id = v_checklist_id 
        AND user_id = v_user_id 
        AND workspace_id IS NULL;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    -- 4. Validar resultado (0 ou 1 é aceitável para idempotência)
    IF v_rows_affected > 1 THEN
        RAISE EXCEPTION 'MIGRATION_ERROR: Mais de uma linha afetada (%)', v_rows_affected;
    END IF;
    
    -- Nota: v_rows_affected = 0 pode significar que já foi migrado ou que o checklist não existe com workspace_id NULL.
    -- Vamos verificar se ele já está lá.
    IF v_rows_affected = 0 THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.checklists WHERE id = v_checklist_id AND workspace_id = v_workspace_id
        ) THEN
             RAISE EXCEPTION 'MIGRATION_ERROR: Checklist % não encontrado ou falha na migração', v_checklist_id;
        END IF;
        RAISE NOTICE 'MIGRATION_SUCCESS: O checklist já estava associado ao workspace.';
    ELSE
        RAISE NOTICE 'MIGRATION_SUCCESS: 1 linha alterada.';
    END IF;
END $$;
