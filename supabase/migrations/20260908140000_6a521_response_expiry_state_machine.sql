-- =============================================================
-- Evidence 6A.5.2.1 — Correct response expiry state machine
--
-- `checklist_responses.expires_at` now has exactly two meanings,
-- depending on `status`:
--
--   status = in_progress → SESSION TTL
--       (created_at + 24h set by create_public_response — unchanged)
--
--   status = submitted   → RETENTION deadline
--       dataRetention = true  → submitted_at + retentionDays
--       dataRetention = false → NULL
--
-- A submitted response NEVER keeps the 24h session TTL.
-- This migration NEVER deletes rows and NEVER removes storage objects:
-- removal continues to be the exclusive responsibility of
-- runEvidenceRetentionCleanup → deleteResponseWithEvidence (6A.5.2/6A.5.1).
-- =============================================================

-- -------------------------------------------------------------
-- 1) finalize_public_response: set the final expiry at submission
--    using the SAME authoritative instant as submitted_at.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_public_response(
  p_response_token text,
  p_checklist_id uuid,
  p_answers jsonb
)
RETURNS TABLE (
  response_id uuid,
  status text,
  submitted_at timestamptz,
  already_submitted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token_hash text;
  v_response_id uuid;
  v_current_status text;
  v_evidence_id uuid;
  v_block_id text;
  v_submitted_at timestamptz := now();
  v_retention_enabled boolean;
  v_retention_days int;
  v_expires_at timestamptz;
BEGIN
  -- 1. Calcular hash do token
  v_token_hash := encode(digest(p_response_token, 'sha256'), 'hex');

  -- 2. Localizar a resposta
  SELECT cr.id, cr.status INTO v_response_id, v_current_status
  FROM public.checklist_responses cr
  WHERE cr.response_token_hash = v_token_hash
    AND cr.checklist_id = p_checklist_id;

  IF v_response_id IS NULL THEN
    RAISE EXCEPTION 'invalid_response_token' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validar se o checklist continua publicado
  IF NOT EXISTS (SELECT 1 FROM public.checklists WHERE id = p_checklist_id AND is_published = true) THEN
    RAISE EXCEPTION 'checklist_not_published' USING ERRCODE = 'P0002';
  END IF;

  -- 4. Idempotência
  IF v_current_status = 'submitted' THEN
    SELECT cr.submitted_at INTO v_submitted_at
    FROM public.checklist_responses cr
    WHERE cr.id = v_response_id;

    RETURN QUERY SELECT v_response_id, 'submitted'::text, v_submitted_at, true;
    RETURN;
  END IF;

  -- 5. Validação de evidências Camera AI nas respostas
  FOR v_block_id, v_evidence_id IN
    SELECT key, (value->>'evidenceId')::uuid
    FROM jsonb_each(p_answers)
    WHERE value ? 'evidenceId'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.checklist_evidences ce
      WHERE ce.id = v_evidence_id
        AND ce.response_id = v_response_id
        AND ce.checklist_id = p_checklist_id
        AND ce.block_id = v_block_id
        AND ce.uploaded = true
    ) THEN
      RAISE EXCEPTION 'invalid_evidence_id' USING ERRCODE = 'P0003';
    END IF;
  END LOOP;

  -- 6. Resolver o prazo final de retenção (regra 6A.5.2.1):
  --    submitted + dataRetention ON  → submitted_at + retentionDays
  --    submitted + dataRetention OFF → NULL (nunca o TTL de sessão de 24h)
  SELECT
    COALESCE((c.settings->>'dataRetention')::boolean, false),
    COALESCE((c.settings->>'retentionDays')::int, 3)
  INTO v_retention_enabled, v_retention_days
  FROM public.checklists c
  WHERE c.id = p_checklist_id;

  IF v_retention_enabled THEN
    v_expires_at := v_submitted_at + (v_retention_days || ' days')::interval;
  ELSE
    v_expires_at := NULL;
  END IF;

  -- 7. Finalizar resposta usando o MESMO instante para submitted_at e expiry
  UPDATE public.checklist_responses
  SET
    answers = p_answers,
    status = 'submitted',
    submitted_at = v_submitted_at,
    expires_at = v_expires_at
  WHERE id = v_response_id
  RETURNING checklist_responses.submitted_at INTO v_submitted_at;

  RETURN QUERY SELECT v_response_id, 'submitted'::text, v_submitted_at, false;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_public_response(text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_public_response(text, uuid, jsonb) TO anon, authenticated, service_role;

-- -------------------------------------------------------------
-- 2) update_checklist_retention: modify ONLY submitted responses.
--    Sessões in_progress preservam o SESSION TTL intacto
--    (retenção ON não pode zerar o TTL de sessão via submitted_at NULL).
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_checklist_retention(
  p_checklist_id UUID,
  p_retention_days INT,
  p_is_enabled BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update checklist settings
  UPDATE public.checklists
  SET settings = jsonb_set(
    jsonb_set(COALESCE(settings, '{}'::jsonb), '{retentionDays}', to_jsonb(p_retention_days)),
    '{dataRetention}', to_jsonb(p_is_enabled)
  )
  WHERE id = p_checklist_id;

  -- Update responses — SOMENTE submetidas.
  IF p_is_enabled THEN
    UPDATE public.checklist_responses
    SET expires_at = submitted_at + (p_retention_days || ' days')::interval
    WHERE checklist_id = p_checklist_id
      AND status = 'submitted';
  ELSE
    UPDATE public.checklist_responses
    SET expires_at = NULL
    WHERE checklist_id = p_checklist_id
      AND status = 'submitted';
  END IF;
END;
$$;

-- -------------------------------------------------------------
-- 3) Backfill das responses submitted existentes.
--    Corrige SOMENTE expires_at — nunca exclui rows, nunca toca
--    em in_progress, nunca inventa submitted_at.
-- -------------------------------------------------------------
DO $$
DECLARE
  v_inconsistent bigint;
  v_updated bigint;
