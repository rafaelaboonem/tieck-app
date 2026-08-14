# Camera AI Phase 3: Semantic Verification and Fail-Closed Gate

Implement rigorous semantic analysis using a single OpenAI inference and a strict server-side gate.

## Technical Details

### 1. Updated Contracts & Schemas
- Update `CameraVerificationSchema` in `src/server/camera-ai/schema.ts`:
  ```typescript
  {
    target_visible: boolean;
    target_identity_confidence: number;
    condition_observable: boolean;
    condition_met: boolean;
    image_quality_usable: boolean;
    positive_visible_evidence: string[];
    negative_visible_evidence: string[];
    contradictions: string[];
    overall_confidence: number;
    user_message: string;
  }
  ```
- Update `CameraVerificationPolicyV1Schema` to include `targetDescription`, `conditionDescription`, `requiredVisibleEvidence`, `rejectionSignals`, `notObservableSignals`.

### 2. OpenAI Integration
- Update `SYSTEM_PROMPT` in `src/server/camera-ai/openai-provider.ts` to enforce strictly structured outputs and semantic separation.
- Ensure `analyzeImage` uses the new schema and sends the structured policy.

### 3. Server-Side Gate
- Refactor `evaluateGate` in `src/server/camera-ai/gate.ts`:
  - Enforce `target_visible === true` AND `target_identity_confidence >= 0.90` AND `condition_observable === true` AND `condition_met === true` AND `image_quality_usable === true`.
  - Check for at least one item in `positive_visible_evidence` and zero items in `contradictions`.
  - Enforce `overall_confidence >= 0.90`.
- Update `verify-handler.ts` to validate that the `version` and `questionHash` of the policy match the published snapshot.

### 4. Editor and Publication
- Update `src/routes/checklist.tsx` to ensure `cameraAiPolicy` is correctly populated in the `published_content`.
- Add auto-compilation logic if the question changes.

### 5. UI Updates
- Update `PublicCameraBlock.tsx` to display the new semantic messages and block submission until `approved` + `persisted`.

### 6. Testing
- Create `tests/camera-ai/phase3-gate.test.ts` to cover all semantic failure modes (wrong object, obstructed view, low confidence, contradictions).
- Verify no regressions in local quality engine or existing persistence flow.

## Steps

1. **Schema Update**: Modify `src/server/camera-ai/schema.ts` with Phase 3 contracts.
2. **Provider Update**: Update `src/server/camera-ai/openai-provider.ts` with new prompts and strict parsing.
3. **Gate Hardening**: Refactor `src/server/camera-ai/gate.ts` with fail-closed logic.
4. **Handler Update**: Update `src/server/camera-ai/verify-handler.ts` for policy integrity checks.
5. **Editor Sync**: Update `src/routes/checklist.tsx` for metadata persistence.
6. **Frontend UX**: Refactor `src/components/PublicCameraBlock.tsx` for semantic feedback.
7. **Verification**: Run full test suite and build.
