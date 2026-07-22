CREATE OR REPLACE FUNCTION public.prepare_model_version(
  p_dataset_id uuid, p_note text DEFAULT NULL, p_seed bigint DEFAULT NULL
) RETURNS TABLE(version_id uuid, snapshot_id uuid, version text, run_token text, run_token_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp','extensions'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_ds     public.vision_datasets%ROWTYPE;
  v_seed   bigint;
  v_org    uuid;
  v_org_count int;
  v_next_idx int;
  v_version_label text;
  v_snapshot_id uuid;
  v_version_id  uuid;
  v_ignored integer;
  v_total   integer;
  v_normal  integer;
  v_anom    integer;
  v_tn integer; v_vn integer; v_va integer; v_tsn integer; v_tsa integer;
  v_token       text;
  v_token_hash  text;
  v_token_exp   timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.can_manage_vision_training(v_caller) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO v_ds FROM public.vision_datasets WHERE id=p_dataset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dataset_not_found' USING ERRCODE='no_data_found'; END IF;

  v_seed := COALESCE(p_seed, (floor(random()*9223372036854775000))::bigint);

  SELECT COUNT(DISTINCT COALESCE(organization_id::text,'__null__'))
    INTO v_org_count
  FROM public.vision_curated_images
  WHERE dataset_id=p_dataset_id AND classification IN ('normal','anomalous') AND sha256 IS NOT NULL;
  IF v_org_count=0 THEN RAISE EXCEPTION 'no_eligible_images' USING ERRCODE='check_violation'; END IF;
  IF v_org_count>1 THEN RAISE EXCEPTION 'mixed_workspace_scope' USING ERRCODE='check_violation'; END IF;

  SELECT DISTINCT organization_id INTO v_org
  FROM public.vision_curated_images
  WHERE dataset_id=p_dataset_id AND classification IN ('normal','anomalous') AND sha256 IS NOT NULL LIMIT 1;

  SELECT COALESCE(MAX(CASE WHEN vds.version ~ '^v[0-9]+$' THEN substring(vds.version FROM 2)::int ELSE 0 END),0)+1
    INTO v_next_idx
  FROM public.vision_dataset_snapshots AS vds
  WHERE vds.dataset_id=p_dataset_id;
  v_version_label := 'v'||v_next_idx::text;
  v_snapshot_id := gen_random_uuid();
  v_version_id  := gen_random_uuid();

  SELECT COUNT(*) INTO v_ignored FROM public.vision_curated_images
    WHERE dataset_id=p_dataset_id AND classification='ignored';

  INSERT INTO public.vision_dataset_snapshots(
    id, dataset_id, organization_id, version, seed, note,
    image_count, normal_count, anomalous_count, ignored_count,
    train_normal_count, validation_normal_count, validation_anomalous_count,
    test_normal_count, test_anomalous_count, created_by
  ) VALUES (
    v_snapshot_id, p_dataset_id, v_org, v_version_label, v_seed, NULLIF(btrim(p_note),''),
    0, 0, 0, v_ignored, 0, 0, 0, 0, 0, v_caller
  );

  WITH src AS (
    SELECT DISTINCT ON (ci.sha256)
      ci.id, ci.classification, ci.sha256, ci.source_storage_path,
      ci.response_id, ci.checklist_id, ci.evidence_id, ci.checklist_evidence_id,
      COALESCE(ci.response_id::text,'img:'||ci.id::text) AS group_key
    FROM public.vision_curated_images ci
    WHERE ci.dataset_id=p_dataset_id AND ci.classification IN ('normal','anomalous') AND ci.sha256 IS NOT NULL
    ORDER BY ci.sha256, ci.id
  ),
  gf AS (
    SELECT group_key, bool_or(classification='anomalous') AS has_anom,
      (('x'||substr(md5(v_seed::text||':'||group_key),1,8))::bit(32)::int & 2147483647) % 100 AS bucket
    FROM src GROUP BY group_key
  ),
  gs AS (
    SELECT group_key,
      CASE WHEN has_anom THEN CASE WHEN bucket<50 THEN 'validation' ELSE 'test' END
           ELSE CASE WHEN bucket<70 THEN 'train' WHEN bucket<85 THEN 'validation' ELSE 'test' END
      END AS split
    FROM gf
  ),
  ins AS (
    INSERT INTO public.vision_dataset_snapshot_images(
      snapshot_id, curated_image_id, classification, category, split,
      sha256, source_storage_path, group_key,
      response_id, checklist_id, evidence_id, checklist_evidence_id
    )
    SELECT v_snapshot_id, s.id, s.classification, s.classification, gs.split,
      s.sha256, s.source_storage_path, s.group_key,
      s.response_id, s.checklist_id, s.evidence_id, s.checklist_evidence_id
    FROM src s JOIN gs USING (group_key)
    RETURNING split, category
  )
  SELECT COUNT(*), COUNT(*) FILTER (WHERE category='normal'), COUNT(*) FILTER (WHERE category='anomalous'),
    COUNT(*) FILTER (WHERE split='train' AND category='normal'),
    COUNT(*) FILTER (WHERE split='validation' AND category='normal'),
    COUNT(*) FILTER (WHERE split='validation' AND category='anomalous'),
    COUNT(*) FILTER (WHERE split='test' AND category='normal'),
    COUNT(*) FILTER (WHERE split='test' AND category='anomalous')
  INTO v_total, v_normal, v_anom, v_tn, v_vn, v_va, v_tsn, v_tsa FROM ins;

  IF COALESCE(v_total,0)=0 THEN RAISE EXCEPTION 'no_eligible_images' USING ERRCODE='check_violation'; END IF;
  IF v_tn < GREATEST(1, COALESCE(v_ds.min_normal_technical,5)) THEN
    RAISE EXCEPTION 'insufficient_training_images'
      USING MESSAGE = format('Mínimo técnico do padrão exige %s imagem(ns) corretas em treino; obtidas %s.',
                             GREATEST(1,COALESCE(v_ds.min_normal_technical,5)), v_tn),
            ERRCODE = 'check_violation';
  END IF;

  UPDATE public.vision_dataset_snapshots
     SET image_count = v_total,
         normal_count = v_normal,
         anomalous_count = v_anom,
         ignored_count = v_ignored,
         train_normal_count = v_tn,
         validation_normal_count = v_vn,
         validation_anomalous_count = v_va,
         test_normal_count = v_tsn,
         test_anomalous_count = v_tsa
   WHERE id = v_snapshot_id;

  v_token      := encode(extensions.gen_random_bytes(32),'hex');
  v_token_hash := encode(extensions.digest(v_token,'sha256'),'hex');
  v_token_exp  := now() + interval '48 hours';

  INSERT INTO public.vision_model_versions(
    id, dataset_id, snapshot_id, organization_id, version, status,
    current_step, public_message, note, initiated_by,
    run_token_hash, run_token_created_at, run_token_expires_at
  ) VALUES (
    v_version_id, p_dataset_id, v_snapshot_id, v_org, v_version_label, 'preparing_dataset',
    'Preparando imagens', 'Snapshot do dataset criado; aguardando execução do treino.',
    NULLIF(btrim(p_note),''), v_caller, v_token_hash, now(), v_token_exp
  );

  INSERT INTO public.vision_model_runs(model_version_id, algorithm, status, current_step, public_message)
  VALUES
    (v_version_id,'patchcore','queued','Aguardando início','Na fila'),
    (v_version_id,'efficient_ad','queued','Aguardando início','Na fila');

  INSERT INTO public.vision_model_audit(model_version_id, actor_id, event, detail)
  VALUES (v_version_id, v_caller, 'prepared',
    jsonb_build_object('snapshot_id', v_snapshot_id, 'seed', v_seed,
                       'normal', v_normal, 'anomalous', v_anom));

  RETURN QUERY SELECT v_version_id, v_snapshot_id, v_version_label, v_token, v_token_exp;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rotate_model_version_run_token(p_version_id uuid, p_reason text DEFAULT NULL)
RETURNS TABLE(run_token text, run_token_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp','extensions'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_token text; v_hash text; v_exp timestamptz;
  v_status text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='insufficient_privilege'; END IF;
  IF NOT public.can_manage_vision_training(v_caller) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='insufficient_privilege';
  END IF;
  SELECT status INTO v_status FROM public.vision_model_versions WHERE id=p_version_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'version_not_found' USING ERRCODE='no_data_found'; END IF;
  IF v_status NOT IN ('preparing_dataset','queued','training','validating','failed') THEN
    RAISE EXCEPTION 'token_rotation_not_allowed' USING ERRCODE='check_violation',
      MESSAGE='Token só pode ser rotacionado antes da aprovação/ativação.';
  END IF;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  v_hash  := encode(extensions.digest(v_token,'sha256'),'hex');
  v_exp   := now() + interval '48 hours';
  UPDATE public.vision_model_versions
    SET run_token_hash=v_hash, run_token_created_at=now(), run_token_expires_at=v_exp
    WHERE id=p_version_id;
  INSERT INTO public.vision_model_audit(model_version_id,actor_id,event,detail)
  VALUES (p_version_id, v_caller, 'token_rotated', jsonb_build_object('reason', NULLIF(btrim(p_reason),'')));
  RETURN QUERY SELECT v_token, v_exp;
END;
$function$;