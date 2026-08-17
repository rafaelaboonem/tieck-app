# Recovery and Auth Execution (Fase 4B.9)

Recover "Casa 2" editor blocks and implement authenticated execution.

## Database Recovery
- **Target:** Checklist `a050976c-d5ed-44a0-af45-791a2c558dd8`.
- **Action:** Migration `20260817034500_restore_casa2_blocks.sql` to copy `published_content->'blocks'` into `blocks`.
- **Validation:** Compare `blocks` (empty) vs `published_content` (1 camera block) before execution.

## Authenticated Execution Interface
- **Shared Component:** Extract `ExecutionEngine` from `src/routes/c.$id.tsx` to `src/components/ExecutionEngine.tsx`.
- **New Route:** `src/routes/executar.$id.tsx`.
- **Route Logic:**
  - Wraps `ExecutionEngine` in `DashboardLayout`.
  - Authenticated via `useAuth`.
  - Authorized via `useWorkspaceRBAC` (requires membership).
  - No editor/publish UI.

## Routing Logic Updates
- **src/routes/checklist.tsx:** Update `ChecklistAuthGuard` to redirect `execution_only` to `/executar/$id`.
- **src/routes/inicio.tsx:** Viewers navigate to `/executar/$id`.
- **src/components/DashboardLayout.tsx:** "Recent" links for Viewers go to `/executar/$id`.
- **src/routes/c.$id.tsx:** Stays public, no sidebar, same shared `ExecutionEngine`.

## Technical Details
- Shared `ExecutionEngine` handles:
  - Responses session (sessionStorage).
  - OpenAI verification calls.
  - Form submission.
  - i18n support.
- Permissions: Authenticated execution uses user's session, RLS for `checklist_responses` applies.

## Validation Plan
1. **Recovery:** Query Supabase to confirm "Casa 2" `blocks` is restored.
2. **Owner Access:** Open `/checklist?id=...` and verify blocks appear.
3. **Viewer Access:** Open `/executar/...` and verify sidebar + camera question.
4. **Public Access:** Open `/c/...` and verify no sidebar + camera question.
5. **Security:** Verify Viewer cannot access `/checklist?id=...` (redirected).
