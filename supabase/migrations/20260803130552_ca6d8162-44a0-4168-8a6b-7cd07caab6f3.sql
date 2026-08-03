CREATE OR REPLACE FUNCTION public.publish_checklist(p_checklist_id uuid)
 RETURNS TABLE(id uuid, published_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row          public.checklists%ROWTYPE;
  v_caller       uuid := auth.uid();
  v_title        text;
  v_blocks       jsonb;
  v_out_blocks   jsonb := '[]'::jsonb;
  v_block        jsonb;
  v_cam_id       text;
  v_std          public.visual_standards%ROWTYPE;
  v_published_at timestamptz := now();
  v_can_publish  boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT c.* INTO v_row FROM public.checklists c WHERE c.id = p_checklist_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_row.user_id = v_caller THEN
    v_can_publish := true;
  ELSIF v_row.workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspaces w
       WHERE w.id = v_row.workspace_id AND w.owner_id = v_caller
    ) THEN
    v_can_publish := true;
  END IF;
  IF NOT v_can_publish THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_title  := COALESCE(NULLIF(btrim(v_row.title), ''), 'Sem título');
  v_blocks := COALESCE(v_row.blocks, '[]'::jsonb);
  IF jsonb_typeof(v_blocks) <> 'array' THEN
    v_blocks := '[]'::jsonb;
  END IF;

  FOR v_block IN SELECT * FROM jsonb_array_elements(v_blocks)
  LOOP
    IF v_block->>'type' = 'camera'
       AND COALESCE((v_block->'vision'->>'enabled')::boolean, false) THEN

      v_cam_id := NULLIF(btrim(COALESCE(v_block->>'cameraBlockId', '')), '');
      IF v_cam_id IS NULL THEN
        RAISE EXCEPTION 'standard_not_configured' USING ERRCODE = 'check_violation';
      END IF;

      SELECT s.* INTO v_std
        FROM public.visual_standards s
       WHERE s.checklist_id = p_checklist_id
         AND s.camera_block_id = v_cam_id::uuid
         AND s.archived_at IS NULL
       LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'standard_not_configured' USING ERRCODE = 'check_violation';
      END IF;

      IF v_std.status <> 'validated' OR v_std.needs_validation THEN
        RAISE EXCEPTION 'standard_not_active' USING ERRCODE = 'check_violation';
      END IF;

      v_block := v_block
        || jsonb_build_object(
             'cameraBlockId', v_cam_id,
             'visualStandardId', v_std.id,
             'visualStandardVersion', v_std.profile_version
           );
    END IF;

    v_out_blocks := v_out_blocks || jsonb_build_array(v_block);
  END LOOP;

  UPDATE public.checklists c
     SET is_published      = true,
         published_content = jsonb_build_object(
           'title',        v_title,
           'blocks',       v_out_blocks,
           'settings',     COALESCE(v_row.settings, '{}'::jsonb),
           'published_at', to_jsonb(v_published_at)
         ),
         updated_at        = now()
   WHERE c.id = p_checklist_id;

  RETURN QUERY SELECT p_checklist_id AS id, v_published_at AS published_at;
END;
$function$;