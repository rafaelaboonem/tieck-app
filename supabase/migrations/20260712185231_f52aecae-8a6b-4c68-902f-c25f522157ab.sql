
CREATE OR REPLACE FUNCTION public.publish_checklist(p_checklist_id uuid)
 RETURNS TABLE(id uuid, published_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row          public.checklists%ROWTYPE;
  v_caller       uuid := auth.uid();
  v_org          uuid;
  v_title        text;
  v_blocks       jsonb;
  v_new_blocks   jsonb := '[]'::jsonb;
  blk            jsonb;
  vision         jsonb;
  v_pattern      text;
  v_pattern_uuid uuid;
  model_row      public.vision_anomaly_models%ROWTYPE;
  new_vision     jsonb;
  new_blk        jsonb;
  v_on_anomaly   text;
  v_on_failure   text;
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
  ELSIF v_row.workspace_id IS NOT NULL
     AND public.user_has_workspace_access(v_row.workspace_id, v_caller, 'editor') THEN
    v_can_publish := true;
  END IF;
  IF NOT v_can_publish THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT u.workspace_id INTO v_org FROM public.units u WHERE u.id = v_row.unit_id;

  v_title  := COALESCE(NULLIF(btrim(v_row.title), ''), 'Sem título');
  v_blocks := COALESCE(v_row.blocks, '[]'::jsonb);
  IF jsonb_typeof(v_blocks) <> 'array' THEN
    v_blocks := '[]'::jsonb;
  END IF;

  FOR blk IN SELECT jsonb_array_elements(v_blocks)
  LOOP
    IF blk->>'type' <> 'camera' THEN
      v_new_blocks := v_new_blocks || jsonb_build_array(blk);
      CONTINUE;
    END IF;

    vision := blk->'vision';
    IF vision IS NULL
       OR jsonb_typeof(vision) <> 'object'
       OR COALESCE((vision->>'enabled')::boolean, false) <> true THEN
      v_new_blocks := v_new_blocks || jsonb_build_array(blk);
      CONTINUE;
    END IF;

    v_pattern := NULLIF(btrim(COALESCE(vision->>'patternSlug', vision->>'patternId', vision->>'datasetId')), '');

    IF v_pattern IS NULL AND (vision ? 'modelId') THEN
      BEGIN
        v_pattern_uuid := (vision->>'modelId')::uuid;
        SELECT m.slug INTO v_pattern
          FROM public.vision_anomaly_models m
         WHERE m.id = v_pattern_uuid;
      EXCEPTION WHEN OTHERS THEN
        v_pattern := NULL;
      END;
    END IF;

    IF v_pattern IS NULL THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com IA ativa sem padrão visual', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT m.* INTO model_row
      FROM public.vision_anomaly_models m
     WHERE m.slug = v_pattern
       AND m.status = 'active'
       AND m.retired_at IS NULL
       AND m.provider = 'anomalib'
       AND (m.organization_id IS NULL OR m.organization_id = v_org)
     ORDER BY m.activated_at DESC NULLS LAST, m.updated_at DESC
     LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'publication_invalid: bloco % sem modelo ativo para o padrão %', blk->>'id', v_pattern
        USING ERRCODE = 'check_violation';
    END IF;
    IF model_row.model_storage_path IS NULL
       OR length(btrim(model_row.model_storage_path)) = 0 THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com modelo sem artefato registrado', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;
    IF model_row.threshold IS NOT NULL
       AND (model_row.threshold < 0 OR model_row.threshold > 1) THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com threshold fora de [0,1]', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;

    v_on_anomaly := COALESCE(NULLIF(vision->>'onAnomaly', ''), 'manual_review');
    IF v_on_anomaly NOT IN ('allow_continue','require_resubmit','block_completion','manual_review') THEN
      v_on_anomaly := 'manual_review';
    END IF;
    v_on_failure := COALESCE(NULLIF(vision->>'onAnalysisFailure', ''), 'manual_review');
    IF v_on_failure NOT IN ('allow_continue','manual_review','block_completion') THEN
      v_on_failure := 'manual_review';
    END IF;

    new_vision := jsonb_build_object(
      'enabled',           true,
      'patternId',         v_pattern,
      'datasetId',         v_pattern,
      'modelId',           model_row.id,
      'modelVersion',      model_row.version,
      'provider',          model_row.provider,
      'threshold',         to_jsonb(model_row.threshold),
      'minWidth',          to_jsonb(model_row.input_width),
      'minHeight',         to_jsonb(model_row.input_height),
      'onAnomaly',         v_on_anomaly,
      'onAnalysisFailure', v_on_failure
    );

    new_blk := jsonb_set(blk, '{vision}', new_vision, true);
    v_new_blocks := v_new_blocks || jsonb_build_array(new_blk);
  END LOOP;

  UPDATE public.checklists c
     SET is_published      = true,
         published_content = jsonb_build_object(
           'title',        v_title,
           'blocks',       v_new_blocks,
           'settings',     COALESCE(v_row.settings, '{}'::jsonb),
           'published_at', to_jsonb(v_published_at)
         ),
         updated_at        = now()
   WHERE c.id = p_checklist_id;

  RETURN QUERY SELECT p_checklist_id AS id, v_published_at AS published_at;
END;
$function$;
