
-- =============================================================
-- Fatia B1 — Fundação de dados do ciclo de versões do modelo
-- =============================================================

-- 1) SNAPSHOTS DE DATASET (imutáveis)
CREATE TABLE public.vision_dataset_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.vision_datasets(id) ON DELETE RESTRICT,
  organization_id uuid,
  version text NOT NULL,
  seed bigint NOT NULL,
  note text,

  image_count integer NOT NULL DEFAULT 0,
  normal_count integer NOT NULL DEFAULT 0,
  anomalous_count integer NOT NULL DEFAULT 0,
  ignored_count integer NOT NULL DEFAULT 0,

  train_normal_count integer NOT NULL DEFAULT 0,
  validation_normal_count integer NOT NULL DEFAULT 0,
  validation_anomalous_count integer NOT NULL DEFAULT 0,
  test_normal_count integer NOT NULL DEFAULT 0,
  test_anomalous_count integer NOT NULL DEFAULT 0,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (dataset_id, version)
);

CREATE INDEX vision_dataset_snapshots_dataset_idx
  ON public.vision_dataset_snapshots(dataset_id, created_at DESC);
CREATE INDEX vision_dataset_snapshots_org_idx
  ON public.vision_dataset_snapshots(organization_id)
  WHERE organization_id IS NOT NULL;

GRANT SELECT, INSERT ON public.vision_dataset_snapshots TO authenticated;
GRANT ALL ON public.vision_dataset_snapshots TO service_role;

ALTER TABLE public.vision_dataset_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vision_dataset_snapshots_admin_select"
  ON public.vision_dataset_snapshots FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'franqueadora')
  );

-- Não expomos INSERT/UPDATE/DELETE via API; tudo passa por RPC SECURITY DEFINER.


-- 2) IMAGENS DO SNAPSHOT
CREATE TABLE public.vision_dataset_snapshot_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.vision_dataset_snapshots(id) ON DELETE CASCADE,
  curated_image_id uuid NOT NULL REFERENCES public.vision_curated_images(id) ON DELETE RESTRICT,

  classification text NOT NULL,
  category text NOT NULL,
  split text NOT NULL,

  sha256 text NOT NULL,
  source_storage_path text NOT NULL,

  group_key text NOT NULL,
  response_id uuid,
  checklist_id uuid,
  evidence_id uuid,
  checklist_evidence_id uuid,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vdsi_classification_chk CHECK (classification IN ('normal','anomalous')),
  CONSTRAINT vdsi_category_chk       CHECK (category IN ('normal','anomalous')),
  CONSTRAINT vdsi_split_chk          CHECK (split IN ('train','validation','test')),
  -- Anômalas nunca entram no treino.
  CONSTRAINT vdsi_no_anom_in_train CHECK (NOT (split = 'train' AND category = 'anomalous')),
  -- classificação e categoria são espelhadas no snapshot (mantidas coerentes).
  CONSTRAINT vdsi_class_matches_category CHECK (classification = category),

  UNIQUE (snapshot_id, curated_image_id),
  UNIQUE (snapshot_id, sha256)
);

CREATE INDEX vdsi_snapshot_split_idx
  ON public.vision_dataset_snapshot_images(snapshot_id, split, category);
CREATE INDEX vdsi_group_idx
  ON public.vision_dataset_snapshot_images(snapshot_id, group_key);

GRANT SELECT ON public.vision_dataset_snapshot_images TO authenticated;
GRANT ALL ON public.vision_dataset_snapshot_images TO service_role;

ALTER TABLE public.vision_dataset_snapshot_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vdsi_admin_select"
  ON public.vision_dataset_snapshot_images FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'franqueadora')
  );


-- 3) VERSÕES DO MODELO
CREATE TABLE public.vision_model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.vision_datasets(id) ON DELETE RESTRICT,
  snapshot_id uuid NOT NULL REFERENCES public.vision_dataset_snapshots(id) ON DELETE RESTRICT,
  organization_id uuid,

  version text NOT NULL,
  algorithm text,
  status text NOT NULL DEFAULT 'preparing_dataset',

  job_id text,
  current_step text,
  progress numeric,
  public_message text,
  error_message text,
  private_logs jsonb NOT NULL DEFAULT '[]'::jsonb,

  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifact_path text,
  threshold numeric,
  input_width integer,
  input_height integer,

  activated_model_id uuid REFERENCES public.vision_anomaly_models(id) ON DELETE SET NULL,

  note text,
  rejection_reason text,

  initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  approved_at  timestamptz,
  activated_at timestamptz,
  rejected_at  timestamptz,
  retired_at   timestamptz,

  CONSTRAINT vmv_status_chk CHECK (status IN (
    'preparing_dataset','dataset_invalid','queued','training','validating',
    'awaiting_approval','active','rejected','failed','retired','revoked'
  )),
  CONSTRAINT vmv_algorithm_chk CHECK (
    algorithm IS NULL OR algorithm IN ('patchcore','efficient_ad')
  ),
  CONSTRAINT vmv_progress_chk CHECK (
    progress IS NULL OR (progress >= 0 AND progress <= 1)
  ),
  CONSTRAINT vmv_threshold_chk CHECK (
    threshold IS NULL OR (threshold >= 0 AND threshold <= 1)
  ),
  UNIQUE (dataset_id, version)
);

