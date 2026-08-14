-- Harden attach_camera_ai_evidence incremental migration
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
      -- A. Replay normal: status completed, approved, no evidence, pending storage
      (status = 'completed' AND decision = 'approved' AND evidence_id IS NULL AND code = 'storage_pending')
      OR
      -- B. Legacy recovery: status failed, storage_failure, no evidence
      (status = 'failed' AND code = 'storage_failure' AND evidence_id IS NULL)
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

-- Restricted permissions
REVOKE ALL ON FUNCTION public.attach_camera_ai_evidence(uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_camera_ai_evidence(uuid, text, uuid, uuid) TO service_role;
