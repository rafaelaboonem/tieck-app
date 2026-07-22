
-- =========================================================
-- 1. Enum de status da análise visual
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'checklist_evidence_analysis_status') THEN
    CREATE TYPE public.checklist_evidence_analysis_status AS ENUM (
      'pending',
      'processing',
      'normal',
      'anomalous',
      'manual_review',
      'failed'
    );
  END IF;
END$$;

-- =========================================================
-- 2. response_token em checklist_responses
--    (token opaco por resposta pública; sem ele o UUID não dá acesso)
-- =========================================================
ALTER TABLE public.checklist_responses
  ADD COLUMN IF NOT EXISTS response_token text;

CREATE OR REPLACE FUNCTION public.set_checklist_response_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.response_token IS NULL THEN
    -- 32 bytes de entropia, base64url sem padding
    NEW.response_token := replace(replace(replace(
      encode(gen_random_bytes(32), 'base64'),
      '+', '-'), '/', '_'), '=', '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_checklist_response_token ON public.checklist_responses;
CREATE TRIGGER trg_set_checklist_response_token
BEFORE INSERT ON public.checklist_responses
FOR EACH ROW EXECUTE FUNCTION public.set_checklist_response_token();

-- Popular tokens existentes
UPDATE public.checklist_responses
   SET response_token = replace(replace(replace(
         encode(gen_random_bytes(32), 'base64'),
         '+', '-'), '/', '_'), '=', '')
 WHERE response_token IS NULL;

ALTER TABLE public.checklist_responses
  ALTER COLUMN response_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_responses_token
  ON public.checklist_responses(response_token);

-- =========================================================
-- 3. checklist_evidences — 1 linha por foto enviada
-- =========================================================
CREATE TABLE IF NOT EXISTS public.checklist_evidences (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id         uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  response_id          uuid NOT NULL REFERENCES public.checklist_responses(id) ON DELETE CASCADE,
  block_id             text NOT NULL,
  storage_path         text NOT NULL,
  attempt_number       integer NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  previous_evidence_id uuid REFERENCES public.checklist_evidences(id) ON DELETE SET NULL,
  mime_type            text,
  size_bytes           integer,
  uploaded             boolean NOT NULL DEFAULT false,
  submitted_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, block_id, attempt_number),
  UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_checklist_evidences_response
  ON public.checklist_evidences(response_id, block_id);
CREATE INDEX IF NOT EXISTS idx_checklist_evidences_checklist
  ON public.checklist_evidences(checklist_id);

GRANT SELECT ON public.checklist_evidences TO authenticated;
GRANT ALL ON public.checklist_evidences TO service_role;
-- anon NÃO recebe grant: acesso público é apenas via Edge Function com service_role

ALTER TABLE public.checklist_evidences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_evidences_owner_select"
  ON public.checklist_evidences FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.checklists c
     WHERE c.id = checklist_evidences.checklist_id
       AND c.user_id = auth.uid()
  ));

CREATE POLICY "checklist_evidences_owner_delete"
  ON public.checklist_evidences FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.checklists c
     WHERE c.id = checklist_evidences.checklist_id
       AND c.user_id = auth.uid()
  ));

CREATE TRIGGER trg_checklist_evidences_updated_at
BEFORE UPDATE ON public.checklist_evidences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 4. checklist_evidence_analyses — histórico de análises por evidência
-- =========================================================
CREATE TABLE IF NOT EXISTS public.checklist_evidence_analyses (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id               uuid NOT NULL REFERENCES public.checklist_evidences(id) ON DELETE CASCADE,
  checklist_id              uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  response_id               uuid NOT NULL REFERENCES public.checklist_responses(id) ON DELETE CASCADE,
  block_id                  text NOT NULL,
  analysis_token            text NOT NULL,
  published_content_hash    text NOT NULL,
  provider                  text NOT NULL,
  model_id                  text NOT NULL,
  model_version             text,
  threshold                 numeric(6,4),
  status                    public.checklist_evidence_analysis_status NOT NULL DEFAULT 'pending',
  anomaly_score             numeric(6,4),
  confidence                numeric(6,4),
  heatmap_path              text,
  regions                   jsonb,
  inference_ms              integer,
  raw_response              jsonb,
  error_code                text,
  error_message             text,
  processing_started_at     timestamptz,
  processing_finished_at    timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_analyses_token
  ON public.checklist_evidence_analyses(analysis_token);
CREATE INDEX IF NOT EXISTS idx_checklist_analyses_evidence
  ON public.checklist_evidence_analyses(evidence_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checklist_analyses_status
  ON public.checklist_evidence_analyses(status);

GRANT SELECT ON public.checklist_evidence_analyses TO authenticated;
GRANT ALL ON public.checklist_evidence_analyses TO service_role;
-- anon: sem grant. Consulta pública só via Edge Function pelo analysis_token.

ALTER TABLE public.checklist_evidence_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_analyses_owner_select"
  ON public.checklist_evidence_analyses FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.checklists c
     WHERE c.id = checklist_evidence_analyses.checklist_id
       AND c.user_id = auth.uid()
  ));

-- Gerar analysis_token no insert quando ausente
CREATE OR REPLACE FUNCTION public.set_checklist_analysis_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.analysis_token IS NULL OR NEW.analysis_token = '' THEN
    NEW.analysis_token := replace(replace(replace(
      encode(gen_random_bytes(32), 'base64'),
      '+', '-'), '/', '_'), '=', '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_checklist_analysis_token ON public.checklist_evidence_analyses;
CREATE TRIGGER trg_set_checklist_analysis_token
BEFORE INSERT ON public.checklist_evidence_analyses
FOR EACH ROW EXECUTE FUNCTION public.set_checklist_analysis_token();

CREATE TRIGGER trg_checklist_analyses_updated_at
BEFORE UPDATE ON public.checklist_evidence_analyses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 5. Claim atômico pending → processing (idempotência)
-- =========================================================
CREATE OR REPLACE FUNCTION public.claim_checklist_analysis(p_analysis_id uuid)
RETURNS TABLE(claimed boolean, current_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_status public.checklist_evidence_analysis_status;
  v_current    public.checklist_evidence_analysis_status;
BEGIN
  UPDATE public.checklist_evidence_analyses
     SET status = 'processing',
         processing_started_at = now()
   WHERE id = p_analysis_id
     AND status = 'pending'
  RETURNING status INTO v_new_status;

  IF v_new_status IS NOT NULL THEN
    RETURN QUERY SELECT true, v_new_status::text;
    RETURN;
  END IF;

  SELECT status INTO v_current FROM public.checklist_evidence_analyses WHERE id = p_analysis_id;
  RETURN QUERY SELECT false, v_current::text;
END;
$$;

-- =========================================================
-- 6. Storage policies — bucket privado checklist-evidences
-- =========================================================
-- Somente o dono do checklist consegue baixar/listar/deletar objetos.
-- Uploads públicos vão exclusivamente via signed upload URLs criadas pela Edge Function.
CREATE POLICY "checklist_evidences_owner_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'checklist-evidences'
    AND EXISTS (
      SELECT 1
        FROM public.checklists c
       WHERE c.user_id = auth.uid()
         AND storage.objects.name LIKE (c.id::text || '/%')
    )
  );

CREATE POLICY "checklist_evidences_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'checklist-evidences'
    AND EXISTS (
      SELECT 1
        FROM public.checklists c
       WHERE c.user_id = auth.uid()
         AND storage.objects.name LIKE (c.id::text || '/%')
    )
  );