CREATE INDEX vmv_dataset_status_idx
  ON public.vision_model_versions(dataset_id, status, created_at DESC);
CREATE INDEX vmv_org_idx
  ON public.vision_model_versions(organization_id)
  WHERE organization_id IS NOT NULL;

GRANT SELECT ON public.vision_model_versions TO authenticated;
GRANT ALL ON public.vision_model_versions TO service_role;

ALTER TABLE public.vision_model_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vmv_admin_select"
  ON public.vision_model_versions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'franqueadora')
  );

CREATE TRIGGER vmv_touch_updated_at
  BEFORE UPDATE ON public.vision_model_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================
-- 4) RPC: prepare_model_version
-- =============================================================
CREATE OR REPLACE FUNCTION public.prepare_model_version(
  p_dataset_id uuid,
  p_note text DEFAULT NULL,
  p_seed bigint DEFAULT NULL
)
RETURNS TABLE (version_id uuid, snapshot_id uuid, version text)
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
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'franqueadora')) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Trava o padrão contra preparações concorrentes.
  SELECT * INTO v_ds FROM public.vision_datasets WHERE id = p_dataset_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dataset_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  v_seed := COALESCE(p_seed, (floor(random() * 9223372036854775000))::bigint);

  -- Escopo organizacional: todas as imagens curadas usadas devem compartilhar org
  -- (ou todas serem NULL). Impede que uma versão misture workspaces.
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

  -- Numeração incremental por padrão.
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

  -- Monta o snapshot em uma única transação atômica.
  WITH src AS (
    SELECT DISTINCT ON (ci.sha256)
      ci.id,
      ci.classification,
      ci.sha256,
      ci.source_storage_path,
      ci.response_id,
      ci.checklist_id,
      ci.evidence_id,
      ci.checklist_evidence_id,
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
           -- bucket determinístico por (seed, grupo) em [0,99]
           (
             ('x' || substr(md5(v_seed::text || ':' || group_key), 1, 8))::bit(32)::int
             & 2147483647
           ) % 100 AS bucket
    FROM src
    GROUP BY group_key
  ),
  group_split AS (
    SELECT group_key,
           CASE
             WHEN has_anom THEN
               CASE WHEN bucket < 50 THEN 'validation' ELSE 'test' END
             ELSE
               CASE WHEN bucket < 70 THEN 'train'
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
    SELECT
      v_snapshot_id,
      s.id,
      s.classification,
      s.classification AS category,
      gs.split,
      s.sha256,
      s.source_storage_path,
      s.group_key,
      s.response_id,
      s.checklist_id,
      s.evidence_id,
      s.checklist_evidence_id
    FROM src s
    JOIN group_split gs USING (group_key)
    RETURNING split, category
  )
  SELECT
    COUNT(*)                                                  ,
    COUNT(*) FILTER (WHERE category = 'normal')               ,
    COUNT(*) FILTER (WHERE category = 'anomalous')            ,
    COUNT(*) FILTER (WHERE split = 'train'      AND category = 'normal'),
    COUNT(*) FILTER (WHERE split = 'validation' AND category = 'normal'),
    COUNT(*) FILTER (WHERE split = 'validation' AND category = 'anomalous'),
    COUNT(*) FILTER (WHERE split = 'test'       AND category = 'normal'),
    COUNT(*) FILTER (WHERE split = 'test'       AND category = 'anomalous')
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

  -- Ignoradas (para reporte, não entram no snapshot).
  SELECT COUNT(*) INTO v_ignored
  FROM public.vision_curated_images
  WHERE dataset_id = p_dataset_id AND classification = 'ignored';

  INSERT INTO public.vision_dataset_snapshots (
    id, dataset_id, organization_id, version, seed, note,
    image_count, normal_count, anomalous_count, ignored_count,
    train_normal_count, validation_normal_count, validation_anomalous_count,
    test_normal_count, test_anomalous_count,
    created_by
  ) VALUES (
    v_snapshot_id, p_dataset_id, v_org, v_version_label, v_seed, NULLIF(btrim(p_note), ''),
    v_total, v_normal, v_anom, v_ignored,
    v_tn, v_vn, v_va, v_tsn, v_tsa,
    v_caller
  );

  INSERT INTO public.vision_model_versions (
    id, dataset_id, snapshot_id, organization_id, version, status,
    current_step, public_message, note, initiated_by
  ) VALUES (
    v_version_id, p_dataset_id, v_snapshot_id, v_org, v_version_label, 'preparing_dataset',
    'Preparando imagens',
    'Snapshot do dataset criado; aguardando execução do treino.',
    NULLIF(btrim(p_note), ''),
    v_caller
  );

  RETURN QUERY SELECT v_version_id, v_snapshot_id, v_version_label;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_model_version(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_model_version(uuid, text, bigint) TO authenticated;
