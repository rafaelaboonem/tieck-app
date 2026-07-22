
-- pgcrypto p/ digest() e gen_random_bytes()
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- 1) Colunas de token temporário na versão (armazenado apenas em hash).
ALTER TABLE public.vision_model_versions
  ADD COLUMN run_token_hash        text,
  ADD COLUMN run_token_created_at  timestamptz,
  ADD COLUMN run_token_expires_at  timestamptz;

COMMENT ON COLUMN public.vision_model_versions.run_token_hash IS
  'SHA-256 hex do token temporário entregue ao serviço de treino. Nunca guardar o token em texto claro.';

-- 2) Tabela de runs por algoritmo.
CREATE TABLE public.vision_model_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id  uuid NOT NULL REFERENCES public.vision_model_versions(id) ON DELETE CASCADE,
  algorithm         text NOT NULL,

  status            text NOT NULL DEFAULT 'queued',
  job_id            text,
  current_step      text,
  progress          numeric,
  public_message    text,
  private_logs      jsonb NOT NULL DEFAULT '[]'::jsonb,

  metrics           jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifact_path     text,
  threshold         numeric,

  error_message     text,

  started_at        timestamptz,
  completed_at      timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vmr_algorithm_chk CHECK (algorithm IN ('patchcore','efficient_ad')),
  CONSTRAINT vmr_status_chk CHECK (status IN (
    'queued','preparing','training','validating','completed','failed','cancelled'
  )),
  CONSTRAINT vmr_progress_chk  CHECK (progress  IS NULL OR (progress  >= 0 AND progress  <= 1)),
  CONSTRAINT vmr_threshold_chk CHECK (threshold IS NULL OR (threshold >= 0 AND threshold <= 1)),
  UNIQUE (model_version_id, algorithm)
);

CREATE INDEX vmr_version_idx ON public.vision_model_runs(model_version_id);
CREATE INDEX vmr_status_idx  ON public.vision_model_runs(status);

GRANT SELECT ON public.vision_model_runs TO authenticated;
GRANT ALL    ON public.vision_model_runs TO service_role;

ALTER TABLE public.vision_model_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vmr_admin_select"
  ON public.vision_model_runs FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'franqueadora')
  );

CREATE TRIGGER vmr_touch_updated_at
  BEFORE UPDATE ON public.vision_model_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 3) Recriar prepare_model_version com nova assinatura (retorna token).
DROP FUNCTION IF EXISTS public.prepare_model_version(uuid, text, bigint);

