# Camera AI Hardening Plan (txqfdscdlltohpkkznwa)

Final verification and hardening of Camera AI to ensure production stability and deterministic state transitions.

## User Review Required
> [!IMPORTANT]
> - No OpenAI inferences will be executed.
> - No images will be sent.
> - This plan strictly hardens the database layer and confirms the deployment baseline.

- Confirmed: Migration `20260814051039` is already applied to the database.

## Proposed Changes

### Database Layer (Hardening)
- Create a new incremental migration to harden `attach_camera_ai_evidence`.
- Remove `(status = 'processing')` from the update conditions.
- Strict conditions for `attach_camera_ai_evidence`:
    - **Replay**: `status = 'completed' AND decision = 'approved' AND evidence_id IS NULL AND code = 'storage_pending'`.
    - **Legacy Recovery**: `status = 'failed' AND code = 'storage_failure' AND evidence_id IS NULL`.
- Maintain security properties: `SECURITY DEFINER`, `search_path`, and restricted permissions (`service_role` only).

### Verification (Read-Only)
- Verify migration history: `045017`, `045822`, `051039`, and the new one.
- Inspect function definitions for `claim_camera_ai_attempt` and `attach_camera_ai_evidence` to ensure they match the required logic.
- Verify that `claim_camera_ai_attempt` correctly handles `failed/storage_failure` as a replay (returning `failed` without acquisition).
- Run `tsc`, build, and existing Camera AI tests to ensure no regressions.

## Technical Details

### New Migration (Incremental)
```sql
-- Harden attach_camera_ai_evidence
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
      -- A. Replay normal
      (status = 'completed' AND decision = 'approved' AND evidence_id IS NULL AND code = 'storage_pending')
      OR
      -- B. Recuperação legada
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

REVOKE ALL ON FUNCTION public.attach_camera_ai_evidence(uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_camera_ai_evidence(uuid, text, uuid, uuid) TO service_role;
```

