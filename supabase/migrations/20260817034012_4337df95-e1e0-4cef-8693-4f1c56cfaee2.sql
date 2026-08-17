DO $$
DECLARE
    v_has_access BOOLEAN;
    v_checklist_id UUID := 'a050976c-d5ed-44a0-af45-791a2c558dd8';
    v_user_id UUID := '7add1274-50bc-4ed5-8284-4e40986e9075';
    v_workspace_id UUID := 'a14b9d0e-0ac6-42b4-a61c-175868c283fc';
    v_viewer_id UUID := (SELECT user_id FROM public.workspace_members WHERE workspace_id = v_workspace_id AND role = 'viewer' LIMIT 1);
BEGIN
    -- 1. Testar acesso do Owner (Brayan)
    -- Simulando SELECT na tabela checklists como se fosse o owner (a política RLS checklists_owner_all)
    IF EXISTS (
        SELECT 1 FROM public.checklists 
        WHERE id = v_checklist_id 
        AND (user_id = v_user_id OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = v_user_id))
    ) THEN
        RAISE NOTICE 'RLS_TEST: Owner access SUCCESS';
    ELSE
        RAISE NOTICE 'RLS_TEST: Owner access FAIL';
    END IF;

    -- 2. Testar acesso do Viewer (se existir)
    IF v_viewer_id IS NOT NULL THEN
        -- Simulando a função user_has_workspace_access dentro da RLS
        SELECT EXISTS (
            SELECT 1 FROM public.workspace_members 
            WHERE workspace_id = v_workspace_id 
            AND user_id = v_viewer_id 
            AND status = 'active'
        ) INTO v_has_access;

        IF v_has_access THEN
            RAISE NOTICE 'RLS_TEST: Viewer (%) access SUCCESS', v_viewer_id;
        ELSE
            RAISE NOTICE 'RLS_TEST: Viewer (%) access FAIL', v_viewer_id;
        END IF;
    ELSE
        RAISE NOTICE 'RLS_TEST: No Viewer found to test.';
    END IF;
END $$;
