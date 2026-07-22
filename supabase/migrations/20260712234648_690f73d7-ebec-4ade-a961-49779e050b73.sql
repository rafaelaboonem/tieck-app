
ALTER TABLE public.vision_model_runs DROP CONSTRAINT IF EXISTS vmr_algorithm_chk;
ALTER TABLE public.vision_model_versions DROP CONSTRAINT IF EXISTS vmv_algorithm_chk;
ALTER TABLE public.vision_anomaly_models DROP CONSTRAINT IF EXISTS vision_anomaly_models_algorithm_check;

DELETE FROM public.vision_model_runs a
USING public.vision_model_runs b
WHERE a.algorithm = 'efficient_ad'
  AND b.algorithm = 'efficientad'
  AND a.model_version_id = b.model_version_id;

UPDATE public.vision_model_runs      SET algorithm='efficientad' WHERE algorithm='efficient_ad';
UPDATE public.vision_model_versions  SET algorithm='efficientad' WHERE algorithm='efficient_ad';
UPDATE public.vision_anomaly_models  SET algorithm='efficientad' WHERE algorithm='efficient_ad';

ALTER TABLE public.vision_model_runs
  ADD CONSTRAINT vmr_algorithm_chk CHECK (algorithm IN ('patchcore','efficientad'));
ALTER TABLE public.vision_model_versions
  ADD CONSTRAINT vmv_algorithm_chk CHECK (algorithm IS NULL OR algorithm IN ('patchcore','efficientad'));
ALTER TABLE public.vision_anomaly_models
  ADD CONSTRAINT vision_anomaly_models_algorithm_check CHECK (
    algorithm IS NULL OR algorithm IN ('patchcore','efficientad','padim','fastflow','stfpm','other')
  );

DO $mig$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO def
  FROM pg_proc
  WHERE proname = 'prepare_model_version'
    AND pronamespace = 'public'::regnamespace;
  IF def IS NULL THEN RETURN; END IF;
  def := replace(def, '''efficient_ad''', '''efficientad''');
  EXECUTE def;
END
$mig$;
