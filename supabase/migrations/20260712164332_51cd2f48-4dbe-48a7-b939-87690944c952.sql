
CREATE OR REPLACE FUNCTION public.publish_checklist(p_checklist_id uuid)
RETURNS TABLE(id uuid, published_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row       public.checklists%ROWTYPE;
  v_caller    uuid := auth.uid();
  v_org       uuid;
  v_title     text;
  v_blocks    jsonb;
  v_new_blocks jsonb := '[]'::jsonb;
  blk         jsonb;
  vision      jsonb;
  model_id    uuid;
  model_row   public.vision_anomaly_models%ROWTYPE;
  new_vision  jsonb;
  new_blk     jsonb;
  v_on_anomaly text;
  v_on_failure text;
  v_published_at timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_row FROM public.checklists WHERE id = p_checklist_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_row.user_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = 'insufficient_privilege';
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

    BEGIN
      model_id := (vision->>'modelId')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com IA ativa sem padrão visual válido', blk->>'id'
        USING ERRCODE = 'check_violation';
    END;
    IF model_id IS NULL THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com IA ativa sem padrão visual', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO model_row FROM public.vision_anomaly_models WHERE id = model_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'publication_invalid: bloco % referencia padrão visual inexistente', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;

    IF model_row.organization_id IS NOT NULL
       AND (v_org IS NULL OR model_row.organization_id <> v_org) THEN
      RAISE EXCEPTION 'publication_invalid: bloco % usa padrão fora do escopo do checklist', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;
    IF model_row.provider <> 'anomalib' THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com provider % não suportado', blk->>'id', model_row.provider
        USING ERRCODE = 'check_violation';
    END IF;
    IF model_row.status <> 'active' THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com padrão em status % (esperado active)', blk->>'id', model_row.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF model_row.retired_at IS NOT NULL THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com padrão aposentado', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;
    IF model_row.model_storage_path IS NULL
       OR length(btrim(model_row.model_storage_path)) = 0 THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com padrão sem artefato registrado', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;
    IF model_row.threshold IS NOT NULL
       AND (model_row.threshold < 0 OR model_row.threshold > 1) THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com threshold fora de [0,1]', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Políticas: aceitam o que o rascunho declara (dentro de valores válidos) e caem para manual_review.
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
      'patternId',         model_row.id,
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

  UPDATE public.checklists
     SET is_published      = true,
         published_content = jsonb_build_object(
           'title',        v_title,
           'blocks',       v_new_blocks,
           'settings',     COALESCE(v_row.settings, '{}'::jsonb),
           'published_at', to_jsonb(v_published_at)
         ),
         updated_at        = now()
   WHERE id = p_checklist_id;

  RETURN QUERY SELECT p_checklist_id, v_published_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.publish_checklist(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_checklist(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_checklist(uuid) TO service_role;
