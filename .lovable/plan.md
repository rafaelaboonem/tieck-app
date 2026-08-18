# Plan - Patch 5B.9: Fix WorkspaceContext Runtime for Viewers

Fix the race condition and cache scoping in `WorkspaceContext` that prevents Viewers from seeing shared workspaces in the context selector.

## Proposed Changes

### 1. Unified Auth-Scoped Workspace Fetching
Refactor `WorkspaceContext.tsx` to use the canonical `useAuth` hook instead of independent `supabase.auth.getUser()` calls. This ensures:
- Workspaces are only fetched when a user is confirmed.
- The query key is user-scoped (`["workspaces", user.id]`), preventing cross-user cache leaks.
- Queries are automatically enabled/disabled based on auth state.

### 2. Elimination of Race Conditions
- The query will be `enabled: !authLoading && !!user`.
- Immediate cleanup of workspace state on logout.
- Invalidation of workspace cache on auth state transitions.

### 3. Context Selector Hardening
- Audit `DashboardLayout.tsx` to ensure the context switcher renders all fetched workspaces even when the current selection is "Personal".
- Confirm that `selection = 'personal'` only sets `currentWorkspace = null` and does not hide the list of available shared workspaces.

## Technical Details

### `src/contexts/WorkspaceContext.tsx`
- Import `useAuth` from `@/contexts/AuthContext`.
- Move `fetchWorkspacesQuery` inside `WorkspaceProvider` to use the authenticated Supabase client or pass the user ID explicitly.
- Update `useQuery` configuration:
  ```typescript
  queryKey: ["workspaces", user?.id],
  enabled: !authLoading && !!user,
  ```

### `src/components/DashboardLayout.tsx`
- Verify that `workspaces.map(...)` is rendered under "Espaços de Trabalho" section regardless of `workspaceStatus === 'personal'`.

## Verification Plan

### Automated Tests
- Update `src/contexts/__tests__/WorkspaceDiscovery.test.tsx` or create `src/contexts/__tests__/WorkspaceRaceCondition.test.tsx` to cover:
  1. Auth loading state (no fetch).
  2. Viewer login (fetch triggered).
  3. Logout (cleanup).
  4. Cache isolation between users.
  5. Personal context selection persistence vs visibility.

### Manual Verification
- Login as Viewer.
- Open context switcher.
- Confirm shared workspaces are visible.
- Switch between Personal and Workspace and confirm list remains available.
