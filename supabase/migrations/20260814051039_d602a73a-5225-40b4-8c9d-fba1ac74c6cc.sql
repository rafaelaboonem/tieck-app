BEGIN;

CREATE OR REPLACE FUNCTION public.claim_camera_ai_attempt(
  p_response_id uuid,
  p_block_id text,
  p_idempotency_key uuid
)
RETURNS TABLE (
  claim_status text,
  attempt_id uuid,
  existing_decision text,
  existing_code text,
  existing_evidence text,
  existing_evidence_id uuid,
  current_retry_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt_id uuid;
  v_status text;
  v_decision text;
  v_code text;
  v_evidence text;
  v_evidence_id uuid;
  v_retry_count integer;
BEGIN
  SELECT id, status, decision, code, evidence, evidence_id, retry_count
  INTO v_attempt_id, v_status, v_decision, v_code, v_evidence, v_evidence_id, v_retry_count
  FROM public.camera_ai_attempts
  WHERE response_id = p_response_id
    AND block_id = p_block_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_status = 'processing' THEN
      RETURN QUERY SELECT 'processing'::text, v_attempt_id, v_decision, v_code, v_evidence, v_evidence_id, v_retry_count;
      RETURN;
    END IF;

    IF v_status = 'completed' THEN
      RETURN QUERY SELECT 'completed'::text, v_attempt_id, v_decision, v_code, v_evidence, v_evidence_id, v_retry_count;
      RETURN;
    END IF;

    IF v_status = 'failed' THEN
      IF v_code = 'storage_failure' THEN
         RETURN QUERY SELECT 'failed'::text, v_attempt_id, v_decision, v_code, v_evidence, v_evidence_id, v_retry_count;
         RETURN;
      END IF;

      IF v_retry_count >= 10 THEN
         RETURN QUERY SELECT 'failed'::text, v_attempt_id, v_decision, v_code, v_evidence, v_evidence_id, v_retry_count;
         RETURN;
      END IF;

      UPDATE public.camera_ai_attempts
      SET status = 'processing',
          retry_count = retry_count + 1,
          updated_at = now()
      WHERE id = v_attempt_id;

      RETURN QUERY SELECT 'acquired'::text, v_attempt_id, v_decision, v_code, v_evidence, v_evidence_id, v_retry_count + 1;
      RETURN;
    END IF;
  ELSE
    INSERT INTO public.camera_ai_attempts (
      response_id, block_id, idempotency_key, status, retry_count
    )
    VALUES (
      p_response_id, p_block_id, p_idempotency_key, 'processing', 0
    )
    RETURNING id INTO v_attempt_id;

    RETURN QUERY SELECT 'acquired'::text, v_attempt_id, NULL::text, NULL::text, NULL::text, NULL::uuid, 0;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_camera_ai_evidence(
  p_response_id uuid,
  p_block_id text,
  p_idempotency_key uuid,
  p_evidence_id uuid
)
RETURNS TABLE (
  confirmed_evidence_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.camera_ai_attempts
  SET evidence_id = p_evidence_id,
      status = 'completed',
      decision = 'approved',
      code = 'verified',
      completed_at = COALESCE(completed_at, now()),
      updated_at = now()
  WHERE response_id = p_response_id
    AND block_id = p_block_id
    AND idempotency_key = p_idempotency_key
    AND (
      (status = 'completed' AND decision = 'approved' AND evidence_id IS NULL)
      OR
      (status = 'failed' AND code = 'storage_failure')
      OR
      (status = 'processing')
    );

  RETURN QUERY
  SELECT evidence_id
  FROM public.camera_ai_attempts
  WHERE response_id = p_response_id
    AND block_id = p_block_id
    AND idempotency_key = p_idempotency_key
    AND status = 'completed'
    AND decision = 'approved'
    AND code = 'verified'
    AND evidence_id IS NOT NULL;
END;
$$;

UPDATE public.camera_ai_attempts
SET status = 'completed',
    decision = 'approved',
    code = 'storage_pending',
    evidence_id = NULL,
    updated_at = now()
WHERE status = 'failed'
  AND code = 'storage_failure'
  AND (decision IS NULL OR decision = 'approved');

COMMIT;