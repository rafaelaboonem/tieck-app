# Plan: Phase 5B.10 — Canonical RBAC Fail-Closed & Assignment Visibility

Implementation of Phase 5B.10 to fix the "Fail-Open" RBAC vulnerability and ensure Viewers only see their assigned checklists.

## Technical Details

### 1. Database Layer (RPCs)
- Create `public.get_my_workspace_access(p_workspace_id uuid)`:
    - Returns `(role, workspace_member_id, is_owner)`.
    - Uses `auth.uid()` for server-side identity validation.
    - `SECURITY DEFINER` for bypassing RLS safely.
    - Explicit `REVOKE` from public/anon and `GRANT` to authenticated/service_role.
- Create `public.list_my_checklist_assignments(p_workspace_id uuid)`:
    - Returns assignments for the authenticated user in the specified workspace.
    - Used by Viewers to filter checklists deterministically.

### 2. Hook Hardening (`src/hooks/useWorkspaceRBAC.ts`)
- Replace direct `workspace_members` SELECT with `get_my_workspace_access` RPC.
- Expose `workspaceMemberId` and `hasAccess` in the return object.
- Ensure `role = null` results in `hasAccess = false`, implementing the fail-closed pattern.
- Update `queryKey` to include `user.id` and `workspaceId` for strict cache isolation.

### 3. Frontend Visibility (`/inicio` & `DashboardLayout`)
- **Refactor `/inicio.tsx`**:
    - Block data fetching while `rbacLoading` is true.
    - If `isViewer`, use `list_my_checklist_assignments` RPC to get `assignedIds`.
    - If `role` is null or resolution fails, ensure `setChecklists([])` is called immediately.
- **Refactor `DashboardLayout.tsx`**:
    - Apply the same fail-closed logic to "Recentes" and global search (CommandDialog).
    - Use `workspaceMemberId` from the hook instead of redundant lookups.

### 4. Verification
- Vitest: `src/hooks/__tests__/rbac-canonical.test.ts` (new tests).
- Production build: `npm run build`.

## User-facing changes
- Viewers will now strictly see only checklists assigned to them in shared workspaces.
- "Recentes" and Search will correctly reflect these permissions.
- Switching between workspaces (e.g., personal vs shared) will trigger a fresh, secure permission check.
