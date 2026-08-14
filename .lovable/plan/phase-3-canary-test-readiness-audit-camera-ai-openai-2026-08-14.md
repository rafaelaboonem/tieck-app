# Phase 3: Canary Test Readiness Audit (Camera AI OpenAI)

This plan covers the Phase 3 Readiness Audit for the Tieck project (`txqfdscdlltohpkkznwa`). It verifies that all infrastructure, security gates, and logic are prepared for a controlled canary test on a Preview deployment without enabling AI in Production.

## Phase 3 Readiness Checklist

### 1. Environment & Config Isolation
- [x] `CAMERA_AI_MODE` defaults to `disabled` in `src/routes/api/camera-ai/verify.ts`.
- [x] `VITE_CAMERA_AI_ENABLED` defaults to `false` in `src/components/PublicCameraBlock.tsx`.
- [x] Production is protected by mandatory 503 status when disabled.
- [x] Environment variables (`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are read only inside server handlers.

### 2. Backend Logic (Phase 2 Solidification)
- [x] **OpenAI Responses API**: `openai.responses.parse` is implemented with `zodTextFormat`.
- [x] **Deterministic Gate**: `evaluateGate` enforces `confidence >= 0.90` and bans speculative terms.
- [x] **Idempotency**: `claim_camera_ai_attempt` (RPC) ensures exactly one inference per capture.
- [x] **Data Integrity**: Question is extracted from `published_content` on the server to prevent prompt injection.
- [x] **Sanitization**: Logs and responses do not leak image content or full prompts.

### 3. Frontend UX & Safety
- [x] **State Machine**: Component handles `analyzing`, `approved`, `retake`, `not_observable`, and `technical_failure`.
- [x] **Sequence Protection**: `requestSequenceRef` prevents stale responses from overwriting newer captures.
- [x] **Cleanup**: `URL.revokeObjectURL` used for all preview images.
- [x] **Binary Safety**: 3MB limit enforced with compression fallback.

### 4. Telemetry & Logs
- [x] Sanitized telemetry fields (tokens, model, duration, decision) are persisted in `camera_ai_attempts`.

## Technical Details

### Verification Flow (Preview Environment)
1. **User Captures**: Component increments sequence, aborts previous, generates UUID `idempotencyKey`.
2. **Server Auth**: Validates `responseToken` -> Gets `checklist_id` and `published_content`.
3. **Idempotency Claim**: Atomic RPC call. If already `processing` -> 409. If `completed` -> Replay.
4. **OpenAI Inference**: `gpt-4o-mini` analysis via structured outputs.
5. **Gate Evaluation**:
   ```typescript
   isApproved = target_visible && condition_observable && condition_met && 
                quality === "usable" && confidence >= 0.90 && !speculative_terms
   ```
6. **Persistence**: Approved result triggers image upload to Supabase Storage and `onAnswer` update.

### Verification Status
- **UI Tests**: 15/15 Passed.
- **Runtime Tests**: 16/16 Passed.
- **Typecheck**: Success.
- **Production Safety**: Confirmed `CAMERA_AI_MODE=disabled`.
