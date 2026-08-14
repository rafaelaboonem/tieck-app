BEGIN;

-- 1. Drop old function to allow changing return type
DROP FUNCTION IF EXISTS public.claim_camera_ai_attempt(uuid, text, uuid);

-- 2. Recreate claim_camera_ai_attempt with correct schema
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

-- 3. Create attach_camera_ai_evidence RPC
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
DECLARE
    v_final_id uuid;
BEGIN
    -- Try to update ONLY if it's approved and pending evidence
    UPDATE public.camera_ai_attempts
    SET evidence_id = p_evidence_id,
        code = 'verified',
        updated_at = now()
    WHERE response_id = p_response_id
      AND block_id = p_block_id
      AND idempotency_key = p_idempotency_key
      AND status = 'completed'
      AND decision = 'approved'
      AND evidence_id IS NULL
    RETURNING evidence_id INTO v_final_id;

    IF v_final_id IS NOT NULL THEN
        RETURN QUERY SELECT v_final_id;
        RETURN;
    END IF;

    -- If no update (concurrently updated), return the existing one
    SELECT evidence_id INTO v_final_id
    FROM public.camera_ai_attempts
    WHERE response_id = p_response_id
      AND block_id = p_block_id
      AND idempotency_key = p_idempotency_key;

    RETURN QUERY SELECT v_final_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_camera_ai_evidence(uuid, text, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.attach_camera_ai_evidence(uuid, text, uuid, uuid) TO service_role;

-- 4. Corrective Backfill: Handle records with NULL decision (like s88u9p)
UPDATE public.camera_ai_attempts
SET status = 'completed',
    decision = 'approved',
    code = 'storage_pending',
    evidence_id = NULL,
    updated_at = now()
WHERE status = 'failed'
  AND code = 'storage_failure'
  AND (decision IS NULL OR decision = 'approved');

-- 5. Schema Refresh
NOTIFY pgrst, 'reload schema';

COMMIT;