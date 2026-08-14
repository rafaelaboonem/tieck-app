# Camera AI Regression Fix Plan

Correct critical persistence bugs and ensure atomic state transitions in the Camera AI flow.

## Database Changes

- **Incremental Migration**: Create a new migration to update `claim_camera_ai_attempt` and `attach_camera_ai_evidence`.
  - `claim_camera_ai_attempt`: Prevent `acquired` status for `failed/storage_failure` records; return `failed` status to trigger replay mode in handler.
  - `attach_camera_ai_evidence`: Ensure it confirms attachment for both `storage_pending` (new approvals) and `failed/storage_failure` (legacy).
- **Backfill**: Update any `failed/storage_failure` records to `completed/approved/storage_pending` to align with the new state machine.

## Backend Changes

- **Refactor `verify-handler.ts`**:
  - Unify `markCompleted` calls: ensure each new attempt execution calls it exactly once.
  - Fix logic where a rejection (else branch) would be followed by a second call in the "Final Decision Record Confirmation" section.
  - Validate that `persisted` is only true if `markCompleted` or `attachEvidence` explicitly confirms the update.
- **Refactor `verify.ts` (API Route)**:
  - Implement a strict type guard for storage conflict (409) checks (no `any`).
  - Ensure `remove()` is only called if `createdThisRequest` is true.

## Testing Strategy

- **Stateful Mock Tests**: Create a test dependency where the second call to `markCompleted` throws or returns an error, proving only one call occurs.
- **Decision Path Coverage**: Add tests for `retake` and `not_observable` proving zero `persistEvidence` calls and exactly one `markCompleted` call.
- **Replay Validation**: Assert that `storage_pending` and `failed/storage_failure` replays do not call `analyzeImage` or `hitRateLimit`.
- **Integrity Checks**: Ensure `technical_failure` is returned if `markCompleted` fails to update any rows.

## Technical Details

- **Type Guard**: `isStorageConflict(error: unknown): error is { status: number } | { statusCode: number } | { message: string }`.
- **Atomic Flow**:
  1. Approved -> `persistEvidence` -> `markCompleted` (success or `storage_pending`).
  2. Rejected -> `markCompleted` (immediate finish).
  3. Replay -> `persistEvidence` -> `attachEvidence` (no AI).
