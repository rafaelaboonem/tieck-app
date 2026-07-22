CREATE OR REPLACE FUNCTION public.activate_model_version(
  p_version_id uuid, p_run_id uuid, p_exception_reason text DEFAULT NULL
) RETURNS TABLE(model_id uuid, version text)
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
  IF NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'franqueadora')) THEN
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

GRANT EXECUTE ON FUNCTION public.activate_model_version(uuid,uuid,text) TO authenticated;