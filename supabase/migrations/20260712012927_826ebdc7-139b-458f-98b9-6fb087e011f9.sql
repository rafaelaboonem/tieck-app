
-- =========================================================
-- 1. Hash do analysis_token (nunca armazenar bruto)
-- =========================================================
-- Remove trigger que gerava token bruto no banco.
DROP TRIGGER IF EXISTS trg_set_checklist_analysis_token ON public.checklist_evidence_analyses;
DROP FUNCTION IF EXISTS public.set_checklist_analysis_token();

-- Renomeia coluna para deixar explícito que armazenamos o hash.
ALTER TABLE public.checklist_evidence_analyses
  RENAME COLUMN analysis_token TO analysis_token_hash;

-- Índice único já existia sobre a coluna; renomear para clareza.
ALTER INDEX IF EXISTS idx_checklist_analyses_token
  RENAME TO idx_checklist_analyses_token_hash;

-- =========================================================
-- 2. run_number para idempotência de execução da análise
-- =========================================================
ALTER TABLE public.checklist_evidence_analyses
  ADD COLUMN IF NOT EXISTS run_number integer NOT NULL DEFAULT 1
  CHECK (run_number >= 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_checklist_analyses_evidence_run
  ON public.checklist_evidence_analyses(evidence_id, run_number);

-- =========================================================
-- 3. RPC atômica para criar a próxima tentativa de foto
-- =========================================================
CREATE OR REPLACE FUNCTION public.create_checklist_evidence_attempt(
  p_checklist_id uuid,
  p_response_id uuid,
  p_block_id text,
  p_mime_type text,
  p_size_bytes integer,
  p_storage_path text,
  p_evidence_id uuid,
  p_max_attempts integer DEFAULT 10
)
RETURNS TABLE(
  evidence_id uuid,
  attempt_number integer,
  previous_evidence_id uuid,
  storage_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock_key bigint;
  v_next integer;
  v_prev uuid;
BEGIN
  -- Lock consultivo por (response, block) — serializa start-upload concorrentes.
  v_lock_key := ('x' || substr(md5(p_response_id::text || ':' || p_block_id), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(ce.attempt_number), 0) + 1,
         (SELECT ce2.id FROM public.checklist_evidences ce2
           WHERE ce2.response_id = p_response_id AND ce2.block_id = p_block_id
           ORDER BY ce2.attempt_number DESC LIMIT 1)
    INTO v_next, v_prev
  FROM public.checklist_evidences ce
  WHERE ce.response_id = p_response_id AND ce.block_id = p_block_id;

  IF v_next > p_max_attempts THEN
    RAISE EXCEPTION 'attempt_limit_reached' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.checklist_evidences (
    id, checklist_id, response_id, block_id,
    storage_path, attempt_number, previous_evidence_id,
    mime_type, size_bytes, uploaded
  ) VALUES (
    p_evidence_id, p_checklist_id, p_response_id, p_block_id,
    p_storage_path, v_next, v_prev,
    p_mime_type, p_size_bytes, false
  );

  RETURN QUERY SELECT p_evidence_id, v_next, v_prev, p_storage_path;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_checklist_evidence_attempt(uuid,uuid,text,text,integer,text,uuid,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_checklist_evidence_attempt(uuid,uuid,text,text,integer,text,uuid,integer)
  TO service_role;

-- =========================================================
-- 4. Rate limiting por janela
-- =========================================================
CREATE TABLE IF NOT EXISTS public.public_rate_limits (
  key_hash      text        NOT NULL,
  action        text        NOT NULL,
  window_start  timestamptz NOT NULL,
  hits          integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (key_hash, action, window_start)
);

ALTER TABLE public.public_rate_limits ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.public_rate_limits TO service_role;
-- anon/authenticated: sem grant. Uso exclusivo pela Edge Function.

CREATE INDEX IF NOT EXISTS idx_public_rate_limits_window
  ON public.public_rate_limits(window_start);

CREATE OR REPLACE FUNCTION public.hit_public_rate_limit(
  p_key_hash text,
  p_action text,
  p_window_seconds integer,
  p_limit integer
) RETURNS TABLE(allowed boolean, current_hits integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window timestamptz;
  v_hits integer;
BEGIN
  v_window := to_timestamp(
    (floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)::bigint
  );

  INSERT INTO public.public_rate_limits (key_hash, action, window_start, hits)
  VALUES (p_key_hash, p_action, v_window, 1)
  ON CONFLICT (key_hash, action, window_start)
    DO UPDATE SET hits = public_rate_limits.hits + 1
  RETURNING hits INTO v_hits;

  -- Limpeza best-effort de janelas antigas (>24h).
  DELETE FROM public.public_rate_limits
   WHERE window_start < now() - interval '24 hours';

  RETURN QUERY SELECT (v_hits <= p_limit) AS allowed, v_hits;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hit_public_rate_limit(text,text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hit_public_rate_limit(text,text,integer,integer)
  TO service_role;
