DROP FUNCTION IF EXISTS public.get_public_checklist(text);

-- Restore canonical format in publish_checklist
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
    v_user_id uuid;
    v_published_content jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_checklist FROM public.checklists WHERE id = p_checklist_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Checklist not found'; END IF;

    IF v_checklist.workspace_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = v_checklist.workspace_id AND user_id = v_user_id) THEN
            RAISE EXCEPTION 'Forbidden';
        END IF;
    ELSE
        IF v_checklist.user_id != v_user_id THEN RAISE EXCEPTION 'Forbidden'; END IF;
    END IF;

    v_blocks := v_checklist.blocks;
    FOR v_block IN SELECT * FROM jsonb_array_elements(v_blocks)
    LOOP
        IF v_block->>'type' = 'camera' THEN
            v_block := v_block - 'vision' - 'visualStandardId' - 'visualStandardVersion' - 'referenceImagePath' - 'referenceImageAlt' - 'criteria' - 'confidenceThreshold' - 'model' - 'threshold' - 'modelVersion';
        END IF;
        v_new_blocks := v_new_blocks || v_block;
    END LOOP;

    v_published_content := jsonb_build_object(
        'title', v_checklist.title,
        'blocks', v_new_blocks,
        'settings', v_checklist.settings,
        'published_at', now()
    );

    UPDATE public.checklists SET published_content = v_published_content, is_published = true, updated_at = now() WHERE id = p_checklist_id;

    RETURN jsonb_build_object('ok', true, 'checklist_id', p_checklist_id, 'is_published', true);
END;
$$;

-- Fix get_public_checklist for compatibility
CREATE OR REPLACE FUNCTION public.get_public_checklist(p_public_id text)
RETURNS TABLE (id uuid, title text, description text, blocks jsonb, settings jsonb, short_slug text, custom_slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id, c.title, c.description,
        CASE 
            WHEN jsonb_typeof(c.published_content) = 'array' THEN c.published_content
            WHEN jsonb_typeof(c.published_content->'blocks') = 'array' THEN c.published_content->'blocks'
            ELSE '[]'::jsonb
        END as blocks,
        c.settings, c.short_slug, c.custom_slug
    FROM public.checklists c
    WHERE (c.short_slug = p_public_id OR c.custom_slug = p_public_id OR c.id::text = p_public_id)
      AND c.is_published = true;
END;
$$;
