# Plan: Camera AI Phase 3 Surgical Fix

Finalize Phase 3 of Camera AI in the production project `txqfdscdlltohpkkznwa`. This is a fail-closed semantic verification implementation using OpenAI's Structured Outputs (Responses API).

## User Review Required

> [!IMPORTANT]
> - This plan involves sensitive production authorization and semantic gates.
> - **Zero real inferences** will be executed during implementation.
> - **Zero production data** will be altered.
> - A new `npm run test:camera-ai` command will be configured to run all tests in the `tests/camera-ai` folder.

## Proposed Changes

### 1. Authorization & Security
- **Goal**: Implement real workspace-based authorization for policy compilation.
- **Action**: Update `src/routes/api/camera-ai/compile-policy.ts` to check workspace membership/ownership before calling OpenAI.
- **Rules**: 401 for unauthenticated, 403 for unauthorized workspace access.

### 2. OpenAI API Migration (Responses API)
- **Goal**: Use the correct `openai.responses.parse` method with `zodTextFormat`.
- **Action**: 
  - Refactor `compile-policy.ts` to use `openai.responses.parse` instead of `response_format`.
  - Create a dedicated `PolicyGenerationSchema` for model output (excluding `version`, `questionHash`, `source`).
  - Validate the final object with `CameraVerificationPolicyV1Schema.safeParse()`.

### 3. Consistent Hashing (SHA-256)
- **Goal**: Ensure frontend and backend use the same SHA-256 hex hash.
- **Action**:
  - Implement a testable helper in the frontend using `crypto.subtle.digest("SHA-256", ...)`.
  - Standardize the question normalization: `${title ?? ""} ${description ?? ""}`.trim().

### 4. Canonical Policy Contract
- **Goal**: Standardize on `requiredVisibleEvidence` and clean up legacy fields.
- **Action**:
  - Remove `requiredEvidence` from active use; keep only for hydration of legacy blocks.
  - Standardize `source` values: `"generated" | "owner_edited"`.
  - Drive the editor UI types directly from the shared Zod schema.

### 5. Fail-Closed Verification Runtime
- **Goal**: Block analysis if the policy is missing or divergent.
- **Action**:
  - Update `verify-handler.ts` to validate the policy (safeParse, version, hash) before any claim/rate-limit/OpenAI call.
  - Return `checklist_update_required` if invalid.

### 6. Technical Hardening
- **Goal**: Eliminate `any`, improve typings, and standardize Request IDs.
- **Action**:
  - Replace all `any` with concrete types in `openai-provider.ts` and `verify-handler.ts`.
  - Inject a single `requestId` from the route into the handler for consistent logging/persistence.
  - Sanitize public `user_message`: max 240 chars, remove technical jargon/JSON/markdown, fallback to deterministic gate-based messages.

### 7. Automated Testing
- **Goal**: Comprehensive test coverage for Phase 3.
- **Action**:
  - Update `package.json` to run all tests in `tests/camera-ai`.
  - Add specific tests for authorization, cache, payload formats, hash matching, and sanitization.

## Technical Details

### Authorization Snippet (Conceptual)
```ts
const { data: member } = await client
  .from('workspace_members')
  .select('id')
  .eq('workspace_id', checklist.workspace_id)
  .eq('user_id', user.id)
  .single();
// or check if user is workspace owner
```

### Responses API Parse Snippet
```ts
const response = await openai.responses.parse({
  model: "gpt-4o-mini",
  input: [...],
  text: {
    format: zodTextFormat(PolicyGenerationSchema, "camera_verification_policy")
  }
});
```

### Sanitization Logic
```ts
const cleanMessage = analysis.user_message
  .replace(/\{.*\}/g, '') // remove JSON-like strings
  .replace(/model|gpt|openai|ai/gi, '') // remove model names
  .substring(0, 240);
```
