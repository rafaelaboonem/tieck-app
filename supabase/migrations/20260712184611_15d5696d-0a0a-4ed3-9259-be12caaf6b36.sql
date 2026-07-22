
-- Adiciona colunas de auditoria/origem para permitir migração segura das fotos legadas.
ALTER TABLE public.checklist_evidences
  ADD COLUMN IF NOT EXISTS source         text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS origin_bucket  text NOT NULL DEFAULT 'checklist-evidences',
  ADD COLUMN IF NOT EXISTS sha256         text,
  ADD COLUMN IF NOT EXISTS original_url   text;

ALTER TABLE public.checklist_evidences
  DROP CONSTRAINT IF EXISTS checklist_evidences_source_chk;
ALTER TABLE public.checklist_evidences
  ADD CONSTRAINT checklist_evidences_source_chk
  CHECK (source IN ('live','legacy_migrated','legacy_unmapped'));

-- Idempotência forte por (response, block, storage_path) para importação repetida.
CREATE UNIQUE INDEX IF NOT EXISTS uq_checklist_evidences_resp_block_path
  ON public.checklist_evidences (response_id, block_id, storage_path);

-- Rotina segura: importa fotos legadas (bucket público checklist-assets) para
-- o fluxo atual de curadoria, sem copiar arquivos e sem sobrescrever nada.
CREATE OR REPLACE FUNCTION public.import_legacy_checklist_photos()
RETURNS TABLE(found integer, migrated integer, unmapped integer, skipped integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_found integer := 0;
  v_migrated integer := 0;
  v_unmapped integer := 0;
  v_skipped integer := 0;
BEGIN
  IF v_caller IS NOT NULL
     AND NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'franqueadora')) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='insufficient_privilege';
  END IF;

  WITH src AS (
    SELECT
      r.id                                       AS response_id,
      r.checklist_id                             AS checklist_id,
      COALESCE(r.submitted_at, r.created_at)     AS submitted_at,
      c.blocks                                   AS blocks,
      kv.key                                     AS block_id,
      kv.value->>'url'                           AS url,
      kv.value->>'type'                          AS mime,
      -- Extrai o caminho relativo dentro do bucket checklist-assets.
      regexp_replace(
        split_part(kv.value->>'url', '?', 1),
        '^.*/checklist-assets/', ''
      )                                          AS storage_path
    FROM public.checklist_responses r
    JOIN public.checklists c ON c.id = r.checklist_id,
    LATERAL jsonb_each(r.answers) kv
    WHERE jsonb_typeof(kv.value) = 'object'
      AND (kv.value->>'url')  LIKE '%/checklist-assets/%'
      AND (kv.value->>'type') LIKE 'image/%'
  ),
  tagged AS (
    SELECT s.*,
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(s.blocks) b WHERE b->>'id' = s.block_id
      ) AS has_block
    FROM src s
    WHERE s.storage_path <> '' AND s.storage_path IS NOT NULL
  ),
  ins AS (
    INSERT INTO public.checklist_evidences(
      checklist_id, response_id, block_id, storage_path,
      attempt_number, uploaded, mime_type, submitted_at,
      source, origin_bucket, original_url
    )
    SELECT
      t.checklist_id, t.response_id, t.block_id, t.storage_path,
      1, true, t.mime, t.submitted_at,
      CASE WHEN t.has_block THEN 'legacy_migrated' ELSE 'legacy_unmapped' END,
      'checklist-assets', t.url
    FROM tagged t
    ON CONFLICT (response_id, block_id, storage_path) DO NOTHING
    RETURNING source
  )
  SELECT
    (SELECT count(*) FROM tagged)::int,
    (SELECT count(*) FROM ins)::int,
    (SELECT count(*) FROM tagged WHERE NOT has_block)::int,
    ((SELECT count(*) FROM tagged) - (SELECT count(*) FROM ins))::int
  INTO v_found, v_migrated, v_unmapped, v_skipped;

  RETURN QUERY SELECT v_found, v_migrated, v_unmapped, v_skipped;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_legacy_checklist_photos() TO authenticated, service_role;

-- Executa a importação inicial (idempotente).
SELECT * FROM public.import_legacy_checklist_photos();
