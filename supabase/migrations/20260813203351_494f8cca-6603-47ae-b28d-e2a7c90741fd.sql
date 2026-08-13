-- Camera AI Runtime V1
-- Timestamp: 2026-08-13 20:40:00

-- A. Table public.camera_ai_attempts
CREATE TABLE IF NOT EXISTS public.camera_ai_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id uuid NOT NULL REFERENCES public.checklist_responses(id) ON DELETE CASCADE,
    block_id text NOT NULL,
    idempotency_key uuid NOT NULL,
    status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
    decision text CHECK (decision IN ('approved', 'retake', 'not_observable', 'technical_failure')),
    code text,
    evidence text,
    model text,
    duration_ms integer CHECK (duration_ms >= 0),
    retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    UNIQUE(response_id, block_id, idempotency_key)
);

-- Enable RLS
ALTER TABLE public.camera_ai_attempts ENABLE ROW LEVEL SECURITY;

-- Revoke all from public roles
REVOKE ALL ON public.camera_ai_attempts FROM public;
REVOKE ALL ON public.camera_ai_attempts FROM anon;
REVOKE ALL ON public.camera_ai_attempts FROM authenticated;

-- Grant only to service_role
GRANT ALL ON public.camera_ai_attempts TO service_role;

-- Indices
CREATE INDEX IF NOT EXISTS idx_camera_ai_attempts_response_block ON public.camera_ai_attempts(response_id, block_id);

-- B. RPC resolve_public_response(text)
CREATE OR REPLACE FUNCTION public.resolve_public_response(p_token text)
RETURNS TABLE (
    response_id uuid,
    checklist_id uuid,
    workspace_id uuid,
    status text,
    published_content jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_token_hash text;
BEGIN
    IF p_token IS NULL OR btrim(p_token) = '' THEN
        RETURN;
    END IF;

    v_token_hash := encode(extensions.digest(btrim(p_token), 'sha256'), 'hex');

    RETURN QUERY
    SELECT 
        r.id as response_id,
        r.checklist_id,
        r.workspace_id,
        r.status,
        c.published_content
    FROM public.checklist_responses r
    JOIN public.checklists c ON c.id = r.checklist_id
    WHERE r.response_token_hash = v_token_hash
      AND r.expires_at > now()
      AND r.status = 'in_progress'
      AND c.is_published = true;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_public_response(text) FROM public;
REVOKE ALL ON FUNCTION public.resolve_public_response(text) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_public_response(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_public_response(text) TO service_role;

-- C. RPC claim_camera_ai_attempt(uuid, text, uuid)
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
        RETURN QUERY SELECT 'acquired'::text, v_id, NULL::text, NULL::text, NULL::text, 0;
        RETURN;
    END IF;

    -- Conflict resolution
    SELECT id, status, decision, code, evidence, retry_count
    INTO v_id, v_status, v_decision, v_code, v_evidence, v_retry
    FROM public.camera_ai_attempts
    WHERE response_id = p_response_id
      AND block_id = p_block_id
      AND idempotency_key = p_idempotency_key;

    RETURN QUERY SELECT v_status, v_id, v_decision, v_code, v_evidence, v_retry;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_camera_ai_attempt(uuid, text, uuid) FROM public;
REVOKE ALL ON FUNCTION public.claim_camera_ai_attempt(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_camera_ai_attempt(uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_camera_ai_attempt(uuid, text, uuid) TO service_role;
