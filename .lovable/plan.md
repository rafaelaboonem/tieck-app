# Plan - Camera AI Phase 3.5 Surgical Hardening

Hardening the Camera AI Phase 3.5 implementation by fixing authentication, authorization, data storage assumptions, and UI regressions.

## User Review Required

> [!IMPORTANT]
> This plan involves critical security and architectural changes to the Camera AI test verification flow.

- **Authentication**: Switching from implicit session to explicit Bearer token validation for the test endpoint.
- **Authorization**: Restricting access to owners, admins, and editors of the specific workspace associated with the checklist.
- **Data Source**: Blocks will be read directly from the `checklists.blocks` JSONB column instead of a non-existent `blocks` table.
- **Contract**: `blockId` will be treated as a flexible string (8-10 chars) rather than a strict UUID.

## Proposed Changes

### Backend Hardening

#### [API] Test Verification Endpoint (`src/routes/api/camera-ai/test-verification.ts`)
- Implement explicit Bearer token authentication via `client.auth.getUser(token)`.
- Enforce `CAMERA_AI_MODE === 'enabled'` feature flag check.
- Refactor authorization:
  1. Fetch checklist by `checklistId` (including `blocks`, `workspace_id`, `user_id`).
  2. Verify ownership (`user_id === user.id`) OR active workspace membership (owner/admin/editor).
- Read block directly from `checklist.blocks` array.
- Update Zod schema to allow non-UUID `blockId` (e.g., `z.string().min(1).max(128)`).
- Normalize image size limit to strictly 3MB.
- Return standardized error codes: `401 unauthorized`, `403 forbidden`, `503 config_missing`, `503 camera_ai_disabled`.

### Frontend Refactor

#### [UI] Settings Panel (`src/components/camera-ai/CameraSettingsPanel.tsx`)
- Remove `any` types and implement `CameraDraft` and `CameraBlockPatch` interfaces.
- Pass `checklistId` correctly and ensure "Coming Soon" modes are strictly disabled.

#### [UI] Test Dialog (`src/components/camera-ai/CameraVerificationTestDialog.tsx`)
- Add explicit "AI consumption" warning.
- Implement memory safety: `URL.revokeObjectURL` when replacing images.
- Enforce 3MB limit and JPEG/PNG/WebP formats.
- Ensure camera tracks are closed and requests are aborted on close.
- Remove unused `policy` prop if redundant.

#### [UI] Block Card (`src/components/camera-ai/CameraBlockCard.tsx`)
- Remove the non-functional three-dot menu button.

### Testing & Quality

#### [Tests] Suite Enhancement
- Create `tests/camera-ai/test-verification.test.ts` covering all edge cases (auth, cross-workspace access, invalid blocks, etc.).
- Update UI tests (`tests/camera-ai/ui-refactor-v2.test.tsx`) to use stateful mocks for Accordion and verify visibility/cleanup.
- Verify everything with `npm run build` and `tsc --noEmit`.

## Technical Details

- **SHA-256 Hashing**: Use `crypto.createHash('sha256')` consistently.
- **Type Guards**: Use `isPublishedBlock(b: unknown): b is PublishedBlock` for safe JSON handling.
- **Memory Management**: Use `AbortController` and `revocation` logic for all blob URLs.
- **Security**: The test endpoint will NOT interact with `camera_ai_attempts`, `checklist_evidences`, or any operational storage buckets.