BEGIN
  -- Fail-safe: submitted com submitted_at NULL não recebe timestamp
  -- inventado (evita exclusão prematura pelo cleaner).
  SELECT count(*) INTO v_inconsistent
    FROM public.checklist_responses
   WHERE status = 'submitted' AND submitted_at IS NULL;

  IF v_inconsistent > 0 THEN
    RAISE WARNING '6A.5.2.1: % submitted response(s) sem submitted_at — preservadas sem expiry de retenção', v_inconsistent;
  END IF;

  WITH updated AS (
    UPDATE public.checklist_responses r
    SET expires_at =
      CASE
        WHEN COALESCE((c.settings->>'dataRetention')::boolean, false) = true
          THEN r.submitted_at + (COALESCE((c.settings->>'retentionDays')::int, 3) || ' days')::interval
        ELSE NULL
      END
    FROM public.checklists c
    WHERE r.checklist_id = c.id
      AND r.status = 'submitted'
      AND r.submitted_at IS NOT NULL
    RETURNING r.id
  )
  SELECT count(*) INTO v_updated FROM updated;

  RAISE NOTICE '6A.5.2.1 backfill: % submitted response(s) corrigida(s)', v_updated;
END $$;

-- -------------------------------------------------------------
-- 4) Unschedule idempotente do legacy pg_cron job
--    (incompatível com o lifecycle Storage-first da 6A.5.1/6A.5.2).
--    Não assume pg_cron instalado; não remove outros jobs;
--    não remove a extensão; nunca falha a migration.
-- -------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-checklist-responses') THEN
        PERFORM cron.unschedule('cleanup-expired-checklist-responses');
        RAISE NOTICE '6A.5.2.1: legacy cron job cleanup-expired-checklist-responses removido';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '6A.5.2.1: não foi possível remover legacy cron job (idempotente): %', SQLERRM;
    END;
  END IF;
END $$;