CREATE OR REPLACE FUNCTION public.prepare_model_version(
  p_dataset_id uuid,
  p_note text DEFAULT NULL,
  p_seed bigint DEFAULT NULL
)
RETURNS TABLE (
  version_id  uuid,
  snapshot_id uuid,
  version     text,
  run_token   text,
  run_token_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'franqueadora')) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_ds FROM public.vision_datasets WHERE id = p_dataset_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dataset_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  v_seed := COALESCE(p_seed, (floor(random() * 9223372036854775000))::bigint);

  SELECT COUNT(DISTINCT COALESCE(organization_id::text, '__null__'))
    INTO v_org_count
  FROM public.vision_curated_images
  WHERE dataset_id = p_dataset_id
    AND classification IN ('normal','anomalous')
    AND sha256 IS NOT NULL;

  IF v_org_count = 0 THEN
    RAISE EXCEPTION 'no_eligible_images'
      USING MESSAGE = 'Nenhuma imagem curada com hash e classificação válida.',
            ERRCODE = 'check_violation';
  END IF;
  IF v_org_count > 1 THEN
    RAISE EXCEPTION 'mixed_workspace_scope'
      USING MESSAGE = 'Imagens curadas pertencem a workspaces diferentes.',
            ERRCODE = 'check_violation';
  END IF;

  SELECT DISTINCT organization_id INTO v_org
  FROM public.vision_curated_images
  WHERE dataset_id = p_dataset_id
    AND classification IN ('normal','anomalous')
    AND sha256 IS NOT NULL
  LIMIT 1;

  SELECT COALESCE(MAX(
           CASE WHEN version ~ '^v[0-9]+$'
                THEN substring(version FROM 2)::int
                ELSE 0 END), 0) + 1
    INTO v_next_idx
  FROM public.vision_dataset_snapshots
  WHERE dataset_id = p_dataset_id;

  v_version_label := 'v' || v_next_idx::text;
  v_snapshot_id   := gen_random_uuid();
  v_version_id    := gen_random_uuid();

  WITH src AS (
    SELECT DISTINCT ON (ci.sha256)
      ci.id, ci.classification, ci.sha256, ci.source_storage_path,
      ci.response_id, ci.checklist_id, ci.evidence_id, ci.checklist_evidence_id,
      COALESCE(ci.response_id::text, 'img:' || ci.id::text) AS group_key
    FROM public.vision_curated_images ci
    WHERE ci.dataset_id = p_dataset_id
      AND ci.classification IN ('normal','anomalous')
      AND ci.sha256 IS NOT NULL
    ORDER BY ci.sha256, ci.id
  ),
  group_flags AS (
    SELECT group_key,
           bool_or(classification = 'anomalous') AS has_anom,
           (('x' || substr(md5(v_seed::text || ':' || group_key), 1, 8))::bit(32)::int
             & 2147483647) % 100 AS bucket
    FROM src GROUP BY group_key
  ),
  group_split AS (
    SELECT group_key,
           CASE WHEN has_anom
                THEN CASE WHEN bucket < 50 THEN 'validation' ELSE 'test' END
                ELSE CASE WHEN bucket < 70 THEN 'train'
                          WHEN bucket < 85 THEN 'validation'
                          ELSE 'test' END
           END AS split
    FROM group_flags
  ),
  ins AS (
    INSERT INTO public.vision_dataset_snapshot_images (
      snapshot_id, curated_image_id, classification, category, split,
      sha256, source_storage_path, group_key,
      response_id, checklist_id, evidence_id, checklist_evidence_id
    )
    SELECT v_snapshot_id, s.id, s.classification, s.classification, gs.split,
           s.sha256, s.source_storage_path, s.group_key,
           s.response_id, s.checklist_id, s.evidence_id, s.checklist_evidence_id
    FROM src s JOIN group_split gs USING (group_key)
    RETURNING split, category
  )
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE category='normal'),
         COUNT(*) FILTER (WHERE category='anomalous'),
         COUNT(*) FILTER (WHERE split='train'      AND category='normal'),
         COUNT(*) FILTER (WHERE split='validation' AND category='normal'),
         COUNT(*) FILTER (WHERE split='validation' AND category='anomalous'),
         COUNT(*) FILTER (WHERE split='test'       AND category='normal'),
         COUNT(*) FILTER (WHERE split='test'       AND category='anomalous')
    INTO v_total, v_normal, v_anom, v_tn, v_vn, v_va, v_tsn, v_tsa
  FROM ins;

  IF COALESCE(v_total, 0) = 0 THEN
    RAISE EXCEPTION 'no_eligible_images'
      USING MESSAGE = 'Nenhuma imagem elegível após deduplicação.',
            ERRCODE = 'check_violation';
  END IF;
  IF v_tn = 0 THEN
    RAISE EXCEPTION 'insufficient_training_images'
      USING MESSAGE = 'Nenhuma imagem correta caiu no split de treino após a divisão.',
            ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO v_ignored
  FROM public.vision_curated_images
  WHERE dataset_id = p_dataset_id AND classification = 'ignored';

  INSERT INTO public.vision_dataset_snapshots (
    id, dataset_id, organization_id, version, seed, note,
    image_count, normal_count, anomalous_count, ignored_count,
    train_normal_count, validation_normal_count, validation_anomalous_count,
    test_normal_count, test_anomalous_count, created_by
  ) VALUES (
    v_snapshot_id, p_dataset_id, v_org, v_version_label, v_seed, NULLIF(btrim(p_note), ''),
    v_total, v_normal, v_anom, v_ignored,
    v_tn, v_vn, v_va, v_tsn, v_tsa, v_caller
  );

  v_token      := encode(public.gen_random_bytes(32), 'hex');
  v_token_hash := encode(public.digest(v_token, 'sha256'), 'hex');
  v_token_exp  := now() + interval '48 hours';

  INSERT INTO public.vision_model_versions (
    id, dataset_id, snapshot_id, organization_id, version, status,
    current_step, public_message, note, initiated_by,
    run_token_hash, run_token_created_at, run_token_expires_at
  ) VALUES (
    v_version_id, p_dataset_id, v_snapshot_id, v_org, v_version_label, 'preparing_dataset',
    'Preparando imagens',
    'Snapshot do dataset criado; aguardando execução do treino.',
    NULLIF(btrim(p_note), ''),
    v_caller,
    v_token_hash, now(), v_token_exp
  );

  INSERT INTO public.vision_model_runs (model_version_id, algorithm, status, current_step, public_message)
  VALUES
    (v_version_id, 'patchcore',    'queued', 'Aguardando início', 'Na fila'),
    (v_version_id, 'efficient_ad', 'queued', 'Aguardando início', 'Na fila');

  RETURN QUERY SELECT v_version_id, v_snapshot_id, v_version_label, v_token, v_token_exp;
END;
$$;

REVOKE ALL    ON FUNCTION public.prepare_model_version(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_model_version(uuid, text, bigint) TO authenticated;


-- 4) Helper para resolver token do serviço (chamado apenas pelo service_role nas rotas).
CREATE OR REPLACE FUNCTION public.resolve_model_version_run_token(p_token text)
RETURNS TABLE (version_id uuid, dataset_id uuid, organization_id uuid, snapshot_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash text;
BEGIN
  IF p_token IS NULL OR length(btrim(p_token)) < 16 THEN
    RETURN;
  END IF;
  v_hash := encode(public.digest(btrim(p_token), 'sha256'), 'hex');

  RETURN QUERY
  SELECT mv.id, mv.dataset_id, mv.organization_id, mv.snapshot_id
  FROM public.vision_model_versions mv
  WHERE mv.run_token_hash = v_hash
    AND mv.run_token_expires_at IS NOT NULL
    AND mv.run_token_expires_at > now()
    AND mv.status IN ('preparing_dataset','queued','training','validating')
  LIMIT 1;
END;
$$;

REVOKE ALL     ON FUNCTION public.resolve_model_version_run_token(text) FROM PUBLIC;
GRANT EXECUTE  ON FUNCTION public.resolve_model_version_run_token(text) TO service_role;
