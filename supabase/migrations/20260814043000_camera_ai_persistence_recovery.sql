BEGIN;

-- 1. Redefine claim_camera_ai_attempt to return decision data and evidence_id
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
    v_id uuid;
    v_status text;
    v_decision text;
    v_code text;
    v_evidence text;
    v_evidence_id uuid;
    v_retry integer;
BEGIN
    -- Atomic claim attempt
    INSERT INTO public.camera_ai_attempts (
        response_id,
        block_id,
        idempotency_key,
        status
    )
    VALUES (
        p_response_id,
        p_block_id,
        p_idempotency_key,
        'processing'
    )
    ON CONFLICT (response_id, block_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
        RETURN QUERY SELECT 'acquired'::text, v_id, NULL::text, NULL::text, NULL::text, NULL::uuid, 0;
        RETURN;
    END IF;

    -- Conflict resolution
    SELECT id, status, decision, code, evidence, evidence_id, retry_count
    INTO v_id, v_status, v_decision, v_code, v_evidence, v_evidence_id, v_retry
    FROM public.camera_ai_attempts
    WHERE response_id = p_response_id
      AND block_id = p_block_id
      AND idempotency_key = p_idempotency_key;

    RETURN QUERY SELECT v_status, v_id, v_decision, v_code, v_evidence, v_evidence_id, v_retry;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_camera_ai_attempt(uuid, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_camera_ai_attempt(uuid, text, uuid) TO service_role;

-- 2. Data Recovery Migration: Convert failed storage_failure to storage_pending
-- We assume storage_failure implies approved decision based on previous implementation rules.
UPDATE public.camera_ai_attempts
SET status = 'completed',
    decision = 'approved',
    code = 'storage_pending',
    evidence_id = NULL,
    updated_at = now()
WHERE status = 'failed'
  AND code = 'storage_failure'
  AND decision = 'approved';

-- 3. Schema Refresh
NOTIFY pgrst, 'reload schema';

COMMIT;
