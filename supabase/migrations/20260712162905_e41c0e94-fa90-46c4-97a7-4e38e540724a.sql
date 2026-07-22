CREATE OR REPLACE FUNCTION public.validate_checklist_publication()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  blk        jsonb;
  vision     jsonb;
  model_id   uuid;
  model_ver  text;
  thr        numeric;
  cl_org     uuid;
  model_row  public.vision_anomaly_models%ROWTYPE;
BEGIN
  IF COALESCE(NEW.is_published, false) IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  IF NEW.published_content IS NULL
     OR jsonb_typeof(NEW.published_content->'blocks') <> 'array' THEN
    RETURN NEW;
  END IF;

  -- Escopo do checklist via workspace da unidade (quando existir).
  SELECT u.workspace_id INTO cl_org
    FROM public.units u
   WHERE u.id = NEW.unit_id;

  FOR blk IN SELECT jsonb_array_elements(NEW.published_content->'blocks')
  LOOP
    IF blk->>'type' <> 'camera' THEN CONTINUE; END IF;
    vision := blk->'vision';
    IF vision IS NULL OR jsonb_typeof(vision) <> 'object' THEN CONTINUE; END IF;
    IF COALESCE((vision->>'enabled')::boolean, false) <> true THEN CONTINUE; END IF;

    BEGIN
      model_id := (vision->>'modelId')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com vision.enabled=true sem modelId válido', blk->>'id'
        USING ERRCODE = 'check_violation';
    END;
    IF model_id IS NULL THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com vision.enabled=true sem modelId', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;

    model_ver := vision->>'modelVersion';
    IF model_ver IS NULL OR length(btrim(model_ver)) = 0 THEN
      RAISE EXCEPTION 'publication_invalid: bloco % sem modelVersion', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;

    IF (vision ? 'threshold') AND jsonb_typeof(vision->'threshold') = 'number' THEN
      thr := (vision->>'threshold')::numeric;
      IF thr < 0 OR thr > 1 THEN
        RAISE EXCEPTION 'publication_invalid: bloco % com threshold fora de [0,1]', blk->>'id'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    SELECT * INTO model_row FROM public.vision_anomaly_models WHERE id = model_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'publication_invalid: bloco % referencia modelo inexistente', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;

    IF model_row.organization_id IS NOT NULL
       AND (cl_org IS NULL OR model_row.organization_id <> cl_org) THEN
      RAISE EXCEPTION 'publication_invalid: bloco % usa modelo fora do escopo do checklist', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;

    IF model_row.provider <> 'anomalib' THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com provider % não suportado', blk->>'id', model_row.provider
        USING ERRCODE = 'check_violation';
    END IF;

    IF model_row.status <> 'active' THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com modelo em status % (esperado active)', blk->>'id', model_row.status
        USING ERRCODE = 'check_violation';
    END IF;

    IF model_row.retired_at IS NOT NULL THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com modelo aposentado', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;

    IF model_row.version <> model_ver THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com modelVersion divergente do registro', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;

    IF model_row.model_storage_path IS NULL
       OR length(btrim(model_row.model_storage_path)) = 0 THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com modelo sem artefato registrado', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;

    IF model_row.threshold IS NOT NULL
       AND (model_row.threshold < 0 OR model_row.threshold > 1) THEN
      RAISE EXCEPTION 'publication_invalid: bloco % com threshold do modelo fora de [0,1]', blk->>'id'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;