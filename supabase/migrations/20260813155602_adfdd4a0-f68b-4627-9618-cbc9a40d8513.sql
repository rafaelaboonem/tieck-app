DROP FUNCTION IF EXISTS public.publish_checklist(uuid);

CREATE OR REPLACE FUNCTION public.publish_checklist(p_checklist_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_checklist RECORD;
    v_blocks jsonb;
    v_block jsonb;
    v_new_blocks jsonb := '[]'::jsonb;
    v_workspace_id uuid;
    v_user_id uuid;
BEGIN
    -- 1. Auth & Authorization
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT * INTO v_checklist
    FROM public.checklists
    WHERE id = p_checklist_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Checklist not found';
    END IF;

    -- Workspace check or direct owner check
    IF v_checklist.workspace_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_id = v_checklist.workspace_id
              AND user_id = v_user_id
        ) THEN
            RAISE EXCEPTION 'Forbidden: Not a workspace member';
        END IF;
    ELSE
        IF v_checklist.user_id != v_user_id THEN
            RAISE EXCEPTION 'Forbidden: Not the owner';
        END IF;
    END IF;

    -- 2. Baseline Neutra Snapshot Logic
    v_blocks := v_checklist.blocks;
    
    FOR v_block IN SELECT * FROM jsonb_array_elements(v_blocks)
    LOOP
        -- Se for bloco camera, removemos metadados legados
        IF v_block->>'type' = 'camera' THEN
            v_block := v_block - 'vision' 
                             - 'visualStandardId' 
                             - 'visualStandardVersion' 
                             - 'referenceImagePath' 
                             - 'referenceImageAlt'
                             - 'criteria'
                             - 'confidenceThreshold'
                             - 'model'
                             - 'threshold'
                             - 'modelVersion';
        END IF;
        
        v_new_blocks := v_new_blocks || v_block;
    END LOOP;

    -- 3. Update Checklist
    UPDATE public.checklists
    SET 
        published_content = v_new_blocks,
        is_published = true,
        updated_at = now()
    WHERE id = p_checklist_id;

    RETURN jsonb_build_object(
        'ok', true,
        'checklist_id', p_checklist_id,
        'is_published', true
    );
END;
$$;
