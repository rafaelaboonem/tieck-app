# Plan - Camera AI Persistence Recovery Fix

Refactor the Camera AI persistence flow to support state preservation and storage-only retries.

## User Review Required

> [!IMPORTANT]
> This plan modifies the atomic locking mechanism for Camera AI attempts and updates the public RPC. It will convert existing `failed/storage_failure` attempts to `completed/storage_pending` to enable user recovery without new AI costs.

- The `claim_camera_ai_attempt` RPC signature will change to include existing decision data.
- The `camera_ai_attempts` table will receive a new `storage_pending` code.

## Proposed Changes

### Database & Migrations
- **RPC `claim_camera_ai_attempt`**: Recreate to return `claim_status`, `attempt_id`, `existing_decision`, `existing_code`, `existing_evidence`, `existing_evidence_id`, and `current_retry_count`.
- **Data Recovery Migration**: Convert `status = 'failed'` and `code = 'storage_failure'` to `status = 'completed'`, `decision = 'approved'`, `code = 'storage_pending'`, `evidence_id = NULL`.
- **Schema Refresh**: Notify PostgREST to reload the schema.

### Backend (Server-side)
- **`verify-handler.ts`**:
    - Add `storage_pending` to valid codes.
    - Update `VerifyDependencies` and `ClaimResult` types.
    - Implement "Storage Replay" logic: if `status=completed` and `decision=approved` but `evidence_id` is missing, skip AI and run only `persistEvidence`.
    - Update `persistEvidence` to handle `ArrayBuffer` correctly for the runtime and ensure `origin_bucket` is recorded.
- **`api/camera-ai/verify.ts`**:
    - Update RPC calls to match the new signature.
    - Fix `persistEvidence` buffer conversion to `Uint8Array`.

### Frontend
- **`PublicCameraBlock.tsx`**:
    - Update `VerificationState` and `FailureReason` to include `storage_failure`.
    - Modify the state machine to keep the preview visible during `storage_failure`.
    - Update "Tentar salvar novamente" to reuse the same photo and idempotency key while showing "Salvando foto...".
    - Disable the checklist "Submit" button if a mandatory camera block is in `storage_failure` or missing `evidenceId`.

## Verification Plan

### Automated Tests
- **Runtime Tests**: Verify `storage_pending` flow (zero OpenAI calls on retry).
- **RPC Tests**: Validate the new `claim_camera_ai_attempt` return structure.
- **UI Tests**: Verify "Salvando foto..." label and button states during `storage_failure`.

### Manual Verification
- Inspect support code `s88u9p` logs (via internal simulation if needed) to confirm the exact storage failure cause.
- Confirm `persistEvidence` success with `Uint8Array` conversion.
