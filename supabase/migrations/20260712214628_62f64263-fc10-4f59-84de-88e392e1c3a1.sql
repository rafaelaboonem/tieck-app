CREATE OR REPLACE FUNCTION public.can_manage_vision_training(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'franqueadora'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.user_id = _user_id
        AND wm.status = 'active'
        AND wm.role IN ('admin', 'editor')
    )
    OR EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.owner_id = _user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.prepare_model_version(
  p_dataset_id uuid, p_note text DEFAULT NULL, p_seed bigint DEFAULT NULL
) RETURNS TABLE(version_id uuid, snapshot_id uuid, version text, run_token text, run_token_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
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

  SELECT COALESCE(MAX(CASE WHEN version ~ '^v[0-9]+$' THEN substring(version FROM 2)::int ELSE 0 END),0)+1
    INTO v_next_idx FROM public.vision_dataset_snapshots WHERE dataset_id=p_dataset_id;
  v_version_label := 'v'||v_next_idx::text;
  v_snapshot_id := gen_random_uuid();
  v_version_id  := gen_random_uuid();

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

  SELECT COUNT(*) INTO v_ignored FROM public.vision_curated_images
    WHERE dataset_id=p_dataset_id AND classification='ignored';

  INSERT INTO public.vision_dataset_snapshots(
    id, dataset_id, organization_id, version, seed, note,
    image_count, normal_count, anomalous_count, ignored_count,
    train_normal_count, validation_normal_count, validation_anomalous_count,
    test_normal_count, test_anomalous_count, created_by
  ) VALUES (
    v_snapshot_id, p_dataset_id, v_org, v_version_label, v_seed, NULLIF(btrim(p_note),''),
    v_total, v_normal, v_anom, v_ignored, v_tn, v_vn, v_va, v_tsn, v_tsa, v_caller
  );

  v_token      := encode(public.gen_random_bytes(32),'hex');
  v_token_hash := encode(public.digest(v_token,'sha256'),'hex');
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
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
  v_token := encode(public.gen_random_bytes(32),'hex');
  v_hash  := encode(public.digest(v_token,'sha256'),'hex');
  v_exp   := now() + interval '48 hours';
  UPDATE public.vision_model_versions
    SET run_token_hash=v_hash, run_token_created_at=now(), run_token_expires_at=v_exp
    WHERE id=p_version_id;
  INSERT INTO public.vision_model_audit(model_version_id,actor_id,event,detail)
  VALUES (p_version_id, v_caller, 'token_rotated', jsonb_build_object('reason', NULLIF(btrim(p_reason),'')));
  RETURN QUERY SELECT v_token, v_exp;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_model_version_run_token(p_version_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='insufficient_privilege'; END IF;
  IF NOT public.can_manage_vision_training(v_caller) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='insufficient_privilege';
  END IF;
  UPDATE public.vision_model_versions
    SET run_token_hash=NULL, run_token_expires_at=NULL
    WHERE id=p_version_id;
  INSERT INTO public.vision_model_audit(model_version_id,actor_id,event,detail)
  VALUES (p_version_id, v_caller, 'token_revoked', jsonb_build_object('reason', NULLIF(btrim(p_reason),'')));
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_model_version(p_version_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_status text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='insufficient_privilege'; END IF;
  IF NOT public.can_manage_vision_training(v_caller) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason))<3 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE='check_violation',
      MESSAGE='Motivo obrigatório para rejeitar uma versão.';
  END IF;
  SELECT status INTO v_status FROM public.vision_model_versions WHERE id=p_version_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'version_not_found' USING ERRCODE='no_data_found'; END IF;
  IF v_status IN ('active','retired','rejected') THEN
    RAISE EXCEPTION 'version_not_rejectable' USING ERRCODE='check_violation';
  END IF;
  UPDATE public.vision_model_versions
    SET status='rejected', rejection_reason=btrim(p_reason),
        rejected_by=v_caller, rejected_at=now(),
        run_token_hash=NULL, run_token_expires_at=NULL
    WHERE id=p_version_id;
  INSERT INTO public.vision_model_audit(model_version_id,actor_id,event,detail)
  VALUES (p_version_id, v_caller, 'rejected', jsonb_build_object('reason', btrim(p_reason)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.activate_model_version(p_version_id uuid, p_run_id uuid, p_exception_reason text DEFAULT NULL)
RETURNS TABLE(model_id uuid, version text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_ver public.vision_model_versions%ROWTYPE;
  v_run public.vision_model_runs%ROWTYPE;
  v_ds  public.vision_datasets%ROWTYPE;
  v_snap public.vision_dataset_snapshots%ROWTYPE;
  v_model_id uuid;
  v_has_anom boolean;
  v_metrics_keys int;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='insufficient_privilege'; END IF;
  IF NOT public.can_manage_vision_training(v_caller) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO v_ver FROM public.vision_model_versions WHERE id=p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_not_found' USING ERRCODE='no_data_found'; END IF;
  IF v_ver.status <> 'awaiting_approval' THEN
    RAISE EXCEPTION 'version_not_awaiting_approval' USING ERRCODE='check_violation';
  END IF;

  SELECT * INTO v_run FROM public.vision_model_runs
    WHERE id=p_run_id AND model_version_id=p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found' USING ERRCODE='no_data_found'; END IF;
  IF v_run.status <> 'completed' THEN
    RAISE EXCEPTION 'run_not_completed' USING ERRCODE='check_violation';
  END IF;
  IF v_run.artifact_path IS NULL OR length(btrim(v_run.artifact_path))=0 THEN
    RAISE EXCEPTION 'artifact_missing' USING ERRCODE='check_violation';
  END IF;
  IF v_run.threshold IS NULL OR v_run.threshold<0 OR v_run.threshold>1 THEN
    RAISE EXCEPTION 'threshold_invalid' USING ERRCODE='check_violation';
  END IF;

  SELECT COUNT(*)::int INTO v_metrics_keys
    FROM jsonb_object_keys(COALESCE(v_run.metrics,'{}'::jsonb));
  IF v_metrics_keys = 0 THEN
    RAISE EXCEPTION 'metrics_missing' USING ERRCODE='check_violation';
  END IF;

  SELECT * INTO v_ds FROM public.vision_datasets WHERE id=v_ver.dataset_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'dataset_not_found' USING ERRCODE='no_data_found'; END IF;
  SELECT * INTO v_snap FROM public.vision_dataset_snapshots WHERE id=v_ver.snapshot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'snapshot_not_found' USING ERRCODE='no_data_found'; END IF;

  v_has_anom := (v_snap.validation_anomalous_count + v_snap.test_anomalous_count) > 0;
  IF NOT v_has_anom THEN
    IF p_exception_reason IS NULL OR length(btrim(p_exception_reason))<10 THEN
      RAISE EXCEPTION 'anomaly_exception_required' USING ERRCODE='check_violation';
    END IF;
  END IF;

  UPDATE public.vision_anomaly_models
     SET status='retired', retired_at=now(), updated_at=now()
   WHERE slug=v_ds.slug AND status='active' AND retired_at IS NULL
     AND (organization_id IS NOT DISTINCT FROM v_ver.organization_id);

  INSERT INTO public.vision_anomaly_models(
    organization_id, name, slug, task_category, provider, algorithm, version,
    status, model_storage_path, input_width, input_height, threshold,
    training_dataset_version, normal_image_count, anomalous_test_image_count,
    metrics, activated_at
  ) VALUES (
    v_ver.organization_id, v_ds.name, v_ds.slug, v_ds.task_category, 'anomalib', v_run.algorithm, v_ver.version,
    'active', v_run.artifact_path, v_ver.input_width, v_ver.input_height, v_run.threshold,
    v_ver.version, v_snap.normal_count, v_snap.test_anomalous_count + v_snap.validation_anomalous_count,
    COALESCE(v_run.metrics,'{}'::jsonb), now()
  ) RETURNING id INTO v_model_id;

  UPDATE public.vision_model_versions
     SET status='active', selected_run_id=v_run.id, algorithm=v_run.algorithm,
         approved_by=v_caller, approved_at=now(), activated_at=now(),
         activated_model_id=v_model_id, artifact_path=v_run.artifact_path,
         threshold=v_run.threshold, metrics=COALESCE(v_run.metrics,'{}'::jsonb),
         approval_exception_reason=NULLIF(btrim(p_exception_reason),''),
         run_token_hash=NULL, run_token_expires_at=NULL,
         updated_at=now()
   WHERE id=p_version_id;

  INSERT INTO public.vision_model_audit(model_version_id,actor_id,event,detail)
  VALUES (p_version_id, v_caller, 'activated',
    jsonb_build_object('run_id', p_run_id, 'algorithm', v_run.algorithm,
                       'model_id', v_model_id, 'threshold', v_run.threshold,
                       'exception', NULLIF(btrim(p_exception_reason),'')));

  RETURN QUERY SELECT v_model_id, v_ver.version;
END;
$function$;

DROP POLICY IF EXISTS "vision_model_audit_admin_read" ON public.vision_model_audit;
CREATE POLICY "vision_model_audit_manager_read"
  ON public.vision_model_audit
  FOR SELECT
  TO authenticated
  USING (public.can_manage_vision_training(auth.uid()));

DROP POLICY IF EXISTS "vision_dataset_snapshots_admin_select" ON public.vision_dataset_snapshots;
CREATE POLICY "vision_dataset_snapshots_manager_select"
  ON public.vision_dataset_snapshots
  FOR SELECT
  TO authenticated
  USING (public.can_manage_vision_training(auth.uid()));

DROP POLICY IF EXISTS "vmv_admin_select" ON public.vision_model_versions;
CREATE POLICY "vmv_manager_select"
  ON public.vision_model_versions
  FOR SELECT
  TO authenticated
  USING (public.can_manage_vision_training(auth.uid()));

DROP POLICY IF EXISTS "vmr_admin_select" ON public.vision_model_runs;
CREATE POLICY "vmr_manager_select"
  ON public.vision_model_runs
  FOR SELECT
  TO authenticated
  USING (public.can_manage_vision_training(auth.uid()));